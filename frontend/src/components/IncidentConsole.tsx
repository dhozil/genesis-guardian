"use client";
import * as React from "react";
import {
  Activity,
  ChevronDown,
  Cpu,
  FileWarning,
  GitBranch,
  Lock,
  Play,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Unlock,
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

export function IncidentConsole({ wallet }: { wallet: WalletController }) {
  const [snapshot, setSnapshot] = React.useState<Snapshot>(EMPTY);
  const [selected, setSelected] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [readError, setReadError] = React.useState<string | null>(null);
  const [tx, setTx] = React.useState<TxOutcome>({ phase: "idle" });
  const [busy, setBusy] = React.useState<string | null>(null);

  // Synchronous guard: a second click can never start a second transaction.
  const inFlight = React.useRef(false);

  const load = React.useCallback(async (preferred?: string, silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setReadError(null);

    try {
      // Deliberately few reads: get_state already carries policy version, paused
      // flag, governance and history length, and studionet caps reads at 30/min.
      const [rawIds, protocol, policy] = await Promise.all([
        tryReadMethod<unknown>("get_incident_ids", [], []),
        tryReadMethod<ProtocolState | null>("get_state", [], null),
        tryReadMethod<Policy | null>("get_policy", [], null),
      ]);

      const list = normalizeList(rawIds);
      const target =
        (preferred && list.includes(preferred) ? preferred : "") ||
        (selected && list.includes(selected) ? selected : "") ||
        list[list.length - 1] ||
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
    } catch (error) {
      setReadError(humanizeReadError(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runWrite = async (
    key: string,
    functionName: string,
    args: unknown[],
    options?: { consensusMaxRotations?: number; successRefresh?: string },
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
        functionName,
        args,
        consensusMaxRotations: options?.consensusMaxRotations,
        onUpdate: (patch) => setTx((current) => ({ ...current, ...patch })),
      });
      if (outcome.phase === "success") {
        await load(options?.successRefresh ?? selected, true);
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

  const actionDisabled = (condition: boolean) => busy !== null || !canWrite || !condition;

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
              {snapshot.incident?.status ?? "no selection"}
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
          ) : null}
        </div>
      )}

      {readError && (
        <div className="rounded-xl border border-bad/40 bg-bad/[0.07] px-4 py-3 text-sm text-bad">
          {readError}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          {/* Incident selector + lifecycle */}
          <Section
            title="Incident lifecycle"
            icon={<Activity className="size-4" />}
            meta={
              status ? (
                <Badge tone={statusTone[status] ?? "neutral"} dot>
                  {status}
                </Badge>
              ) : null
            }
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="incident-select" hint={`${snapshot.ids.length} total`}>
                  Incident
                </Label>
                <div className="flex gap-2">
                  <Select
                    id="incident-select"
                    value={selected}
                    onChange={(event) => {
                      const next = event.target.value;
                      setSelected(next);
                      void load(next, true);
                    }}
                    disabled={snapshot.ids.length === 0}
                  >
                    {snapshot.ids.length === 0 ? (
                      <option value="">
                        {loading ? "Loading…" : "No incidents yet"}
                      </option>
                    ) : (
                      snapshot.ids.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))
                    )}
                  </Select>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => void load(selected, true)}
                    loading={refreshing}
                    aria-label="Refresh incident"
                  >
                    Refresh
                  </Button>
                </div>
              </div>

              {incident && (
                <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="mono-label">Target</dt>
                    <dd className="font-mono text-text/90">{incident.contract_address}</dd>
                  </div>
                  <div>
                    <dt className="mono-label">Network</dt>
                    <dd className="font-mono text-text/90">{incident.network}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="mono-label">Reported by</dt>
                    <dd className="font-mono text-text/90">
                      {incident.reporter ?? "—"} · {incident.submitted_at ?? ""}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="mono-label">Description</dt>
                    <dd className="text-muted">{incident.description}</dd>
                  </div>
                </dl>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={() => void runWrite("startInvestigation", "startInvestigation", [iid])}
                  loading={busy === "startInvestigation"}
                  loadingText="Starting"
                  disabled={actionDisabled(status !== "SUBMITTED")}
                  icon={<Play className="size-3.5" />}
                >
                  Start investigation
                </Button>

                <Button
                  variant="primary"
                  onClick={() =>
                    void runWrite("assess", "assess", [iid], {
                      consensusMaxRotations: 5,
                    })
                  }
                  loading={busy === "assess"}
                  loadingText="AI consensus…"
                  disabled={actionDisabled(status !== "UNDER_INVESTIGATION")}
                  icon={<Wand2 className="size-3.5" />}
                  title="Runs LLM + web fetch on every validator; may need a retry"
                >
                  Run AI assess
                </Button>

                <Button
                  variant="outline"
                  onClick={() => void runWrite("syncDecision", "syncDecision", [iid])}
                  loading={busy === "syncDecision"}
                  loadingText="Deciding"
                  disabled={actionDisabled(status !== "UNDER_INVESTIGATION")}
                  icon={<GitBranch className="size-3.5" />}
                >
                  Sync decision
                </Button>

                <Button
                  variant="outline"
                  onClick={() => void runWrite("reassess", "reassess", [iid])}
                  loading={busy === "reassess"}
                  loadingText="Reopening"
                  disabled={actionDisabled(
                    !status || !["CONFIRMED", "REJECTED", "INCONCLUSIVE"].includes(status),
                  )}
                  icon={<Cpu className="size-3.5" />}
                >
                  Reassess
                </Button>
              </div>

              <p className="text-[11px] leading-relaxed text-muted/70">
                AI assess can take a minute and occasionally returns
                MAJORITY_DISAGREE. Nothing is written in that case — press the
                button again. It is disabled while a transaction is in flight.
              </p>
            </div>
          </Section>

          {/* Emergency authority */}
          <Section
            title="Emergency authority"
            icon={<ShieldAlert className="size-4" />}
            meta={<Badge tone={phaseTone[phase] ?? "neutral"}>{phase}</Badge>}
          >
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="danger"
                  onClick={() => void runWrite("initiate", "initiateEmergency", [iid])}
                  loading={busy === "initiate"}
                  loadingText="Checking gates"
                  disabled={actionDisabled(phase === "NORMAL" && status === "CONFIRMED")}
                  icon={<ShieldAlert className="size-3.5" />}
                >
                  Initiate emergency
                </Button>

                <Button
                  variant="danger"
                  onClick={() => void runWrite("confirmEmergency", "confirmEmergency", [iid])}
                  loading={busy === "confirmEmergency"}
                  loadingText="Pausing"
                  disabled={actionDisabled(phase === "EMERGENCY_PENDING")}
                  icon={<Lock className="size-3.5" />}
                >
                  Confirm &amp; pause
                </Button>

                <Button
                  variant="outline"
                  onClick={() =>
                    void runWrite("requestRecovery", "requestRecovery", [
                      iid,
                      "exploit contained — resuming monitored operation",
                    ])
                  }
                  loading={busy === "requestRecovery"}
                  loadingText="Requesting"
                  disabled={actionDisabled(phase === "EMERGENCY_ACTIVE")}
                  icon={<Unlock className="size-3.5" />}
                >
                  Request recovery
                </Button>

                <Button
                  variant="outline"
                  onClick={() => void runWrite("confirmRecovery", "confirmRecovery", [iid])}
                  loading={busy === "confirmRecovery"}
                  loadingText="Unpausing"
                  disabled={actionDisabled(phase === "RECOVERY_PENDING")}
                  icon={<ShieldCheck className="size-3.5" />}
                >
                  Confirm recovery
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => void runWrite("reset", "resetToNormal", [])}
                  loading={busy === "reset"}
                  disabled={actionDisabled(phase === "RECOVERED")}
                >
                  Reset to normal
                </Button>
                <ResolveControl
                  disabled={actionDisabled(
                    !status || !["CONFIRMED", "REJECTED", "INCONCLUSIVE"].includes(status),
                  )}
                  busy={busy === "resolve"}
                  onResolve={(outcome, note) =>
                    void runWrite("resolve", "resolveIncident", [iid, outcome, note])
                  }
                />
              </div>

              <p className="text-[11px] leading-relaxed text-muted/70">
                Two-phase by design: initiate/confirm and request/confirm are
                separate transactions, so the pause cannot be a single-click
                accident. The contract enforces step order; waiting for FINALIZED between steps is a keeper convention.
              </p>
            </div>
          </Section>

          {/* Intake forms */}
          <Section
            title="Submit report"
            icon={<FileWarning className="size-4" />}
            defaultOpen={snapshot.ids.length === 0}
          >
            <ReportForm
              busy={busy === "submit_report"}
              disabled={busy !== null || !canWrite}
              onSubmit={(payload) =>
                void runWrite("submit_report", "submit_report", payload)
              }
            />
          </Section>

          <Section
            title="Append evidence"
            icon={<Plus className="size-4" />}
            defaultOpen={false}
          >
            <EvidenceForm
              incidentId={iid}
              disabled={busy !== null || !canWrite || !iid || status === "RESOLVED"}
              busy={busy === "append_evidence"}
              onSubmit={(args) =>
                void runWrite("append_evidence", "append_evidence", args)
              }
            />
          </Section>

          {/* Governance */}
          <Section
            title="Governance"
            icon={<Cpu className="size-4" />}
            defaultOpen={false}
          >
            <PolicyForm
              policy={snapshot.policy}
              version={snapshot.version}
              disabled={busy !== null || !canWrite}
              busy={busy}
              onSetPolicy={(payload) => void runWrite("set_policy", "set_policy", [payload])}
              onRollback={(version) =>
                void runWrite("rollback", "rollback", [version])
              }
            />
          </Section>
        </div>

        {/* Right column: AI consensus + history */}
        <div className="space-y-4">
          <ConsensusPanel
            assessment={snapshot.assessment}
            evidence={snapshot.evidence}
            loading={loading}
            refreshing={refreshing}
            onRefresh={() => void load(selected, true)}
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
        className="h-8 w-auto min-w-36 py-0 text-xs"
        disabled={disabled || busy}
      >
        <option value="RESOLVED">RESOLVED</option>
        <option value="FALSE_POSITIVE">FALSE_POSITIVE</option>
      </Select>
      <Input
        aria-label="Resolution note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="h-8 min-w-40 flex-1 py-0 text-xs"
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
    () => `INC-${Date.now().toString().slice(-6)}`,
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
          <Label htmlFor="report-id" required>
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
  const [payload, setPayload] = React.useState(() =>
    policy ? JSON.stringify(policy, null, 2) : "",
  );
  const [target, setTarget] = React.useState("1");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (policy) setPayload(JSON.stringify(policy, null, 2));
  }, [policy]);

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
