"use client";
import * as React from "react";
import {
  Activity,
  ArrowRight,
  ChevronDown,
  Cpu,
  FileWarning,
  GitBranch,
  ListChecks,
  Lock,
  Play,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  Users,
  Wand2,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { ConsensusPanel } from "@/components/ConsensusPanel";
import { TxStatus } from "@/components/TxStatus";
import { mapWalletError, type WalletController } from "@/hooks/useWallet";
import { humanizeReadError, submitAndWait, tryReadMethod } from "@/lib/genlayer";
import { GUARDIAN_ADDRESS } from "@/lib/chain";
import { cn, shortHex } from "@/lib/utils";
import type {
  Assessment,
  EvidenceItem,
  HistoryEntry,
  Incident,
  Policy,
  ProtocolState,
  TxOutcome,
} from "@/lib/types";

const SOURCE_TYPES = ["ONCHAIN_VERIFIED", "EXTERNAL", "USER_CLAIM"] as const;

type Tab = "orchestrate" | "report" | "evidence" | "governance";

interface Snapshot {
  ids: string[];
  incident: Incident | null;
  assessment: Assessment | null;
  evidence: EvidenceItem[];
  history: HistoryEntry[];
  protocol: ProtocolState | null;
  policy: Policy | null;
  hint: null;
  version: number | null;
  paused: boolean;
  pauseSupported: boolean;
}

/** Calldata can arrive as a real array or as a JSON string, depending on the SDK path. */
function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item));
    } catch {
      return [];
    }
  }
  return [];
}

function sameIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

const EMPTY: Snapshot = {
  ids: [],
  incident: null,
  assessment: null,
  evidence: [],
  history: [],
  protocol: null,
  policy: null,
  hint: null,
  version: null,
  paused: false,
  pauseSupported: false,
};

const phaseTone: Record<string, BadgeTone> = {
  NORMAL: "ok",
  EMERGENCY_PENDING: "warn",
  EMERGENCY_ACTIVE: "bad",
  RECOVERY_PENDING: "warn",
  RECOVERED: "info",
};

const statusTone: Record<string, BadgeTone> = {
  SUBMITTED: "neutral",
  UNDER_INVESTIGATION: "info",
  CONFIRMED: "bad",
  REJECTED: "ok",
  INCONCLUSIVE: "warn",
  RESOLVED: "ok",
};

/**
 * Reports are public, so every wallet sees the whole list. Remembering which
 * ids this browser filed lets the console preselect the visitor's own incident
 * instead of dumping someone else's flow on a first-time visitor.
 */
function mineKey(contract: string) {
  return `gg:my-reports:${contract.toLowerCase()}`;
}

function readMineIds(contract: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(mineKey(contract));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
}

function writeMineIds(contract: string, ids: string[]) {
  try {
    window.localStorage.setItem(mineKey(contract), JSON.stringify(ids.slice(-50)));
  } catch {
    // Private mode / disabled storage: ownership is then inferred from reporter.
  }
}

type NextAction =
  | { kind: "tab"; tab: Tab }
  | {
      kind: "write";
      key: string;
      fn: string;
      args: unknown[];
      rotations?: number;
    };

interface NextStepView {
  title: string;
  body: string;
  cta?: {
    label: string;
    action: NextAction;
    variant?: "primary" | "danger" | "outline" | "subtle";
    busyKey?: string;
    loadingText?: string;
    icon?: React.ReactNode;
  };
}

/**
 * Pure: the recommended step is described as data, so rendering never captures
 * a closure over a ref (which the React rules reject) and the whole flow is
 * easy to read in one place.
 */
function computeNextStep({
  incidentId,
  status,
  phase,
  hasAssessment,
}: {
  incidentId: string;
  status?: string;
  phase: string;
  hasAssessment: boolean;
}): NextStepView {
  if (!incidentId) {
    return {
      title: "Start with a report of your own",
      body: "The list above holds every report on this contract, including other wallets' submissions. File one to get an incident you can drive through the lifecycle, or select an existing row to inspect it.",
      cta: {
        label: "Open the report form",
        action: { kind: "tab", tab: "report" },
        icon: <FileWarning className="size-3.5" />,
      },
    };
  }
  if (phase === "EMERGENCY_PENDING") {
    return {
      title: "Confirm the pause",
      body: "Initiation only armed the protocol. A second transaction applies the pause — that is why a single click can never halt a contract.",
      cta: {
        label: "Confirm & pause",
        action: {
          kind: "write",
          key: "confirmEmergency",
          fn: "confirmEmergency",
          args: [incidentId],
        },
        variant: "danger",
        busyKey: "confirmEmergency",
        loadingText: "Pausing",
        icon: <Lock className="size-3.5" />,
      },
    };
  }
  if (phase === "EMERGENCY_ACTIVE") {
    return {
      title: "Recovery is a governance action",
      body: "The protocol is paused and locked. Only the governance wallet can request recovery; anyone may then confirm it after the request is final.",
      cta: {
        label: "Request recovery",
        action: {
          kind: "write",
          key: "requestRecovery",
          fn: "requestRecovery",
          args: [incidentId, "exploit contained — resuming monitored operation"],
        },
        variant: "outline",
        busyKey: "requestRecovery",
        loadingText: "Requesting",
        icon: <Unlock className="size-3.5" />,
      },
    };
  }
  if (phase === "RECOVERY_PENDING") {
    return {
      title: "Confirm the recovery",
      body: "Recovery has been requested. Confirming unpauses the protocol and clears the lock.",
      cta: {
        label: "Confirm recovery",
        action: {
          kind: "write",
          key: "confirmRecovery",
          fn: "confirmRecovery",
          args: [incidentId],
        },
        busyKey: "confirmRecovery",
        loadingText: "Unpausing",
        icon: <ShieldCheck className="size-3.5" />,
      },
    };
  }
  if (phase === "RECOVERED") {
    return {
      title: "Finish the cycle",
      body: "The protocol has recovered. Resetting returns it to NORMAL and clears the active incident.",
      cta: {
        label: "Reset to normal",
        action: { kind: "write", key: "reset", fn: "resetToNormal", args: [] },
        variant: "subtle",
        busyKey: "reset",
        loadingText: "Resetting",
      },
    };
  }
  if (status === "SUBMITTED") {
    return {
      title: "Start the investigation",
      body: "Moves SUBMITTED → UNDER_INVESTIGATION. The contract requires at least one evidence row before an incident can be investigated.",
      cta: {
        label: "Start investigation",
        action: {
          kind: "write",
          key: "startInvestigation",
          fn: "startInvestigation",
          args: [incidentId],
        },
        busyKey: "startInvestigation",
        loadingText: "Starting",
        icon: <Play className="size-3.5" />,
      },
    };
  }
  if (status === "UNDER_INVESTIGATION" && !hasAssessment) {
    return {
      title: "Run the AI assessment",
      body: "Every validator runs the LLM and fetches your sources, then must agree. Expect about a minute, and a possible MAJORITY_DISAGREE retry that writes nothing.",
      cta: {
        label: "Run AI assess",
        action: {
          kind: "write",
          key: "assess",
          fn: "assess",
          args: [incidentId],
          rotations: 5,
        },
        busyKey: "assess",
        loadingText: "AI consensus…",
        icon: <Wand2 className="size-3.5" />,
      },
    };
  }
  if (status === "UNDER_INVESTIGATION") {
    return {
      title: "Sync the decision",
      body: "Turns the stored assessment into a decision: CONFIRMED, REJECTED or INCONCLUSIVE. Only CONFIRMED unlocks the emergency powers.",
      cta: {
        label: "Sync decision",
        action: {
          kind: "write",
          key: "syncDecision",
          fn: "syncDecision",
          args: [incidentId],
        },
        busyKey: "syncDecision",
        loadingText: "Deciding",
        icon: <GitBranch className="size-3.5" />,
      },
    };
  }
  if (status === "CONFIRMED") {
    return {
      title: "Initiate the emergency",
      body: "Checks the policy gates (threat level, confidence, corroborating sources, cooldown) before arming a pause for this incident.",
      cta: {
        label: "Initiate emergency",
        action: {
          kind: "write",
          key: "initiate",
          fn: "initiateEmergency",
          args: [incidentId],
        },
        variant: "danger",
        busyKey: "initiate",
        loadingText: "Checking gates",
        icon: <ShieldAlert className="size-3.5" />,
      },
    };
  }
  if (status === "RESOLVED") {
    return {
      title: "This incident is closed",
      body: "Its history is final. Reopen it with reassess if new evidence arrives, or select another incident from the list.",
    };
  }
  return {
    title: "Decide what happens next",
    body: "The AI rejected or could not decide this incident. Add corroborating evidence and reassess, or resolve it as a false positive.",
    cta: {
      label: "Reassess",
      action: {
        kind: "write",
        key: "reassess",
        fn: "reassess",
        args: [incidentId],
      },
      variant: "outline",
      busyKey: "reassess",
      loadingText: "Reopening",
      icon: <Cpu className="size-3.5" />,
    },
  };
}

function Section({
  title,
  icon,
  meta,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-line bg-panel/80">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="text-signal">{icon}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-text">
            {title}
          </span>
          {meta}
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="border-t border-line px-4 py-4">{children}</div>}
    </section>
  );
}

function StepButton({
  icon,
  label,
  hint,
  disabled,
  disabledReason,
  loading,
  loadingText,
  onClick,
  variant = "outline",
  governanceOnly = false,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled: boolean;
  disabledReason?: string;
  loading: boolean;
  loadingText: string;
  onClick: () => void;
  variant?: "outline" | "primary" | "danger" | "subtle";
  governanceOnly?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line/70 bg-ink-2/40 p-2.5">
      <Button
        variant={variant}
        onClick={onClick}
        loading={loading}
        loadingText={loadingText}
        disabled={disabled}
        icon={icon}
        className="w-full"
        title={disabledReason}
      >
        {label}
      </Button>
      <p className="mt-1.5 text-[10.5px] leading-snug text-muted/75">{hint}</p>
      {governanceOnly && (
        <p className="mt-1 flex items-center gap-1 text-[10px] text-warn/90">
          <Lock className="size-2.5" aria-hidden="true" /> governance wallet only
        </p>
      )}
    </div>
  );
}

function StepGroup({
  index,
  title,
  hint,
  children,
}: {
  index: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-[10px] text-signal/80">{index}</span>
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        <span className="text-[10.5px] text-muted/70">{hint}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function StartStep({
  step,
  title,
  body,
  action,
}: {
  step: string;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <li className="rounded-xl border border-signal/20 bg-ink-2/40 p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-full border border-signal/40 font-mono text-[10px] text-signal">
          {step}
        </span>
        <p className="text-xs font-semibold text-text">{title}</p>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{body}</p>
      <div className="mt-2">{action}</div>
    </li>
  );
}

export function IncidentConsole({
  wallet,
  onConnect,
}: {
  wallet: WalletController;
  onConnect: () => void;
}) {
  const [snapshot, setSnapshot] = React.useState<Snapshot>(EMPTY);
  const [selected, setSelected] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [readError, setReadError] = React.useState<string | null>(null);
  const [tx, setTx] = React.useState<TxOutcome>({ phase: "idle" });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("orchestrate");
  const [mine, setMine] = React.useState<string[]>([]);

  // Synchronous guard: a second click can never start a second transaction.
  const inFlight = React.useRef(false);
  // Read synchronously by `load` so an initial refresh cannot miss the ids.
  const mineRef = React.useRef<string[]>([]);
  const autoRouted = React.useRef(false);

  const rememberMine = React.useCallback((incidentId: string) => {
    if (!incidentId) return;
    const next = Array.from(new Set([...mineRef.current, incidentId]));
    mineRef.current = next;
    setMine(next);
    writeMineIds(GUARDIAN_ADDRESS, next);
  }, []);

  const load = React.useCallback(async (preferred?: string) => {
    // Nothing is written to state before the first await: an effect may kick
    // this off, and the React rule set rejects synchronous setState there.
    // Callers own the "refreshing" flag.
    try {
      // Deliberately few reads: get_state already carries policy version, paused
      // flag, governance and history length, and studionet caps reads at 30/min.
      const [rawIds, protocol, policy] = await Promise.all([
        tryReadMethod<unknown>("get_incident_ids", [], []),
        tryReadMethod<ProtocolState | null>("get_state", [], null),
        tryReadMethod<Policy | null>("get_policy", [], null),
      ]);

      // Re-read on every refresh so a report filed in another tab is picked up.
      const stored = readMineIds(GUARDIAN_ADDRESS);
      mineRef.current = stored;
      setMine((current) => (sameIds(current, stored) ? current : stored));

      const list = normalizeList(rawIds);
      // Preselect only something this browser filed. Falling back to the last
      // global incident showed a stranger's report as if it were the visitor's.
      const own = stored.filter((id) => list.includes(id));
      const target =
        (preferred && list.includes(preferred) ? preferred : "") ||
        (selected && list.includes(selected) ? selected : "") ||
        own[own.length - 1] ||
        "";

      const [incident, assessment, evidence, history] = target
        ? await Promise.all([
            tryReadMethod<Incident | null>("get_incident", [target], null),
            tryReadMethod<Assessment | null>("get_assessment", [target], null),
            tryReadMethod<EvidenceItem[]>(
              "get_evidence_for_incident",
              [target],
              [],
            ),
            tryReadMethod<HistoryEntry[]>("get_history", [target], []),
          ])
        : [null, null, [], []];

      setSnapshot({
        ids: list,
        incident,
        assessment,
        evidence: Array.isArray(evidence) ? evidence : [],
        history: Array.isArray(history) ? history : [],
        protocol,
        policy,
        hint: null,
        version: Number(protocol?.policy_version ?? 0),
        paused: Boolean(protocol?.paused),
        pauseSupported: false,
      });
      setSelected(target);
      setReadError(null);

      // A visitor with nothing selected has no actionable screen, so open the
      // form that creates their first incident instead of an empty action grid.
      if (!target && !autoRouted.current) {
        autoRouted.current = true;
        setTab("report");
      }
    } catch (error) {
      setReadError(humanizeReadError(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selected]);

  React.useEffect(() => {
    // The first read is scheduled, not run in the effect body: `load` writes
    // state, and a synchronous write here would cascade a render. The timer
    // keeps it a callback, which is what the effect is allowed to do.
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const runWrite = async (
    key: string,
    functionName: string,
    args: unknown[],
    options?: {
      consensusMaxRotations?: number;
      successRefresh?: string;
      onSuccess?: () => void;
    },
  ) => {
    if (inFlight.current) return; // belt and braces: ref + disabled buttons
    if (!wallet.account) {
      setTx({
        phase: "error",
        message: "Connect a wallet first — writes must be signed by an account.",
      });
      return;
    }
    if (!wallet.isCorrectChain) {
      setTx({
        phase: "error",
        message: "Wrong network. Switch your wallet to Genlayer Studio Network.",
      });
      return;
    }
    const provider = wallet.provider.current;
    if (!provider) {
      setTx({ phase: "error", message: "Wallet provider is not available." });
      return;
    }

    inFlight.current = true;
    setBusy(key);
    setTx({ phase: "submitting" });

    try {
      const outcome = await submitAndWait({
        provider,
        account: wallet.account,
        functionName,
        args,
        consensusMaxRotations: options?.consensusMaxRotations,
        onUpdate: (patch) => setTx((current) => ({ ...current, ...patch })),
      });
      if (outcome.phase === "success") {
        await load(options?.successRefresh ?? selected);
        options?.onSuccess?.();
      }
    } catch (caught) {
      setTx({ phase: "error", message: mapWalletError(caught).message });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const incident = snapshot.incident;
  const status = incident?.status;
  const phase = snapshot.protocol?.state ?? "NORMAL";
  const iid = selected;
  const canWrite = Boolean(wallet.account) && wallet.isCorrectChain;
  const mineIds = snapshot.ids.filter((id) => mine.includes(id));
  const ownedCount = mineIds.length;
  const isGovernance = Boolean(
    wallet.account &&
      snapshot.protocol?.governance &&
      snapshot.protocol.governance.toLowerCase() === wallet.account.toLowerCase(),
  );
  const yours = Boolean(
    iid &&
      (mine.includes(iid) ||
        (incident?.reporter &&
          wallet.account &&
          incident.reporter.toLowerCase() === wallet.account.toLowerCase())),
  );
  const decided = Boolean(
    status && ["CONFIRMED", "REJECTED", "INCONCLUSIVE"].includes(status),
  );

  const next = computeNextStep({
    incidentId: iid,
    status,
    phase,
    hasAssessment: Boolean(snapshot.assessment),
  });

  const runNextStep = () => {
    const cta = next.cta;
    if (!cta) return;
    if (cta.action.kind === "tab") {
      setTab(cta.action.tab);
      return;
    }
    void runWrite(cta.action.key, cta.action.fn, cta.action.args, {
      consensusMaxRotations: cta.action.rotations,
    });
  };

  const refresh = () => {
    setRefreshing(true);
    void load(selected);
  };

  const blocked = (allowed: boolean, reason: string) =>
    !canWrite
      ? "Connect a wallet on Genlayer Studio Network first."
      : allowed
        ? undefined
        : reason;

  function actionDisabled(condition: boolean) {
    return busy !== null || !canWrite || !condition;
  }

  const run = (key: string, fn: string, args: unknown[], rotations?: number) =>
    void runWrite(key, fn, args, { consensusMaxRotations: rotations });

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "orchestrate", label: "Lifecycle" },
    { id: "report", label: "Report" },
    { id: "evidence", label: "Evidence" },
    { id: "governance", label: "Governance" },
  ];

  return (
    <div className="space-y-4">
      {/* Protocol strip */}
      <div className="grid gap-3 rounded-2xl border border-line bg-panel/85 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="mono-label">Protocol state</p>
          <div className="mt-1.5 flex items-center gap-2">
            <Badge tone={phaseTone[phase] ?? "neutral"} dot>
              {phase}
            </Badge>
            {snapshot.paused ? (
              <Badge tone="bad">
                <Lock className="mr-1 size-2.5" /> paused
              </Badge>
            ) : (
              <Badge tone="neutral">
                <Unlock className="mr-1 size-2.5" /> live
              </Badge>
            )}
          </div>
        </div>
        <div>
          <p className="mono-label">Policy</p>
          <p className="mt-1.5 font-mono text-sm">
            v{snapshot.version ?? "—"}
            {snapshot.policy ? (
              <span className="ml-2 text-[10px] text-muted">
                {snapshot.policy.allowed_threat_levels?.join("/")} · ≥
                {snapshot.policy.min_corroborating_sources} src
              </span>
            ) : null}
          </p>
        </div>
        <div>
          <p className="mono-label">Incidents</p>
          <p className="mt-1.5 font-mono text-sm">
            {snapshot.ids.length}
            <span className="ml-2 text-[10px] text-muted">
              {ownedCount} filed by you
            </span>
          </p>
        </div>
        <div>
          <p className="mono-label">Contract</p>
          <p className="mt-1.5 truncate font-mono text-xs" title={GUARDIAN_ADDRESS}>
            {shortHex(GUARDIAN_ADDRESS, 8, 6)}
          </p>
        </div>
      </div>

      <TxStatus
        outcome={tx}
        walletName={wallet.activeRdns ?? undefined}
        onDismiss={() => setTx({ phase: "idle" })}
      />

      {!canWrite && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/[0.06] px-4 py-3 text-sm">
          <span className="text-warn">
            {wallet.account
              ? "Wrong network — switch to Genlayer Studio Network to send transactions."
              : "Reads work without a wallet. Connect MetaMask or Rabby to send transactions."}
          </span>
          {wallet.account ? (
            <Button size="sm" variant="subtle" onClick={() => void wallet.switchNetwork()}>
              Switch network
            </Button>
          ) : (
            <Button size="sm" variant="subtle" onClick={onConnect}>
              Connect wallet
            </Button>
          )}
        </div>
      )}

      {readError && (
        <div className="rounded-xl border border-bad/40 bg-bad/[0.07] px-4 py-3 text-sm text-bad">
          {readError}
        </div>
      )}

      {(!wallet.account || ownedCount === 0) && (
        <section className="rounded-2xl border border-signal/25 bg-signal/[0.05] p-4">
          <div className="flex items-center gap-2">
            <ArrowRight className="size-4 text-signal" aria-hidden="true" />
            <p className="mono-label text-signal">Start here</p>
          </div>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted">
            This contract is shared by every wallet. To run your own flow, follow
            these three steps — the console preselects your report afterwards.
          </p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            <StartStep
              step="1"
              title="Connect a wallet"
              body="MetaMask or Rabby on Genlayer Studio Network. Reads below work without it."
              action={
                wallet.account ? (
                  <Badge tone={wallet.isCorrectChain ? "ok" : "warn"} dot>
                    {wallet.isCorrectChain ? "connected" : "wrong network"}
                  </Badge>
                ) : (
                  <Button size="sm" variant="subtle" onClick={onConnect}>
                    Connect wallet
                  </Button>
                )
              }
            />
            <StartStep
              step="2"
              title="File a report"
              body="submit_report stores your incident on-chain; it is tagged “yours” in the list."
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTab("report")}
                  icon={<FileWarning className="size-3.5" />}
                >
                  Open report form
                </Button>
              }
            />
            <StartStep
              step="3"
              title="Move it forward"
              body="Start the investigation, run the AI assess, then sync the decision."
              action={
                <Button size="sm" variant="ghost" onClick={() => setTab("orchestrate")}>
                  Open lifecycle
                </Button>
              }
            />
          </ol>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {/* Incident list */}
          <section className="rounded-2xl border border-line bg-panel/85">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 text-signal" aria-hidden="true" />
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-text">
                  Incidents on this contract
                </h2>
                <Badge tone="neutral">{snapshot.ids.length}</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={refresh}
                loading={refreshing}
                loadingText="Reading"
              >
                Refresh
              </Button>
            </header>
            <div className="p-3">
              {loading && snapshot.ids.length === 0 ? (
                <div className="space-y-2" aria-hidden="true">
                  {[0, 1].map((row) => (
                    <div
                      key={row}
                      className="h-11 animate-pulse rounded-lg bg-panel-2/70"
                    />
                  ))}
                </div>
              ) : snapshot.ids.length === 0 ? (
                <p className="px-1 py-3 text-xs leading-relaxed text-muted">
                  No incidents on this contract yet. Yours would be the first —
                  open the report form below.
                </p>
              ) : (
                <>
                  <p className="mb-2 px-1 text-[10.5px] leading-snug text-muted/70">
                    Status is read when you select a row, to stay inside the
                    studionet read limit. Rows tagged “yours” came from this
                    browser.
                  </p>
                  <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
                    {snapshot.ids.map((id) => {
                      const active = id === iid;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                              setSelected(id);
                              setTab("orchestrate");
                              setRefreshing(true);
                              void load(id);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                              active
                                ? "border-signal/45 bg-signal/[0.07]"
                                : "border-line/60 bg-ink-2/40 hover:border-line hover:bg-ink-2/70",
                            )}
                          >
                            <span className="truncate font-mono text-xs text-text">
                              {id}
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {mine.includes(id) && (
                                <Badge tone="signal">yours</Badge>
                              )}
                              {active && status ? (
                                <Badge tone={statusTone[status] ?? "neutral"} dot>
                                  {status}
                                </Badge>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <button
                type="button"
                onClick={() => setTab("report")}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted transition-colors hover:border-signal/40 hover:text-signal"
              >
                <Plus className="size-3.5" aria-hidden="true" /> Report a new
                incident
              </button>
            </div>
          </section>

          {/* Active incident */}
          {incident ? (
            <section className="rounded-2xl border border-line bg-panel/85">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="mono-label">Active incident</p>
                  <p className="mt-0.5 truncate font-mono text-sm text-text">
                    {incident.incident_id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {yours && <Badge tone="signal">yours</Badge>}
                  <Badge tone={status ? statusTone[status] ?? "neutral" : "neutral"} dot>
                    {status ?? "—"}
                  </Badge>
                </div>
              </header>
              <dl className="grid gap-x-4 gap-y-2 px-4 py-3 text-xs sm:grid-cols-3">
                <div>
                  <dt className="mono-label">Target</dt>
                  <dd className="truncate font-mono text-text/90" title={incident.contract_address}>
                    {incident.contract_address}
                  </dd>
                </div>
                <div>
                  <dt className="mono-label">Network</dt>
                  <dd className="font-mono text-text/90">{incident.network}</dd>
                </div>
                <div>
                  <dt className="mono-label">Reported by</dt>
                  <dd className="truncate font-mono text-text/90" title={incident.reporter}>
                    {incident.reporter ? shortHex(incident.reporter, 8, 6) : "—"}
                    {yours ? " (you)" : ""}
                  </dd>
                </div>
              </dl>
              <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">
                {incident.description}
              </p>
            </section>
          ) : (
            <section className="rounded-2xl border border-dashed border-line bg-panel/60 p-5 text-center">
              <Users className="mx-auto size-5 text-muted/70" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-text">
                No incident selected
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
                Reports from other wallets are listed above but never selected for
                you. Pick a row to inspect it, or file your own report to start a
                lifecycle you control.
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="subtle"
                onClick={() => setTab("report")}
                icon={<FileWarning className="size-3.5" />}
              >
                Report an incident
              </Button>
            </section>
          )}

          {/* Actions */}
          <section className="rounded-2xl border border-line bg-panel/85">
            <div
              role="tablist"
              aria-label="Console sections"
              className="flex flex-wrap gap-1 border-b border-line px-3 pt-2"
            >
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`tab-${item.id}`}
                  aria-selected={tab === item.id}
                  aria-controls={`panel-${item.id}`}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "rounded-t-lg px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors",
                    tab === item.id
                      ? "bg-panel-2/80 text-signal"
                      : "text-muted hover:text-text",
                  )}
                >
                  {item.label}
                  {item.id === "report" && ownedCount === 0 ? (
                    <span className="ml-1.5 inline-block size-1.5 rounded-full bg-signal align-middle" />
                  ) : null}
                </button>
              ))}
            </div>

            <div
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
              className="p-4"
            >
              {tab === "orchestrate" && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-signal/30 bg-signal/[0.06] p-3.5">
                    <p className="mono-label text-signal/90">Recommended next step</p>
                    <p className="mt-1 text-sm font-semibold text-text">{next.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {next.body}
                    </p>
                    {next.cta ? (
                      <Button
                        className="mt-3 w-full sm:w-auto"
                        variant={next.cta.variant ?? "primary"}
                        onClick={runNextStep}
                        loading={Boolean(next.cta.busyKey) && busy === next.cta.busyKey}
                        loadingText={next.cta.loadingText ?? "Working"}
                        disabled={busy !== null || !canWrite}
                        icon={next.cta.icon}
                        title={
                          canWrite
                            ? undefined
                            : "Connect a wallet on Genlayer Studio Network first."
                        }
                      >
                        {next.cta.label}
                      </Button>
                    ) : null}
                  </div>

                  <StepGroup
                    index="01"
                    title="Investigation"
                    hint="Required before any emergency power is available"
                  >
                    <StepButton
                      icon={<Play className="size-3.5" />}
                      label="Start investigation"
                      hint="SUBMITTED → UNDER_INVESTIGATION. Needs at least one evidence row."
                      disabled={actionDisabled(status !== "SUBMITTED")}
                      disabledReason={blocked(
                        status === "SUBMITTED",
                        `Requires status SUBMITTED (currently ${status ?? "no incident"}).`,
                      )}
                      loading={busy === "startInvestigation"}
                      loadingText="Starting"
                      onClick={() => run("startInvestigation", "startInvestigation", [iid])}
                    />
                    <StepButton
                      icon={<Wand2 className="size-3.5" />}
                      label="Run AI assess"
                      hint="LLM + web fetch on every validator. May return MAJORITY_DISAGREE; nothing is written then — retry."
                      variant="primary"
                      disabled={actionDisabled(status !== "UNDER_INVESTIGATION")}
                      disabledReason={blocked(
                        status === "UNDER_INVESTIGATION",
                        `Requires status UNDER_INVESTIGATION (currently ${status ?? "no incident"}).`,
                      )}
                      loading={busy === "assess"}
                      loadingText="AI consensus…"
                      onClick={() => run("assess", "assess", [iid], 5)}
                    />
                    <StepButton
                      icon={<GitBranch className="size-3.5" />}
                      label="Sync decision"
                      hint="Stores CONFIRMED / REJECTED / INCONCLUSIVE from the latest assessment."
                      disabled={actionDisabled(status !== "UNDER_INVESTIGATION")}
                      disabledReason={blocked(
                        status === "UNDER_INVESTIGATION",
                        `Requires status UNDER_INVESTIGATION (currently ${status ?? "no incident"}).`,
                      )}
                      loading={busy === "syncDecision"}
                      loadingText="Deciding"
                      onClick={() => run("syncDecision", "syncDecision", [iid])}
                    />
                    <StepButton
                      icon={<Cpu className="size-3.5" />}
                      label="Reassess"
                      hint="Reopens a decided incident for another assessment round."
                      disabled={actionDisabled(!decided)}
                      disabledReason={blocked(
                        decided,
                        "Requires a decided incident (CONFIRMED, REJECTED or INCONCLUSIVE).",
                      )}
                      loading={busy === "reassess"}
                      loadingText="Reopening"
                      onClick={() => run("reassess", "reassess", [iid])}
                    />
                  </StepGroup>

                  <StepGroup
                    index="02"
                    title="Emergency response"
                    hint="Two phases: initiate never pauses on its own"
                  >
                    <StepButton
                      icon={<ShieldAlert className="size-3.5" />}
                      label="Initiate emergency"
                      hint="Policy gates: allowed threat level, confidence, corroborating sources, cooldown."
                      variant="danger"
                      disabled={actionDisabled(phase === "NORMAL" && status === "CONFIRMED")}
                      disabledReason={blocked(
                        phase === "NORMAL" && status === "CONFIRMED",
                        `Requires protocol NORMAL and a CONFIRMED incident (now ${phase} / ${status ?? "no incident"}).`,
                      )}
                      loading={busy === "initiate"}
                      loadingText="Checking gates"
                      onClick={() => run("initiate", "initiateEmergency", [iid])}
                    />
                    <StepButton
                      icon={<Lock className="size-3.5" />}
                      label="Confirm & pause"
                      hint="Applies the pause. Only valid while the protocol is EMERGENCY_PENDING."
                      variant="danger"
                      disabled={actionDisabled(phase === "EMERGENCY_PENDING")}
                      disabledReason={blocked(
                        phase === "EMERGENCY_PENDING",
                        `Requires protocol EMERGENCY_PENDING (now ${phase}).`,
                      )}
                      loading={busy === "confirmEmergency"}
                      loadingText="Pausing"
                      onClick={() => run("confirmEmergency", "confirmEmergency", [iid])}
                    />
                    <StepButton
                      icon={<Unlock className="size-3.5" />}
                      label="Request recovery"
                      hint="Asks to unpause an active emergency. Only the governance wallet may call it."
                      governanceOnly
                      disabled={actionDisabled(phase === "EMERGENCY_ACTIVE" && isGovernance)}
                      disabledReason={blocked(
                        phase === "EMERGENCY_ACTIVE" && isGovernance,
                        phase !== "EMERGENCY_ACTIVE"
                          ? `Requires protocol EMERGENCY_ACTIVE (now ${phase}).`
                          : "Only the governance wallet may request recovery.",
                      )}
                      loading={busy === "requestRecovery"}
                      loadingText="Requesting"
                      onClick={() =>
                        run("requestRecovery", "requestRecovery", [
                          iid,
                          "exploit contained — resuming monitored operation",
                        ])
                      }
                    />
                    <StepButton
                      icon={<ShieldCheck className="size-3.5" />}
                      label="Confirm recovery"
                      hint="Unpauses and unlocks the protocol once recovery has been requested."
                      disabled={actionDisabled(phase === "RECOVERY_PENDING")}
                      disabledReason={blocked(
                        phase === "RECOVERY_PENDING",
                        `Requires protocol RECOVERY_PENDING (now ${phase}).`,
                      )}
                      loading={busy === "confirmRecovery"}
                      loadingText="Unpausing"
                      onClick={() => run("confirmRecovery", "confirmRecovery", [iid])}
                    />
                  </StepGroup>

                  <StepGroup
                    index="03"
                    title="Close out"
                    hint="Return the protocol to NORMAL and close the record"
                  >
                    <StepButton
                      icon={<Activity className="size-3.5" />}
                      label="Reset to normal"
                      hint="Clears the active incident. Only valid once the protocol is RECOVERED."
                      disabled={actionDisabled(phase === "RECOVERED")}
                      disabledReason={blocked(
                        phase === "RECOVERED",
                        `Requires protocol RECOVERED (now ${phase}).`,
                      )}
                      loading={busy === "reset"}
                      loadingText="Resetting"
                      onClick={() => run("reset", "resetToNormal", [])}
                    />
                    <div className="rounded-xl border border-line/70 bg-ink-2/40 p-2.5">
                      <ResolveControl
                        disabled={actionDisabled(!decided)}
                        busy={busy === "resolve"}
                        onResolve={(outcome, note) =>
                          void runWrite("resolve", "resolveIncident", [iid, outcome, note])
                        }
                      />
                      <p className="mt-1.5 text-[10.5px] leading-snug text-muted/75">
                        Closes the record as RESOLVED or FALSE_POSITIVE. A CONFIRMED
                        incident can only be resolved by the governance wallet.
                      </p>
                      {status === "CONFIRMED" && !isGovernance ? (
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-warn/90">
                          <Lock className="size-2.5" aria-hidden="true" /> governance
                          wallet only for CONFIRMED
                        </p>
                      ) : null}
                    </div>
                  </StepGroup>
                </div>
              )}

              {tab === "report" && (
                <div className="space-y-3">
                  <p className="text-[11px] leading-relaxed text-muted/80">
                    Submitting stores a new incident owned by your wallet and tags
                    it “yours” in the list. It becomes the active incident as soon
                    as the transaction is committed.
                  </p>
                  <ReportForm
                    busy={busy === "submit_report"}
                    disabled={busy !== null || !canWrite}
                    onSubmit={(payload) =>
                      void runWrite("submit_report", "submit_report", payload, {
                        successRefresh: payload[0],
                        onSuccess: () => {
                          rememberMine(payload[0]);
                          setTab("orchestrate");
                        },
                      })
                    }
                  />
                </div>
              )}

              {tab === "evidence" && (
                <div className="space-y-3">
                  <p className="text-[11px] leading-relaxed text-muted/80">
                    Evidence is attached to the active incident
                    {iid ? (
                      <>
                        :{" "}
                        <span className="font-mono text-text">{iid}</span>
                      </>
                    ) : (
                      " — select one first."
                    )}
                  </p>
                  <EvidenceForm
                    incidentId={iid}
                    disabled={busy !== null || !canWrite || !iid || status === "RESOLVED"}
                    busy={busy === "append_evidence"}
                    onSubmit={(args) =>
                      void runWrite("append_evidence", "append_evidence", args)
                    }
                  />
                </div>
              )}

              {tab === "governance" && (
                <PolicyForm
                  key={snapshot.version ?? 0}
                  policy={snapshot.policy}
                  version={snapshot.version}
                  disabled={busy !== null || !canWrite}
                  busy={busy}
                  onSetPolicy={(payload) =>
                    void runWrite("set_policy", "set_policy", [payload])
                  }
                  onRollback={(version) =>
                    void runWrite("rollback", "rollback", [version])
                  }
                />
              )}
            </div>
          </section>
        </div>

        {/* Right column: AI consensus + audit + policy */}
        <div className="space-y-4">
          <ConsensusPanel
            assessment={snapshot.assessment}
            evidence={snapshot.evidence}
            loading={loading}
            refreshing={refreshing}
            onRefresh={refresh}
          />

          <Section
            title="Audit trail"
            icon={<Activity className="size-4" />}
            meta={<Badge tone="neutral">{snapshot.history.length}</Badge>}
            defaultOpen={false}
          >
            {snapshot.history.length === 0 ? (
              <p className="text-xs text-muted">No history entries yet.</p>
            ) : (
              <ol className="space-y-2">
                {snapshot.history
                  .slice()
                  .reverse()
                  .map((entry, index) => (
                    <li
                      key={`${entry.type}-${index}`}
                      className="flex items-start gap-2 border-l border-line pl-3"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-text">
                          {entry.type}
                        </p>
                        <p className="truncate font-mono text-[10px] text-muted/70">
                          {String(entry.at ?? "")}
                        </p>
                      </div>
                    </li>
                  ))}
              </ol>
            )}
          </Section>

          <Section
            title="Active policy"
            icon={<ShieldCheck className="size-4" />}
            defaultOpen={false}
          >
            <pre className="max-h-64 overflow-auto rounded-lg bg-ink-2/70 p-3 font-mono text-[10px] leading-relaxed text-muted">
              {snapshot.policy ? JSON.stringify(snapshot.policy, null, 2) : "—"}
            </pre>
          </Section>
        </div>
      </div>
    </div>
  );
}

function ResolveControl({
  disabled,
  busy,
  onResolve,
}: {
  disabled: boolean;
  busy: boolean;
  onResolve: (outcome: "RESOLVED" | "FALSE_POSITIVE", note: string) => void;
}) {
  const [outcome, setOutcome] = React.useState<"RESOLVED" | "FALSE_POSITIVE">(
    "RESOLVED",
  );
  const [note, setNote] = React.useState("handled via two-phase pause lifecycle");

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <Select
        aria-label="Resolution outcome"
        value={outcome}
        onChange={(event) =>
          setOutcome(event.target.value as "RESOLVED" | "FALSE_POSITIVE")
        }
        className="h-8 min-w-32 py-0 text-xs sm:flex-1"
        disabled={disabled || busy}
      >
        <option value="RESOLVED">RESOLVED</option>
        <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
      </Select>
      <Input
        aria-label="Resolution note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="h-8 min-w-36 flex-1 py-0 text-xs"
        disabled={disabled || busy}
        maxLength={280}
      />
      <Button
        variant="subtle"
        size="sm"
        loading={busy}
        loadingText="Closing"
        disabled={disabled || note.trim().length === 0}
        onClick={() => onResolve(outcome, note.trim())}
      >
        Resolve
      </Button>
    </div>
  );
}

function ReportForm({
  busy,
  disabled,
  onSubmit,
}: {
  busy: boolean;
  disabled: boolean;
  onSubmit: (args: string[]) => void;
}) {
  const [incidentId, setIncidentId] = React.useState(
    () => `INC-${Date.now().toString(36).slice(-5).toUpperCase()}`,
  );
  const [target, setTarget] = React.useState("0xTargetContract");
  const [network, setNetwork] = React.useState("studionet");
  const [hashes, setHashes] = React.useState("0xtxhash1, 0xtxhash2");
  const [wallets, setWallets] = React.useState("");
  const [description, setDescription] = React.useState(
    "Active exploit reported: treasury outflows observed; pause target to stop losses.",
  );
  const [evidence, setEvidence] = React.useState([
    {
      source_type: "EXTERNAL",
      category: "external",
      reference: "https://example.com/",
      summary: "Independent write-up describes ongoing drain of the target treasury.",
    },
    {
      source_type: "EXTERNAL",
      category: "external",
      reference: "https://docs.genlayer.com/",
      summary: "Reference documentation reachable for corroboration during assessment.",
    },
  ]);
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    if (busy || disabled) return; // double-submit guard
    if (!incidentId.trim()) {
      setError("Incident id is required.");
      return;
    }
    if (description.trim().length === 0) {
      setError("Description is required.");
      return;
    }
    const items = evidence.filter((item) => item.reference.trim() && item.summary.trim());
    if (items.length === 0) {
      setError("At least one complete evidence row (reference + summary) is required.");
      return;
    }
    setError(null);
    onSubmit([
      incidentId.trim(),
      target.trim(),
      network.trim(),
      JSON.stringify(
        hashes
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
      JSON.stringify(
        wallets
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
      description.trim(),
      JSON.stringify(items),
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="report-id" required hint="must be unique">
            Incident id
          </Label>
          <Input
            id="report-id"
            value={incidentId}
            onChange={(event) => setIncidentId(event.target.value)}
            maxLength={128}
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="report-target" required>
            Target contract
          </Label>
          <Input
            id="report-target"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            maxLength={128}
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="report-network">Network</Label>
          <Input
            id="report-network"
            value={network}
            onChange={(event) => setNetwork(event.target.value)}
            maxLength={32}
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="report-tx" hint="comma separated">
            Tx hashes
          </Label>
          <Input
            id="report-tx"
            value={hashes}
            onChange={(event) => setHashes(event.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="report-wallets" hint="optional, comma separated">
            Suspicious wallets
          </Label>
          <Input
            id="report-wallets"
            value={wallets}
            onChange={(event) => setWallets(event.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="report-description" required>
          Description
        </Label>
        <Textarea
          id="report-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={4096}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label hint="max 8 · http(s) refs are fetched during assess">
          Inline evidence
        </Label>
        {evidence.map((item, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-lg border border-line/70 bg-ink-2/60 p-2.5 sm:grid-cols-[130px_1fr]"
          >
            <Select
              aria-label={`Source type ${index + 1}`}
              value={item.source_type}
              disabled={disabled}
              onChange={(event) =>
                setEvidence((rows) =>
                  rows.map((row, rowIndex) =>
                    rowIndex === index
                      ? { ...row, source_type: event.target.value }
                      : row,
                  ),
                )
              }
              className="py-2 text-xs"
            >
              {SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
            <div className="space-y-1.5">
              <Input
                aria-label={`Reference ${index + 1}`}
                value={item.reference}
                placeholder="https://…"
                maxLength={512}
                disabled={disabled}
                onChange={(event) =>
                  setEvidence((rows) =>
                    rows.map((row, rowIndex) =>
                      rowIndex === index
                        ? { ...row, reference: event.target.value }
                        : row,
                    ),
                  )
                }
                className="py-2 text-xs"
              />
              <Input
                aria-label={`Summary ${index + 1}`}
                value={item.summary}
                placeholder="What this source shows"
                maxLength={1024}
                disabled={disabled}
                onChange={(event) =>
                  setEvidence((rows) =>
                    rows.map((row, rowIndex) =>
                      rowIndex === index
                        ? { ...row, summary: event.target.value }
                        : row,
                    ),
                  )
                }
                className="py-2 text-xs"
              />
            </div>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled || evidence.length >= 8}
          onClick={() =>
            setEvidence((rows) => [
              ...rows,
              {
                source_type: "EXTERNAL",
                category: "external",
                reference: "",
                summary: "",
              },
            ])
          }
          icon={<Plus className="size-3.5" />}
        >
          Add source
        </Button>
      </div>

      {error && <p className="text-xs text-bad">{error}</p>}

      <Button onClick={submit} loading={busy} loadingText="Submitting report" disabled={disabled}>
        Submit report
      </Button>
    </div>
  );
}

function EvidenceForm({
  incidentId,
  busy,
  disabled,
  onSubmit,
}: {
  incidentId: string;
  busy: boolean;
  disabled: boolean;
  onSubmit: (args: string[]) => void;
}) {
  const [sourceType, setSourceType] =
    React.useState<(typeof SOURCE_TYPES)[number]>("EXTERNAL");
  const [category, setCategory] = React.useState("external");
  const [reference, setReference] = React.useState("https://github.com/");
  const [summary, setSummary] = React.useState(
    "Corroborating public source confirming the exploit pattern.",
  );
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    if (busy || disabled) return;
    if (!reference.trim() || !summary.trim()) {
      setError("Reference and summary are required by the contract.");
      return;
    }
    setError(null);
    const evidenceId = `${incidentId}:ext${Math.floor(Math.random() * 100000)}`;
    onSubmit([
      evidenceId,
      incidentId,
      sourceType,
      category.trim() || "external",
      reference.trim(),
      summary.trim(),
    ]);
  };

  return (
    <div className="space-y-3">
      {!incidentId && (
        <p className="text-xs text-muted">Select an incident first.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Source type</Label>
          <Select
            value={sourceType}
            disabled={disabled}
            onChange={(event) =>
              setSourceType(event.target.value as (typeof SOURCE_TYPES)[number])
            }
          >
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Category</Label>
          <Input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            maxLength={32}
            disabled={disabled}
          />
        </div>
      </div>
      <div>
        <Label>Reference</Label>
        <Input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          maxLength={512}
          disabled={disabled}
        />
      </div>
      <div>
        <Label>Summary</Label>
        <Textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          maxLength={1024}
          disabled={disabled}
          className="min-h-16"
        />
      </div>
      {error && <p className="text-xs text-bad">{error}</p>}
      <Button onClick={submit} loading={busy} loadingText="Appending" disabled={disabled}>
        Append evidence
      </Button>
    </div>
  );
}

function PolicyForm({
  policy,
  version,
  busy,
  disabled,
  onSetPolicy,
  onRollback,
}: {
  policy: Policy | null;
  version: number | null;
  busy: string | null;
  disabled: boolean;
  onSetPolicy: (json: string) => void;
  onRollback: (version: number) => void;
}) {
  // Remounted via `key` whenever the policy version changes, so the editor
  // starts from the live policy without an effect-synced mirror.
  const [payload, setPayload] = React.useState(() =>
    policy ? JSON.stringify(policy, null, 2) : "",
  );
  const [target, setTarget] = React.useState("1");
  const [error, setError] = React.useState<string | null>(null);

  const apply = () => {
    if (busy || disabled) return;
    try {
      JSON.parse(payload);
      setError(null);
      onSetPolicy(payload);
    } catch {
      setError("Policy must be valid JSON.");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-muted/70">
        Only the governance account may change policy. Current version:{" "}
        <span className="font-mono text-text">v{version ?? "—"}</span>. Activating
        a policy validates every field on-chain.
      </p>
      <Textarea
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        className="min-h-40 font-mono text-[11px]"
        disabled={disabled}
        spellCheck={false}
        aria-label="Policy JSON"
      />
      {error && <p className="text-xs text-bad">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={apply}
          loading={busy === "set_policy"}
          loadingText="Activating"
          disabled={disabled || payload.trim().length === 0}
        >
          Activate policy
        </Button>
        <div className="flex items-center gap-2">
          <Input
            aria-label="Rollback target version"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            inputMode="numeric"
            className="h-9 w-20 py-0 text-xs"
            disabled={disabled}
          />
          <Button
            variant="outline"
            size="md"
            loading={busy === "rollback"}
            loadingText="Rolling back"
            disabled={disabled || !/^\d+$/.test(target)}
            onClick={() => onRollback(Number(target))}
          >
            Rollback
          </Button>
        </div>
      </div>
    </div>
  );
}

export default IncidentConsole;
