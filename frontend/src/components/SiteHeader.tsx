"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Wallet, X } from "lucide-react";
import { GuardianLogo } from "@/components/GuardianLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GUARDIAN_CHAIN } from "@/lib/chain";
import { cn, shortHex } from "@/lib/utils";
import { useGuardianWallet } from "@/lib/wallet-context";

export const NAV_LINKS = [
  { href: "/console", label: "Console" },
  { href: "/how-it-works", label: "How it works" },
] as const;

/** The single wallet affordance reused by the header and the landing hero. */
export function WalletChip({ className }: { className?: string }) {
  const { wallet, openPicker } = useGuardianWallet();

  if (wallet.status === "connected" && wallet.account) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-lg border border-line bg-panel/70 px-3 py-1.5 backdrop-blur",
          className,
        )}
      >
        <span className="size-2 animate-pulse-ring rounded-full bg-ok" />
        <span className="font-mono text-xs text-text">
          {shortHex(wallet.account, 6, 4)}
        </span>
        <button
          type="button"
          onClick={() => void wallet.switchNetwork()}
          title={
            wallet.isCorrectChain
              ? GUARDIAN_CHAIN.name
              : `Switch to ${GUARDIAN_CHAIN.name}`
          }
          className="rounded-full"
        >
          <Badge tone={wallet.isCorrectChain ? "ok" : "warn"} dot>
            {wallet.isCorrectChain ? GUARDIAN_CHAIN.shortName : "switch network"}
          </Badge>
        </button>
        <button
          type="button"
          onClick={wallet.disconnect}
          className="text-[11px] text-muted transition-colors hover:text-bad"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <Button
      className={className}
      onClick={openPicker}
      loading={wallet.status === "connecting"}
      loadingText="Connecting"
      icon={<Wallet className="size-4" />}
    >
      Connect wallet
    </Button>
  );
}

export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header
      className={cn(
        "z-40 w-full",
        overlay
          ? "absolute inset-x-0 top-0"
          : "sticky top-0 border-b border-line/70 bg-ink/85 backdrop-blur-xl",
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 sm:px-8",
          overlay ? "py-5 sm:py-6" : "py-3.5",
        )}
      >
        <GuardianLogo />

        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "py-1 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
                isActive(item.href) ? "text-signal" : "text-white/60 hover:text-signal",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <WalletChip />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            aria-expanded={open}
            aria-controls="mobile-nav"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {open && (
        <div
          id="mobile-nav"
          className="border-t border-line bg-ink/95 px-5 py-4 md:hidden"
        >
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors",
                  isActive(item.href)
                    ? "bg-signal/10 text-signal"
                    : "text-white/70 hover:bg-panel-2/60",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 sm:hidden">
            <WalletChip className="w-full justify-center" />
          </div>
        </div>
      )}
    </header>
  );
}
