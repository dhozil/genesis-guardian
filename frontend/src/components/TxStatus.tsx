"use client";
import * as React from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, shortHex } from "@/lib/utils";
import type { TxOutcome } from "@/lib/types";

function CopyHash({ hash }: { hash: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(hash);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-ink/60 px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-signal/40 hover:text-text"
      title={hash}
    >
      {copied ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />}
      {shortHex(hash, 10, 6)}
    </button>
  );
}

export function TxStatus({
  outcome,
  walletName,
  onDismiss,
  className,
}: {
  outcome: TxOutcome;
  walletName?: string;
  onDismiss: () => void;
  className?: string;
}) {
  if (outcome.phase === "idle") return null;

  const { phase, consensus, hash, statusName, message } = outcome;
  const working = phase === "submitting" || phase === "pending";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border p-3.5 text-sm",
        phase === "success" && "border-ok/35 bg-ok/[0.07]",
        phase === "error" && "border-bad/40 bg-bad/[0.07]",
        working && "border-signal/30 bg-signal/[0.05]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {working && <Loader2 className="size-4 animate-spin text-signal" />}
          {phase === "success" && <CheckCircle2 className="size-4 text-ok" />}
          {phase === "error" && <AlertTriangle className="size-4 text-bad" />}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              {phase === "submitting" && "Waiting for your signature"}
              {phase === "pending" && "Reverberating through validators"}
              {phase === "success" && "Committed on-chain"}
              {phase === "error" && "Not committed"}
            </span>
            {statusName && <Badge tone="neutral">{statusName}</Badge>}
            {consensus?.resultName && (
              <Badge tone={consensus.committed ? "ok" : "bad"} dot>
                {consensus.resultName}
              </Badge>
            )}
            {!!consensus?.rounds && consensus.rounds !== "0" && (
              <Badge tone="info">{consensus.rounds} rounds</Badge>
            )}
            {consensus && consensus.agree + consensus.disagree > 0 && (
              <span className="font-mono text-[10px] text-muted">
                votes: {consensus.agree} agree / {consensus.disagree} disagree
                {consensus.idle ? ` / ${consensus.idle} idle` : ""}
              </span>
            )}
          </div>

          <p className="text-[13px] leading-relaxed text-muted">
            {phase === "submitting" &&
              (walletName
                ? `Confirm the transaction in ${walletName}. Nothing is sent until you approve.`
                : "Confirm the transaction in your wallet.")}
            {phase === "pending" &&
              "Signature received. Validators are re-executing the call and must agree before state is written."}
            {phase === "success" && (message ?? "State written.")}
            {phase === "error" && message}
          </p>

          {hash && (
            <div className="flex items-center gap-2">
              <CopyHash hash={hash} />
              {phase === "error" && statusName === "FINALIZED" && (
                <span className="text-[10px] text-muted/70">
                  finality reached, execution rejected
                </span>
              )}
            </div>
          )}
        </div>

        {!working && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            aria-label="Dismiss status"
            className="-mr-1 -mt-1 shrink-0"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
