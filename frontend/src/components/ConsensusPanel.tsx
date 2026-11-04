import {
  BrainCircuit,
  CheckCircle2,
  CircleSlash,
  ExternalLink,
  RefreshCw,
  ShieldQuestion,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Assessment, EvidenceItem, ThreatLevel } from "@/lib/types";

const threatTone: Record<ThreatLevel, BadgeTone> = {
  NONE: "neutral",
  LOW: "ok",
  MEDIUM: "warn",
  HIGH: "bad",
  CRITICAL: "bad",
};

const statusTone: Record<EvidenceItem["collection_status"], BadgeTone> = {
  VERIFIED: "ok",
  FAILED: "bad",
  UNAVAILABLE: "warn",
  PENDING: "neutral",
};

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[72, 96, 60].map((width, index) => (
        <div
          key={index}
          className="h-3 animate-pulse rounded bg-panel-2"
          style={{ width: `${width}%` }}
        />
      ))}
      <div className="h-20 animate-pulse rounded-lg bg-panel-2/70" />
    </div>
  );
}

export function ConsensusPanel({
  assessment,
  evidence,
  loading,
  refreshing,
  onRefresh,
}: {
  assessment: Assessment | null;
  evidence: EvidenceItem[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-panel/85">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="size-4 text-signal" aria-hidden="true" />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-text">
            AI consensus · assessment
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          loading={refreshing}
          loadingText="Reading"
          aria-label="Refresh assessment"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </header>

      <div className="p-4">
        {loading && !assessment ? (
          <Skeleton />
        ) : !assessment ? (
          <div className="flex flex-col items-start gap-2 py-6 text-sm text-muted">
            <ShieldQuestion className="size-5 text-muted/60" aria-hidden="true" />
            <p className="font-medium text-text">No assessment recorded yet.</p>
            <p className="max-w-md leading-relaxed">
              The AI step runs only after an incident is under investigation.
              Start the investigation, then run <code className="text-signal">assess</code>{" "}
              — validators must agree before the verdict is persisted.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Verdict row */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mono-label">Threat level</p>
                <div className="mt-1 flex items-baseline gap-3">
                  <span
                    className={cn(
                      "text-3xl font-bold tracking-tight",
                      assessment.threat_level === "CRITICAL" ||
                        assessment.threat_level === "HIGH"
                        ? "text-bad"
                        : assessment.threat_level === "MEDIUM"
                          ? "text-warn"
                          : "text-ok",
                    )}
                  >
                    {assessment.threat_level}
                  </span>
                  <Badge tone={threatTone[assessment.threat_level]} dot>
                    {assessment.threat_category}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-right sm:gap-6">
                <div>
                  <p className="mono-label">Confidence</p>
                  <p className="mt-1 text-sm font-semibold">
                    {assessment.confidence_level}
                  </p>
                </div>
                <div>
                  <p className="mono-label">Action</p>
                  <p className="mt-1 text-sm font-semibold">
                    {assessment.recommended_action}
                  </p>
                </div>
                <div>
                  <p className="mono-label">Seq</p>
                  <p className="mt-1 font-mono text-sm">{assessment.seq}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={assessment.evidence_conflict ? "bad" : "ok"} dot>
                {assessment.evidence_conflict
                  ? "evidence conflict"
                  : "no conflict"}
              </Badge>
              <span className="font-mono text-[10px] text-muted/70">
                generated {assessment.generated_at}
              </span>
            </div>

            {/* Reasoning */}
            <div>
              <p className="mono-label mb-1.5">Model reasoning</p>
              <blockquote className="rounded-lg border-l-2 border-signal/50 bg-ink-2/70 px-3.5 py-3 text-[13px] leading-relaxed text-muted">
                {assessment.reasoning_summary || "—"}
              </blockquote>
              {assessment.unresolved_questions ? (
                <p className="mt-2 text-xs text-warn">
                  Unresolved: {assessment.unresolved_questions}
                </p>
              ) : null}
            </div>

            {/* Evidence verification */}
            <div>
              <p className="mono-label mb-2">
                Source verification ({evidence.filter((e) => e.corroborated).length}/
                {evidence.length} corroborated)
              </p>
              {evidence.length === 0 ? (
                <p className="text-xs text-muted">No evidence attached.</p>
              ) : (
                <ul className="space-y-1.5">
                  {evidence.map((item) => (
                    <li
                      key={item.evidence_id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-line/70 bg-ink-2/75 px-2.5 py-2"
                    >
                      {item.collection_status === "VERIFIED" ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-ok" />
                      ) : (
                        <CircleSlash className="size-3.5 shrink-0 text-muted" />
                      )}
                      <span className="font-mono text-[10px] text-muted">
                        {item.evidence_id}
                      </span>
                      <Badge tone="neutral">{item.source_type}</Badge>
                      <Badge tone={statusTone[item.collection_status]}>
                        {item.collection_status}
                      </Badge>
                      <a
                        href={item.reference.startsWith("http") ? item.reference : undefined}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={cn(
                          "min-w-0 flex-1 truncate font-mono text-[10px] text-muted/80",
                          item.reference.startsWith("http") &&
                            "hover:text-signal hover:underline",
                        )}
                        title={item.reference}
                      >
                        {item.reference}
                      </a>
                      {item.reference.startsWith("http") && (
                        <ExternalLink className="size-3 shrink-0 text-muted/50" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="border-t border-line/70 pt-3 text-[11px] leading-relaxed text-muted/70">
              Produced by <code className="text-muted">gl.nondet.exec_prompt</code> +{" "}
              <code className="text-muted">gl.nondet.web.get</code> inside every
              validator. Validators compare the five decision fields <em>and</em> each
              source&apos;s derived status and content match; the verdict is stored only
              when a validator majority votes <span className="text-ok">agree</span>.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
