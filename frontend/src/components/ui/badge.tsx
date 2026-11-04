import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "signal" | "ok" | "warn" | "bad" | "neutral" | "info";

const tones: Record<BadgeTone, string> = {
  signal: "border-signal/35 bg-signal/10 text-signal",
  ok: "border-ok/35 bg-ok/10 text-ok",
  warn: "border-warn/35 bg-warn/10 text-warn",
  bad: "border-bad/40 bg-bad/10 text-bad",
  neutral: "border-line bg-panel-2/70 text-muted",
  info: "border-sky-400/35 bg-sky-400/10 text-sky-300",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot = false,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
