import Link from "next/link";
import { Fingerprint } from "lucide-react";
import { cn } from "@/lib/utils";

export function GuardianLogo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="Genesis Guardian — home"
      className={cn("group flex items-center gap-2.5", className)}
    >
      <span className="flex size-9 items-center justify-center rounded-lg border border-signal/30 bg-signal/10 transition-colors group-hover:border-signal/60">
        <Fingerprint className="size-4 text-signal" aria-hidden="true" />
      </span>
      <span className="font-mono text-[13px] tracking-[0.18em] text-white">
        GENESIS<span className="text-signal">//</span>GUARDIAN
      </span>
    </Link>
  );
}
