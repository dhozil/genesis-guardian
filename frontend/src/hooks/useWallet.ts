"use client";
import * as React from "react";
import { GUARDIAN_CHAIN } from "@/lib/chain";

/** Minimal EIP-1193 surface we rely on (MetaMask, Rabby, any injected wallet). */
export interface Eip1193Provider {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: Eip1193Provider[];
}

export interface DetectedWallet {
  /** Stable id: EIP-6963 rdns, or `injected` for the legacy fallback. */
  rdns: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
}

export type WalletError = { code: string; message: string };

export type WalletStatus = "disconnected" | "connecting" | "connected";

const STORAGE_KEY = "genesis-guardian.wallet.rdns";

function toChainId(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = value.startsWith("0x")
      ? Number.parseInt(value, 16)
      : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "number") return value;
  return null;
}

function errorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return undefined;
}

/**
 * Turn provider errors into one actionable sentence. The point is that a user
 * never sees a raw `-32603` blob and never wonders whether the click worked.
 */
export function mapWalletError(error: unknown): WalletError {
  const code = errorCode(error);
  const raw =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");

  if (code === 4001 || /user rejected|denied/i.test(raw)) {
    return {
      code: "REJECTED",
      message: "Request rejected in your wallet. Nothing was sent.",
    };
  }
  if (code === -32002) {
    return {
      code: "PENDING",
      message:
        "Your wallet already has a pending request. Open the extension, finish or dismiss it, then try again.",
    };
  }
  if (code === 4100) {
    return {
      code: "UNAUTHORIZED",
      message: "This account is not authorised for the requested method.",
    };
  }
  if (code === 4902) {
    return {
      code: "UNKNOWN_CHAIN",
      message: `This wallet does not know ${GUARDIAN_CHAIN.name} yet. Approve "Add network" when it appears.`,
    };
  }
  if (/chain|network/i.test(raw) && /mismatch|unsupported|different/i.test(raw)) {
    return {
      code: "CHAIN_MISMATCH",
      message: `Wrong network. Switch your wallet to ${GUARDIAN_CHAIN.name}.`,
    };
  }
  if (code === -32603 || /internal json-rpc/i.test(raw)) {
    return {
      code: "RPC",
      message:
        "The RPC returned an internal error. The network may be busy — retry in a moment.",
    };
  }
  return { code: "UNKNOWN", message: raw || "Wallet request failed." };
}

function legacyWallets(): DetectedWallet[] {
  if (typeof window === "undefined") return [];
  const injected = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!injected) return [];

  // Legacy multi-injected wallets expose `providers` but no EIP-6963 metadata.
  // Listing them separately still guarantees we call exactly one provider.
  if (Array.isArray(injected.providers) && injected.providers.length > 1) {
    const seen = new Set<Eip1193Provider>();
    const list: DetectedWallet[] = [];
    for (const provider of injected.providers) {
      if (seen.has(provider)) continue;
      seen.add(provider);
      const rdns = provider.isRabby
        ? "io.rabby.legacy"
        : provider.isMetaMask
          ? "io.metamask.legacy"
          : `injected.legacy.${list.length}`;
      list.push({
        rdns,
        name: provider.isRabby
          ? "Rabby"
          : provider.isMetaMask
            ? "MetaMask"
            : `Browser wallet ${list.length + 1}`,
        provider,
      });
    }
    return list;
  }

  return [
    {
      rdns: "injected",
      name: injected.isRabby
        ? "Rabby"
        : injected.isMetaMask
          ? "MetaMask"
          : "Browser wallet",
      provider: injected,
    },
  ];
}

export function useWallet() {
  const [wallets, setWallets] = React.useState<DetectedWallet[]>([]);
  const [status, setStatus] = React.useState<WalletStatus>("disconnected");
  const [account, setAccount] = React.useState<string | null>(null);
  const [chainId, setChainId] = React.useState<number | null>(null);
  const [activeRdns, setActiveRdns] = React.useState<string | null>(null);
  const [error, setError] = React.useState<WalletError | null>(null);

  // Refs, not state: these must be correct synchronously to block double submits.
  const inFlight = React.useRef(false);
  const activeProvider = React.useRef<Eip1193Provider | null>(null);
  const listeners = React.useRef<Array<() => void>>([]);

  /* ---------------------------------------------------------------- discovery */
  React.useEffect(() => {
    let cancelled = false;

    const onAnnounce = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          info?: { uuid?: string; name?: string; icon?: string; rdns?: string };
          provider?: Eip1193Provider;
        }>
      ).detail;
      if (!detail?.provider || !detail.info?.rdns) return;
      const entry: DetectedWallet = {
        rdns: detail.info.rdns,
        name: detail.info.name || detail.info.rdns,
        icon: detail.info.icon,
        provider: detail.provider,
      };
      setWallets((current) =>
        current.some((w) => w.rdns === entry.rdns)
          ? current.map((w) => (w.rdns === entry.rdns ? entry : w))
          : [...current, entry],
      );
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Some wallets inject late; keep the legacy fallback only if nothing
    // announced itself, so a 6963-capable wallet is never listed twice.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setWallets((current) => {
        if (current.length > 0) return current;
        return legacyWallets();
      });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, []);

  const detach = React.useCallback(() => {
    listeners.current.forEach((off) => off());
    listeners.current = [];
  }, []);

  /* ------------------------------------------------------------ chain helpers */
  const ensureChain = React.useCallback(
    async (provider: Eip1193Provider): Promise<number> => {
      const current = toChainId(await provider.request({ method: "eth_chainId" }));
      if (current === GUARDIAN_CHAIN.id) return GUARDIAN_CHAIN.id;

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: GUARDIAN_CHAIN.idHex }],
        });
      } catch (switchError) {
        if (errorCode(switchError) !== 4902) throw switchError;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [GUARDIAN_CHAIN.walletParams],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: GUARDIAN_CHAIN.idHex }],
        });
      }
      return GUARDIAN_CHAIN.id;
    },
    [],
  );

  const attach = React.useCallback(
    (provider: Eip1193Provider, rdns: string) => {
      detach();
      activeProvider.current = provider;
      setActiveRdns(rdns);

      if (!provider.on) return;

      const onAccounts = (...args: unknown[]) => {
        const accounts = (args[0] as string[]) ?? [];
        if (!accounts.length) {
          detach();
          activeProvider.current = null;
          setAccount(null);
          setStatus("disconnected");
          setActiveRdns(null);
          window.localStorage.removeItem(STORAGE_KEY);
          setError({
            code: "DISCONNECTED",
            message: "Wallet disconnected. Reconnect to send transactions.",
          });
          return;
        }
        setAccount(accounts[0]);
      };

      const onChain = (...args: unknown[]) => {
        setChainId(toChainId(args[0]));
      };

      const onDisconnect = () => {
        detach();
        activeProvider.current = null;
        setAccount(null);
        setStatus("disconnected");
        setActiveRdns(null);
      };

      provider.on("accountsChanged", onAccounts);
      provider.on("chainChanged", onChain);
      provider.on("disconnect", onDisconnect);
      listeners.current.push(() => {
        provider.removeListener?.("accountsChanged", onAccounts);
        provider.removeListener?.("chainChanged", onChain);
        provider.removeListener?.("disconnect", onDisconnect);
      });
    },
    [detach],
  );

  /* --------------------------------------------------------------- connecting */
  const connect = React.useCallback(
    async (rdns: string) => {
      if (inFlight.current) return; // hard guard: one request at a time, ever
      const wallet = wallets.find((w) => w.rdns === rdns);
      if (!wallet) {
        setError({ code: "NO_WALLET", message: "That wallet is no longer available." });
        return;
      }

      inFlight.current = true;
      setError(null);
      setStatus("connecting");

      try {
        // Only the provider the user picked is asked — no window.ethereum
        // race, so MetaMask and Rabby cannot open competing popups.
        const accounts = (await wallet.provider.request({
          method: "eth_requestAccounts",
        })) as string[];

        if (!accounts?.length) {
          throw Object.assign(new Error("No account returned"), { code: 4100 });
        }

        const chain = await ensureChain(wallet.provider);
        attach(wallet.provider, wallet.rdns);
        setAccount(accounts[0]);
        setChainId(chain);
        setStatus("connected");
        window.localStorage.setItem(STORAGE_KEY, wallet.rdns);
      } catch (caught) {
        activeProvider.current = null;
        setStatus("disconnected");
        setAccount(null);
        setError(mapWalletError(caught));
      } finally {
        inFlight.current = false;
      }
    },
    [attach, ensureChain, wallets],
  );

  /* Silent resume: only eth_accounts, which never opens a popup. */
  React.useEffect(() => {
    if (status !== "disconnected" || account) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const wallet = wallets.find((w) => w.rdns === stored);
    if (!wallet) return;

    let cancelled = false;
    (async () => {
      try {
        const accounts = (await wallet.provider.request({
          method: "eth_accounts",
        })) as string[];
        if (cancelled || !accounts?.length) return;
        const current = toChainId(
          await wallet.provider.request({ method: "eth_chainId" }),
        );
        if (cancelled) return;
        attach(wallet.provider, wallet.rdns);
        setAccount(accounts[0]);
        setChainId(current);
        setStatus("connected");
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account, attach, status, wallets]);

  const disconnect = React.useCallback(() => {
    detach();
    activeProvider.current = null;
    window.localStorage.removeItem(STORAGE_KEY);
    setAccount(null);
    setActiveRdns(null);
    setChainId(null);
    setStatus("disconnected");
    setError(null);
  }, [detach]);

  const switchNetwork = React.useCallback(async () => {
    const provider = activeProvider.current;
    if (!provider || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      const id = await ensureChain(provider);
      setChainId(id);
    } catch (caught) {
      setError(mapWalletError(caught));
    } finally {
      inFlight.current = false;
    }
  }, [ensureChain]);

  React.useEffect(() => detach, [detach]);

  return {
    wallets,
    status,
    account,
    chainId,
    activeRdns,
    error,
    provider: activeProvider,
    isCorrectChain: chainId === GUARDIAN_CHAIN.id,
    connect,
    disconnect,
    switchNetwork,
    clearError: () => setError(null),
  };
}

export type WalletController = ReturnType<typeof useWallet>;
