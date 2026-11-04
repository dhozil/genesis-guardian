"use client";
import * as React from "react";
import { tryReadMethod } from "@/lib/genlayer";
import type { ProtocolState } from "@/lib/types";

/**
 * Polls `get_state`. Reads never need a wallet, but studionet caps gen_call at
 * 30/minute, so the interval stays conservative and errors are swallowed by
 * `tryReadMethod` (the UI shows the last good value instead of a scary banner).
 */
export function useProtocolState(intervalMs = 30000) {
  const [protocol, setProtocol] = React.useState<ProtocolState | null>(null);

  React.useEffect(() => {
    let alive = true;
    const tick = async () => {
      const state = await tryReadMethod<ProtocolState | null>("get_state", [], null);
      if (alive) setProtocol(state);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), intervalMs);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return protocol;
}
