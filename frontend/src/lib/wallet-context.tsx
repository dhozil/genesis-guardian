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
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pendingRdns, setPendingRdns] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (wallet.status === "connected") {
      setPickerOpen(false);
      setPendingRdns(null);
    }
    if (wallet.status === "disconnected" && wallet.error) {
      setPendingRdns(null);
    }
  }, [wallet.error, wallet.status]);

  const openPicker = React.useCallback(() => {
    wallet.clearError();
    setPickerOpen(true);
  }, [wallet]);

  const closePicker = React.useCallback(() => {
    if (wallet.status !== "connecting") setPickerOpen(false);
  }, [wallet.status]);

  const select = React.useCallback(
    async (rdns: string) => {
      setPendingRdns(rdns);
      await wallet.connect(rdns);
      setPendingRdns(null);
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
