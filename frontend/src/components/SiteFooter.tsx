import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { GUARDIAN_ADDRESS, GUARDIAN_CHAIN, explorerAddressUrl } from "@/lib/chain";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-7 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-mono text-[11px] text-muted">
            GENESIS GUARDIAN · single-contract v1 · {GUARDIAN_CHAIN.name}
          </p>
          <nav
            className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-[0.16em]"
            aria-label="Footer"
          >
            <Link href="/" className="text-muted transition-colors hover:text-signal">
              Landing
            </Link>
            <Link
              href="/console"
              className="text-muted transition-colors hover:text-signal"
            >
              Console
            </Link>
            <Link
              href="/how-it-works"
              className="text-muted transition-colors hover:text-signal"
            >
              How it works
            </Link>
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
          <a
            href={explorerAddressUrl()}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted transition-colors hover:text-signal"
          >
            {GUARDIAN_ADDRESS}
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
          <span className="font-mono text-[10px] text-muted/70">
            reads need no wallet · writes are signed in your wallet
          </span>
        </div>
      </div>
    </footer>
  );
}
