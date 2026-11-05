import { Activity } from "lucide-react";
import { GUARDIAN_ADDRESS, GUARDIAN_CHAIN } from "@/lib/chain";
import { cn, shortHex } from "@/lib/utils";
import type { ProtocolState } from "@/lib/types";

/** Live protocol telemetry card. Reads only — never needs a wallet. */
export function ProtocolTelemetry({ protocol }: { protocol: ProtocolState | null }) {
  const phase = protocol?.state ?? "NORMAL";

  return (
    <div className="w-full max-w-sm rounded-2xl border border-signal/25 bg-ink/80 p-5 shadow-[0_0_70px_-20px_rgba(255,138,61,0.6)] backdrop-blur-md">
      <div className="flex items-center justify-between">
        <span className="mono-label">Protocol telemetry</span>
        {/* Only claim "live" once a read has actually landed. */}
        <span
          className={cn(
            "flex items-center gap-1.5 font-mono text-[10px]",
            protocol ? "text-ok" : "text-muted",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              protocol ? "animate-pulse-ring bg-ok" : "bg-muted/50",
            )}
          />
          {protocol ? "live" : "reading"}
        </span>
      </div>

      <p className="mt-4 text-3xl font-bold tracking-tight text-white">
        {phase.replace("_", " ").toLowerCase()}
      </p>
      <p className="mt-1 text-xs text-muted">
        {protocol?.paused
          ? "Target paused by emergency authority"
          : "Monitoring · emergency authority armed"}
      </p>

      <dl className="mt-5 space-y-2.5 border-t border-line pt-4 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-muted">Policy version</dt>
          <dd className="font-mono text-text">v{protocol?.policy_version ?? "—"}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted">Active incident</dt>
          <dd className="font-mono text-text">{protocol?.active_incident || "none"}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted">State writes</dt>
          <dd className="font-mono text-text">{protocol?.history_len ?? 0}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted">Governance</dt>
          <dd className="font-mono text-text">
            {shortHex(protocol?.governance ?? "0x", 6, 4)}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
        <Activity className="size-3.5 text-signal" aria-hidden="true" />
        <span className="font-mono text-[10px] text-muted">
          {shortHex(GUARDIAN_ADDRESS, 8, 6)} · {GUARDIAN_CHAIN.shortName}
        </span>
      </div>
    </div>
  );
}
