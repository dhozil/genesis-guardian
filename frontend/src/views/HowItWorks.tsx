import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Globe,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PIPELINE = [
  {
    step: "01",
    icon: Siren,
    title: "Report",
    method: "submit_report(incident_id, contract_address, network, tx_hashes, wallets, description, evidence)",
    body: "Anyone can file an incident with a target, transaction hashes, suspicious wallets and up to eight inline sources. Nothing is trusted at this point: the incident starts as SUBMITTED and carries no authority.",
  },
  {
    step: "02",
    icon: Globe,
    title: "Corroborate",
    method: "startInvestigation(incident_id)",
    body: "The incident moves to UNDER_INVESTIGATION. During assessment every http(s) reference is fetched with gl.nondet.web.get inside each validator and its collection status is persisted as VERIFIED, FAILED or UNAVAILABLE. A source that cannot be reached never counts as corroboration.",
  },
  {
    step: "03",
    icon: BrainCircuit,
    title: "Assess",
    method: "assess(incident_id)",
    body: "The leader runs an LLM prompt over the description and the fetched evidence, returning threat level, category, confidence, recommended action, reasoning and unresolved questions. Validators re-execute the step and compare only the decision fields (the equivalence principle), so the verdict is stored only when a majority votes agree.",
  },
  {
    step: "04",
    icon: Cpu,
    title: "Decide",
    method: "syncDecision(incident_id)",
    body: "An assessment is a proposal, not authority. syncDecision applies the active policy: confidence rank, minimum corroborating sources, allowed threat levels and allowed actions. Failing a gate leaves the incident INCONCLUSIVE or REJECTED instead of promoting it.",
  },
  {
    step: "05",
    icon: ShieldCheck,
    title: "Authorise",
    method: "initiateEmergency(incident_id) → confirmEmergency(incident_id)",
    body: "Only a policy-passing PAUSE_TARGET opens the emergency machine. Pausing takes two transactions, recovery takes two more, and resetToNormal returns the protocol to NORMAL. resolveIncident then closes the incident as RESOLVED or FALSE_POSITIVE.",
  },
];

const CONSENSUS = [
  {
    title: "Five decision fields, plus per-source checks",
    body: "Threat level, category, confidence, recommended action and evidence conflict, and also each source's derived status (VERIFIED / FAILED / UNAVAILABLE) and whether the fetched body actually referenced this incident. Free-form reasoning is stored verbatim but never used for agreement.",
  },
  {
    title: "Disagreement writes nothing",
    body: "A transaction can be finalized and still write no state. If the vote is MAJORITY_DISAGREE the verdict is discarded; the console reports that and asks you to run assess again.",
  },
  {
    title: "The model proposes, the policy decides",
    body: "After consensus, deterministic gates re-check the minimum confidence, the number of corroborated sources and the allowed actions. The LLM cannot authorise a pause on its own.",
  },
  {
    title: "Finality, not inclusion",
    body: "A success state requires the transaction to be FINALIZED, the majority to agree and the leader execution to be SUCCESS. Anything else is surfaced as a failure with the underlying reason.",
  },
];

const STATES = [
  {
    state: "NORMAL",
    tone: "ok" as const,
    body: "Armed and monitoring. The only state that accepts initiateEmergency.",
  },
  {
    state: "EMERGENCY_PENDING",
    tone: "warn" as const,
    body: "A pause has been proposed for an incident. It is not active yet.",
  },
  {
    state: "EMERGENCY_ACTIVE",
    tone: "bad" as const,
    body: "Target paused, pause_supported reports true. Recovery now needs a request plus a confirmation.",
  },
  {
    state: "RECOVERY_PENDING",
    tone: "warn" as const,
    body: "Recovery requested with a written reason; still paused until confirmed.",
  },
  {
    state: "RECOVERED",
    tone: "info" as const,
    body: "Target unpaused. The incident can be resolved and the protocol reset.",
  },
];

const POLICY = [
  ["min_confidence", "LOW · MEDIUM · HIGH", "The assessment must rank at least this high."],
  ["min_corroborating_sources", "0 – 10", "How many VERIFIED sources are required before an action passes."],
  ["allowed_threat_levels", "subset of NONE … CRITICAL", "Verdicts outside the set cannot authorise anything."],
  ["allowed_actions", "PAUSE_TARGET · INVESTIGATE", "Which recommendations the protocol is willing to honour."],
  ["cooldown_seconds", "≤ 604800", "Minimum spacing between protocol-level changes."],
];

const THREATS = [
  ["NONE", "No credible signal; nothing to action."],
  ["LOW", "Suspicious but not exploitable yet."],
  ["MEDIUM", "Reachable risk that needs investigation."],
  ["HIGH", "Active exploit path with a likely loss."],
  ["CRITICAL", "Loss in progress; pause is expected."],
];

const READS: Array<[string, string]> = [
  ["get_state", "state, policy version, active incident, write count, governance, paused"],
  ["get_version", "current policy version"],
  ["get_policy", "active policy payload"],
  ["get_policy_at", "historical policy payload by version"],
  ["get_policy_record", "payload plus activated_at and activated_by"],
  ["get_incident", "one incident incl. status, target and description"],
  ["get_incident_ids", "every incident id ever recorded"],
  ["get_evidence", "one evidence item and its verification status"],
  ["get_evidence_for_incident", "all evidence attached to an incident"],
  ["get_assessment", "latest AI verdict for an incident"],
  ["get_history", "audit trail of state writes"],
  ["get_protocol_hint", "compact counters for a dashboard header"],
  ["is_paused", "whether the protected target is paused"],
  ["pause_supported", "whether this deployment can pause targets"],
];

const WRITES: Array<[string, string]> = [
  ["submit_report", "file a new incident with inline evidence"],
  ["append_evidence", "attach one more source to an incident"],
  ["startInvestigation", "move SUBMITTED → UNDER_INVESTIGATION"],
  ["assess", "run the LLM + web-fetch consensus step"],
  ["syncDecision", "apply policy gates to the latest assessment"],
  ["reassess", "re-run assessment after new evidence"],
  ["resolveIncident", "close as RESOLVED or FALSE_POSITIVE"],
  ["initiateEmergency", "propose the pause (phase one)"],
  ["confirmEmergency", "activate the pause (phase two)"],
  ["requestRecovery", "ask to lift the pause, with a reason"],
  ["confirmRecovery", "confirm recovery"],
  ["resetToNormal", "return the protocol to NORMAL"],
  ["set_policy", "activate a new policy version"],
  ["rollback", "restore an earlier policy version"],
];

const GUARDRAILS = [
  "Writes need finality: FINALIZED + majority agree + leader SUCCESS. Inclusion alone proves nothing.",
  "MAJORITY_DISAGREE discards the entire write; the console says so instead of faking success.",
  "Contract refusals are structured ([EXPECTED] …), so the UI shows a sentence, not a stack trace.",
  "Evidence is never invented: a USER_CLAIM has to survive web verification to corroborate.",
  "Reads run through gen_call without a wallet; writes require studionet (61999) in MetaMask or Rabby.",
];

export function HowItWorks() {
  return (
    <div className="relative">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="max-w-3xl">
          <p className="mono-label">How it works</p>
          <h1 className="mt-2 text-balance text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl">
            From one report to a paused target — five verified steps.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
            Genesis Guardian is a single GenLayer contract with 28 methods: 14 reads
            and 14 writes. The interesting part is not the pausing — it is what has
            to be true on-chain before a pause is even allowed.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge tone="signal" dot>
              AI consensus
            </Badge>
            <Badge tone="neutral">evidence verification</Badge>
            <Badge tone="neutral">two-phase emergency</Badge>
            <Badge tone="neutral">policy gates</Badge>
          </div>
        </header>

        {/* Pipeline */}
        <ol className="mt-12 space-y-3">
          {PIPELINE.map((item) => (
            <li
              key={item.step}
              className="rounded-2xl border border-line bg-panel/80 p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl border border-signal/25 bg-signal/10">
                  <item.icon className="size-4 text-signal" aria-hidden="true" />
                </span>
                <span className="font-mono text-[10px] tracking-[0.2em] text-signal">
                  {item.step}
                </span>
                <h2 className="text-base font-semibold text-white">{item.title}</h2>
                <code className="ml-auto max-w-full truncate rounded-md border border-line/70 bg-ink-2/70 px-2 py-1 font-mono text-[10px] text-muted">
                  {item.method}
                </code>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ol>

        {/* Consensus */}
        <section className="mt-14">
          <div className="max-w-2xl">
            <p className="mono-label">What consensus actually guarantees</p>
            <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Agreement is narrow on purpose.
            </h2>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {CONSENSUS.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-line bg-ink-2/75 p-5"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-ok" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* State machine */}
        <section className="mt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-2xl">
              <p className="mono-label">Emergency authority</p>
              <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Five states, each reachable through one gated write.
              </h2>
            </div>
            <Badge tone="bad" dot>
              irreversible without confirmation
            </Badge>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STATES.map((item, index) => (
              <div
                key={item.state}
                className="relative rounded-xl border border-line bg-panel/80 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={item.tone}>{item.state}</Badge>
                  <span className="font-mono text-[10px] text-muted/60">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-muted">{item.body}</p>
                {index < STATES.length - 1 && (
                  <ArrowRight
                    className="absolute -right-2.5 top-1/2 hidden size-4 -translate-y-1/2 text-line lg:block"
                    aria-hidden="true"
                  />
                )}
              </div>
            ))}
          </div>

          <p className="mt-4 flex items-start gap-2 rounded-xl border border-signal/25 bg-signal/[0.06] p-3.5 text-xs leading-relaxed text-muted">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-signal" aria-hidden="true" />
            Each transition checks the current state and refuses anything out of
            order with an <code className="text-signal">[EXPECTED]</code> error — for
            example <code className="text-signal">confirmEmergency</code> requires
            EMERGENCY_PENDING. Skipping a phase is not a soft failure, it reverts.
          </p>
        </section>

        {/* Policy */}
        <section className="mt-14">
          <div className="max-w-2xl">
            <p className="mono-label">Active policy</p>
            <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
              The gates a verdict must pass.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Policies are versioned on-chain. <code className="text-signal">set_policy</code>{" "}
              activates a new version, <code className="text-signal">rollback</code>{" "}
              restores an older one, and every version stays readable through{" "}
              <code className="text-signal">get_policy_at</code>.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-panel-2/60 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                <tr>
                  <th className="px-4 py-3">Key</th>
                  <th className="px-4 py-3">Range</th>
                  <th className="px-4 py-3">Effect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {POLICY.map(([key, range, effect]) => (
                  <tr key={key} className="bg-ink-2/60">
                    <td className="px-4 py-3 font-mono text-xs text-signal">{key}</td>
                    <td className="px-4 py-3 font-mono text-xs text-text">{range}</td>
                    <td className="px-4 py-3 text-muted">{effect}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Threat levels */}
        <section className="mt-14 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-panel/80 p-5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-signal" aria-hidden="true" />
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-text">
                Threat levels
              </h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {THREATS.map(([level, meaning]) => (
                <li key={level} className="flex gap-3 text-sm">
                  <span className="w-20 shrink-0 font-mono text-xs text-text">{level}</span>
                  <span className="text-muted">{meaning}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-line bg-panel/80 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-signal" aria-hidden="true" />
              <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-text">
                Closing an incident
              </h2>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li className="flex gap-3">
                <span className="w-20 shrink-0 font-mono text-xs text-ok">RESOLVED</span>
                <span className="text-muted">
                  The threat was real and has been handled; state history keeps the note.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="w-20 shrink-0 font-mono text-xs text-warn">
                  FALSE_POSITIVE
                </span>
                <span className="text-muted">
                  The report did not hold up; the incident is closed without a pause.
                </span>
              </li>
            </ul>
            <p className="mt-4 border-t border-line/70 pt-3 text-xs leading-relaxed text-muted">
              Evidence keeps its own statuses — PENDING, VERIFIED, FAILED,
              UNAVAILABLE — so a failed fetch is visible instead of silently
              counting as proof.
            </p>
          </div>
        </section>

        {/* Method reference */}
        <section className="mt-14">
          <div className="max-w-2xl">
            <p className="mono-label">Method reference</p>
            <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight text-white sm:text-3xl">
              14 reads, 14 writes, one contract.
            </h2>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-panel/80 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-text">
                  Reads
                </h3>
                <Badge tone="neutral">no wallet</Badge>
              </div>
              <ul className="mt-4 space-y-2">
                {READS.map(([name, desc]) => (
                  <li key={name} className="text-sm">
                    <code className="font-mono text-xs text-signal">{name}</code>
                    <span className="ml-2 text-muted">{desc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-line bg-panel/80 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-text">
                  Writes
                </h3>
                <Badge tone="signal">signed</Badge>
              </div>
              <ul className="mt-4 space-y-2">
                {WRITES.map(([name, desc]) => (
                  <li key={name} className="text-sm">
                    <code className="font-mono text-xs text-signal">{name}</code>
                    <span className="ml-2 text-muted">{desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Guardrails */}
        <section className="mt-14 rounded-2xl border border-line bg-ink-2/80 p-5 sm:p-6">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-text">
            Guardrails behind every button
          </h2>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {GUARDRAILS.map((line) => (
              <li key={line} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 flex flex-col items-start justify-between gap-5 rounded-2xl border border-signal/25 bg-signal/[0.06] p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white">
              Watch it happen on the deployed contract.
            </h2>
            <p className="mt-1 text-sm text-muted">
              The console reads real state; you only sign when you want to write.
            </p>
          </div>
          <Link
            href="/console"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-signal px-5 text-sm font-semibold text-ink transition-colors hover:bg-[#FFA45F]"
          >
            Open the console
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
