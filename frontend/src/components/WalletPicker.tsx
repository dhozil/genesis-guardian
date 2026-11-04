"use client";
import * as React from "react";
import { AlertTriangle, ChevronRight, Loader2, Wallet, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GUARDIAN_CHAIN } from "@/lib/chain";
import type { DetectedWallet, WalletError } from "@/hooks/useWallet";

function WalletIcon({ wallet }: { wallet: DetectedWallet }) {
  if (wallet.icon) {
    return (
      <img
        src={wallet.icon}
        alt=""
        className="size-8 rounded-lg"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span className="flex size-8 items-center justify-center rounded-lg border border-line bg-ink-2 text-signal">
      <Wallet className="size-4" aria-hidden="true" />
    </span>
  );
}

export function WalletPicker({
  open,
  onClose,
  wallets,
  pendingRdns,
  error,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  wallets: DetectedWallet[];
  pendingRdns?: string | null;
  error?: WalletError | null;
  onSelect: (rdns: string) => void;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) return null;

  const busy = Boolean(pendingRdns);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-picker-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2
              id="wallet-picker-title"
              className="text-base font-semibold text-text"
            >
              Connect a wallet
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Pick one wallet. Only that provider is asked — the others never
              open a competing prompt.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
            aria-label="Close wallet picker"
            className="-mr-2 -mt-1"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="space-y-2 p-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2.5 text-xs text-bad"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error.message}</span>
            </div>
          )}

          {wallets.length === 0 ? (
            <div className="space-y-3 rounded-xl border border-dashed border-line px-4 py-6 text-center">
              <p className="text-sm font-medium text-text">
                No EVM wallet detected
              </p>
              <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted">
                Install MetaMask or Rabby, then reload this page. Both announce
                themselves through EIP-6963, so the picker will list them
                separately.
              </p>
              <div className="flex justify-center gap-2 pt-1">
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-text transition-colors hover:border-signal/40"
                >
                  Get MetaMask
                </a>
                <a
                  href="https://rabby.io/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-text transition-colors hover:border-signal/40"
                >
                  Get Rabby
                </a>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {wallets.map((wallet) => {
                const isPending = pendingRdns === wallet.rdns;
                return (
                  <li key={wallet.rdns}>
                    <button
                      type="button"
                      onClick={() => onSelect(wallet.rdns)}
                      disabled={busy}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border border-line bg-ink-2/80 px-3 py-3 text-left transition-all",
                        "hover:border-signal/45 hover:bg-panel-2/80",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        isPending && "border-signal/60 bg-signal/[0.06]",
                      )}
                    >
                      <WalletIcon wallet={wallet} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-text">
                          {wallet.name}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-muted">
                          {wallet.rdns}
                        </span>
                      </span>
                      {isPending ? (
                        <Loader2 className="size-4 animate-spin text-signal" />
                      ) : (
                        <ChevronRight className="size-4 text-muted" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line bg-ink-2/60 px-5 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Network
          </span>
          <Badge tone="signal" dot>
            {GUARDIAN_CHAIN.name} · {GUARDIAN_CHAIN.id}
          </Badge>
        </footer>
      </div>
    </div>
  );
}
