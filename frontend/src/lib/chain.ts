/** GenLayer studionet, mirrored from genlayer-py / genlayer-js chain metadata. */
export const GUARDIAN_CHAIN = {
  id: 61999,
  idHex: "0xf22f",
  name: "Genlayer Studio Network",
  shortName: "Studionet",
  rpcUrl: "https://studio.genlayer.com/api",
  explorerUrl: "https://genlayer-explorer.vercel.app",
  currency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
  /** Payload for wallet_addEthereumChain when the wallet does not know 61999. */
  walletParams: {
    chainId: "0xf22f",
    chainName: "Genlayer Studio Network",
    nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
    rpcUrls: ["https://studio.genlayer.com/api"],
    blockExplorerUrls: ["https://genlayer-explorer.vercel.app"],
  },
} as const;

/**
 * Deployed GenesisGuardian used by the console.
 * Override with VITE_GUARDIAN_ADDRESS to point at your own deployment.
 */
/**
 * The studionet RPC answers without `Access-Control-Allow-Origin`, so a browser
 * cannot call it cross-origin. In dev/preview we read through the Vite proxy at
 * the same origin; a deployed build should set VITE_GENLAYER_RPC to a
 * CORS-enabled endpoint (or serve the same proxy in front of it).
 */
function resolveRpcUrl(): string {
  const override = (process.env.NEXT_PUBLIC_GENLAYER_RPC as string | undefined)?.trim();
  if (override) return override;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/genlayer-rpc`;
  }
  return GUARDIAN_CHAIN.rpcUrl;
}

export const GENLAYER_RPC: string = resolveRpcUrl();

export const GUARDIAN_ADDRESS: string =
  (process.env.NEXT_PUBLIC_GUARDIAN_ADDRESS as string | undefined)?.trim() ||
  "0x0a138C4F8d5E7F06f597a8203F1B9916a552D8B3";

export function explorerAddressUrl(address: string = GUARDIAN_ADDRESS) {
  return `${GUARDIAN_CHAIN.explorerUrl}/address/${address}`;
}
