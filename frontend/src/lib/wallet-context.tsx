"use client";
import * as React from "react";
import { WalletPicker } from "@/components/WalletPicker";
import { useWallet, type WalletController } from "@/hooks/useWallet";

interface GuardianWallet {
  wallet: WalletController;
  pickerOpen: boolean;
  pendingRdns: string | null;
  openPicker: () => void;
  closePicker: () => void;
}

const WalletContext = React.createContext<GuardianWallet | null>(null);

/**
 * One wallet instance for the whole app: the header, the landing hero and the
 * console all read the same account, so a connect or a disconnect is reflected
 * everywhere without re-prompting the wallet.
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const [pickerRequested, setPickerRequested] = React.useState(false);
  const [pendingRdns, setPendingRdns] = React.useState<string | null>(null);

  // Derived instead of effect-synced: once the wallet connects the picker is
  // closed by definition, so no setState-in-effect is needed.
  const pickerOpen = pickerRequested && wallet.status !== "connected";

  const openPicker = React.useCallback(() => {
    wallet.clearError();
    setPickerRequested(true);
  }, [wallet]);

  const closePicker = React.useCallback(() => {
    if (wallet.status !== "connecting") setPickerRequested(false);
  }, [wallet.status]);

  const select = React.useCallback(
    async (rdns: string) => {
      setPendingRdns(rdns);
      try {
        await wallet.connect(rdns);
      } finally {
        setPendingRdns(null);
      }
    },
    [wallet],
  );

  const value = React.useMemo<GuardianWallet>(
    () => ({ wallet, pickerOpen, pendingRdns, openPicker, closePicker }),
    [closePicker, openPicker, pendingRdns, pickerOpen, wallet],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <WalletPicker
        open={pickerOpen}
        onClose={closePicker}
        wallets={wallet.wallets}
        pendingRdns={pendingRdns}
        error={wallet.error}
        onSelect={(rdns) => void select(rdns)}
      />
    </WalletContext.Provider>
  );
}

export function useGuardianWallet(): GuardianWallet {
  const context = React.useContext(WalletContext);
  if (!context) {
    throw new Error("useGuardianWallet must be used inside <WalletProvider>");
  }
  return context;
}
