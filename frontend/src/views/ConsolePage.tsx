"use client";
import { IncidentConsole } from "@/components/IncidentConsole";
import { WalletChip } from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { GUARDIAN_ADDRESS, GUARDIAN_CHAIN } from "@/lib/chain";
import { shortHex } from "@/lib/utils";
import { useGuardianWallet } from "@/lib/wallet-context";

export function ConsolePage() {
  const { wallet, openPicker } = useGuardianWallet();

  return (
    <div className="relative">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <p className="mono-label">Operations console</p>
            <h1 className="mt-2 text-balance text-2xl font-bold tracking-tight text-white sm:text-4xl">
              Read the consensus. Then act.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Every read below is a real <code className="text-signal">gen_call</code>{" "}
              against {shortHex(GUARDIAN_ADDRESS, 8, 6)}. The list shows every report
              on this contract, but only <span className="text-text">your own</span>{" "}
              report is preselected — file one to get an incident you can drive
              yourself.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge
                tone={
                  !wallet.account ? "neutral" : wallet.isCorrectChain ? "ok" : "warn"
                }
                dot
              >
                {wallet.account && !wallet.isCorrectChain
                  ? "network mismatch"
                  : `${GUARDIAN_CHAIN.shortName} · ${GUARDIAN_CHAIN.id}`}
              </Badge>
              <Badge tone="signal">28 methods</Badge>
              <Badge tone="neutral">reads need no wallet</Badge>
            </div>
          </div>

          <WalletChip />
        </header>

        <IncidentConsole wallet={wallet} onConnect={openPicker} />
      </div>
    </div>
  );
}
