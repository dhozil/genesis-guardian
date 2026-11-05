import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { GENLAYER_RPC, GUARDIAN_ADDRESS } from "@/lib/chain";
import type { ConsensusSummary, TxOutcome } from "@/lib/types";
import type { Eip1193Provider } from "@/hooks/useWallet";

type AnyClient = ReturnType<typeof createClient>;
type GetTransactionArgs = Parameters<AnyClient["getTransaction"]>[0];

let readClient: AnyClient | null = null;

/**
 * Created lazily because this module is also evaluated during server rendering:
 * the browser instance is the one that must resolve the same-origin endpoint.
 */
function getReadClient(): AnyClient {
  if (!readClient) {
    readClient = createClient({ chain: studionet, endpoint: GENLAYER_RPC });
  }
  return readClient;
}

// studionet allows 30 gen_call per minute. Reads are serialised with a gap and
// duplicated calls are coalesced, otherwise a single screen refresh trips the
// limit and every read silently falls back to empty state.
const MIN_READ_GAP_MS = 2100;
const READ_CACHE_MS = 3000;

let readChain: Promise<unknown> = Promise.resolve();
let lastReadAt = 0;
const inflightReads = new Map<string, Promise<unknown>>();
const recentReads = new Map<string, { at: number; value: unknown }>();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRateLimited(error: unknown): boolean {
  const text = String(
    (error as { message?: string; shortMessage?: string })?.shortMessage ??
      (error as { message?: string })?.message ??
      error ?? "",
  );
  return /rate limit|too many requests|429/i.test(text);
}

function enqueueRead<T>(task: () => Promise<T>): Promise<T> {
  const run = readChain.then(async () => {
    const wait = Math.max(0, MIN_READ_GAP_MS - (Date.now() - lastReadAt));
    if (wait > 0) await sleep(wait);
    lastReadAt = Date.now();
    return task();
  });
  readChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function parseReturn<T>(raw: unknown): T {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed) as T;
      } catch {
        return raw as T;
      }
    }
  }
  return raw as T;
}

/** Call a view method. Errors bubble up so the caller can show them. */
export async function readMethod<T = unknown>(
  functionName: string,
  args: unknown[] = [],
  address: string = GUARDIAN_ADDRESS,
): Promise<T> {
  const key = `${address}:${functionName}:${JSON.stringify(args)}`;

  const pending = inflightReads.get(key);
  if (pending) return pending as Promise<T>;

  const cached = recentReads.get(key);
  if (cached && Date.now() - cached.at < READ_CACHE_MS) {
    return cached.value as T;
  }

  const call = () =>
    getReadClient().readContract({
      address: address as `0x${string}`,
      functionName,
      args: args as never[],
      jsonSafeReturn: true,
    });

  const promise = enqueueRead(async () => {
    let raw: unknown;
    try {
      raw = await call();
    } catch (error) {
      if (!isRateLimited(error)) throw error;
      await sleep(6000); // one patient retry, then let the UI show the truth
      raw = await call();
    }
    return parseReturn<T>(raw);
  });

  inflightReads.set(key, promise);
  void promise
    .then((value) => {
      recentReads.set(key, { at: Date.now(), value });
    })
    .catch(() => undefined)
    .finally(() => {
      inflightReads.delete(key);
    });

  return promise;
}

/** Read a method, returning `fallback` instead of throwing (for optional panels). */
export async function tryReadMethod<T>(
  functionName: string,
  args: unknown[] = [],
  fallback: T,
): Promise<T> {
  try {
    return await readMethod<T>(functionName, args);
  } catch (error) {
    // Visible on purpose: a silent fallback makes a broken RPC look like empty
    // state. The UI keeps rendering, but the console says exactly why.
    console.warn(`[guardian] read ${functionName} failed`, error);
    return fallback;
  }
}

function walletClient(provider: Eip1193Provider, account: string): AnyClient {
  // Writes need an account, not just a provider: the SDK validates it before
  // encoding the call and throws "No account set" otherwise. Passing the bare
  // address makes viem treat it as a JSON-RPC account, so the signature still
  // happens in the wallet — no key ever reaches this code.
  return createClient({
    chain: studionet,
    endpoint: GENLAYER_RPC,
    provider: provider as never,
    account: account as `0x${string}`,
  });
}

export function summarizeConsensus(tx: unknown): ConsensusSummary {
  const record = (tx ?? {}) as Record<string, unknown>;
  const consensus = (record.consensus_data ?? {}) as Record<string, unknown>;
  const votes = (consensus.votes ?? {}) as Record<string, string>;
  const leaderReceipt = (consensus.leader_receipt ?? []) as Array<
    Record<string, unknown>
  >;
  const leader = leaderReceipt[0] ?? {};

  let agree = 0;
  let disagree = 0;
  let idle = 0;
  for (const vote of Object.values(votes)) {
    const value = String(vote).toLowerCase();
    if (value === "agree") agree += 1;
    else if (value === "disagree") disagree += 1;
    else idle += 1;
  }

  const resultName = (record.resultName ?? record.result_name) as string | undefined;
  const executionResult = (record.txExecutionResultName ??
    leader.execution_result) as string | undefined;

  // FINALIZED alone is not proof: MAJORITY_DISAGREE discards every write.
  const committed =
    resultName === "MAJORITY_AGREE" || (agree > 0 && agree > disagree);

  return {
    resultName,
    executionResult,
    leaderVote: leader.vote as string | undefined,
    agree,
    disagree,
    idle,
    rounds: (record.numOfRounds ?? record.num_of_rounds) as string | undefined,
    committed,
  };
}

const CONTRACT_ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/duplicate incident_id/i, "That incident id already exists — choose a new one."],
  [
    /requires UNDER_INVESTIGATION/i,
    "The incident must be under investigation before it can be assessed.",
  ],
  [/already resolved/i, "This incident is already resolved."],
  [/duplicate evidence_id/i, "That evidence id already exists for this incident."],
  [/must be 1\.\.|must be string|max \d+ entries/i, "Input rejected by the contract validator."],
  [/cooldown/i, "Emergency cooldown is still active. Wait for it to expire."],
  [/\[LLM_ERROR\]/i, "The AI output did not satisfy the contract's schema."],
];

function extractContractError(tx: unknown): string | undefined {
  const record = (tx ?? {}) as Record<string, unknown>;
  const consensus = (record.consensus_data ?? {}) as Record<string, unknown>;
  const receipts = (consensus.leader_receipt ?? []) as Array<Record<string, unknown>>;
  const raw = String(receipts[0]?.error ?? "");
  if (!raw) return undefined;

  const tagged = raw.match(/\[(EXPECTED|LLM_ERROR|TRANSIENT)\][^"\\\n]{0,240}/);
  if (tagged) return tagged[0].split("\\n")[0].trim();
  return raw.split("\n").find((line) => line.trim().length > 0)?.slice(0, 240);
}

/** Human explanation for a contract-level failure (never a raw traceback). */
export function humanizeReadError(error: unknown): string {
  if (isRateLimited(error)) {
    return "Studionet allows 30 reads per minute. The console queues them — wait a few seconds and refresh.";
  }
  const message = String(
    (error as { shortMessage?: string })?.shortMessage ??
      (error as { message?: string })?.message ??
      "Could not read the contract.",
  );
  if (/fetch|network|cors/i.test(message)) {
    return "The RPC could not be reached from the browser. In dev, reads go through the Vite proxy — check the dev server.";
  }
  return message;
}

export function humanizeContractError(raw?: string): string {
  if (!raw) return "The contract execution failed.";
  const clean = raw.replace(/^\[EXPECTED\]\s*/, "").replace(/^\[LLM_ERROR\]\s*/, "");
  for (const [pattern, message] of CONTRACT_ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return `${message} (contract said: ${clean})`;
    }
  }
  return clean;
}

const TERMINAL = new Set(["FINALIZED", "CANCELED", "UNDETERMINED"]);

/**
 * Submit a write, then poll until the network reaches a terminal state.
 * Reports progress so the UI can show signature → pending → consensus.
 */
export async function submitAndWait(params: {
  provider: Eip1193Provider;
  account: string;
  functionName: string;
  args: unknown[];
  consensusMaxRotations?: number;
  onUpdate: (patch: Partial<TxOutcome>) => void;
}): Promise<TxOutcome> {
  const { provider, account, functionName, args, consensusMaxRotations, onUpdate } = params;
  const client = walletClient(provider, account);

  onUpdate({ phase: "submitting", message: undefined, hash: undefined });

  let hash: string;
  try {
    hash = String(
      await client.writeContract({
        address: GUARDIAN_ADDRESS as `0x${string}`,
        functionName,
        args: args as never[],
        value: 0n,
        ...(consensusMaxRotations ? { consensusMaxRotations } : {}),
      }),
    );
  } catch (error) {
    throw error; // wallet-level rejection: caller maps it with mapWalletError
  }

  onUpdate({
    phase: "pending",
    hash,
    statusName: "PENDING",
    message: "Broadcast accepted — waiting for validators.",
  });

  const deadline = Date.now() + 6 * 60 * 1000;
  let last: unknown = null;

  while (Date.now() < deadline) {
    try {
      last = await client.getTransaction({ hash } as unknown as GetTransactionArgs);
    } catch {
      // transient RPC hiccup: keep polling until the deadline
    }

    if (last) {
      const statusName = String(
        (last as Record<string, unknown>).statusName ??
          (last as Record<string, unknown>).status_name ??
          "",
      );
      if (statusName) {
        onUpdate({ statusName, consensus: summarizeConsensus(last) });
      }
      if (TERMINAL.has(statusName)) break;
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  const consensus = summarizeConsensus(last);
  const statusName = String(
    (last as Record<string, unknown> | null)?.statusName ?? "PENDING",
  );
  const contractError = extractContractError(last);
  const success =
    statusName === "FINALIZED" &&
    consensus.committed &&
    (consensus.executionResult ?? "SUCCESS") === "SUCCESS";

  if (success) {
    const outcome: TxOutcome = {
      phase: "success",
      hash,
      statusName,
      consensus,
      message: "Committed by validator consensus.",
    };
    onUpdate(outcome);
    return outcome;
  }

  let message: string;
  if (statusName !== "FINALIZED") {
    message =
      "The transaction did not finalize within 6 minutes. It may still land — check the hash before retrying.";
  } else if (!consensus.committed) {
    message =
      "Validators did not agree (MAJORITY_DISAGREE), so nothing was written. This is expected for AI steps — retry.";
  } else if (contractError) {
    message = humanizeContractError(contractError);
  } else {
    message = "Leader execution failed inside the contract.";
  }

  const outcome: TxOutcome = {
    phase: "error",
    hash,
    statusName,
    consensus,
    message,
  };
  onUpdate(outcome);
  return outcome;
}

export { createClient, studionet };
