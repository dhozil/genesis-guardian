# GENESIS GUARDIAN — frontend

Next.js application for the `GenesisGuardian` intelligent contract on GenLayer
studionet. It does three things and nothing else:

1. **Reads the protocol** straight from the contract (real `gen_call`, no mock API).
2. **Surfaces the AI consensus** — the assessment produced by `gl.nondet.exec_prompt`
   plus per-source verification from `gl.nondet.web.get`.
3. **Sends writes** signed by the user's own wallet, with explicit guards so a
   double click can never produce two transactions.

## Stack

| Piece | Version / choice |
|---|---|
| Framework | Next.js 16.4.5 (App Router, Turbopack) |
| React | 19 + TypeScript strict |
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss` |
| Components | shadcn-style primitives in `src/components/ui` |
| Motion | `framer-motion` (hero only) |
| Icons | `lucide-react` |
| Chain access | `genlayer-js` 1.1.8 (official SDK) |
| RPC transport | server-side route handler at `/genlayer-rpc` |
| Wallets | EIP-6963 discovery: MetaMask, Rabby, any injected EVM wallet |

## Project structure

```
frontend/
├─ next.config.ts
├─ postcss.config.mjs        # @tailwindcss/postcss
├─ tsconfig.json             # strict, paths { "@/*": ["./src/*"] }
└─ src/
   ├─ app/                   # App Router (routes only)
   │  ├─ layout.tsx          # metadata, Providers, AppShell
   │  ├─ page.tsx            # /
   │  ├─ console/page.tsx    # /console
   │  ├─ how-it-works/page.tsx
   │  ├─ not-found.tsx       # native 404
   │  ├─ genlayer-rpc/route.ts # same-origin JSON-RPC proxy
   │  └─ globals.css         # Tailwind v4 @theme tokens (ink / signal / panel…)
   ├─ views/                 # page bodies (NOT src/pages — Next reserves that)
   │  ├─ Landing.tsx
   │  ├─ ConsolePage.tsx
   │  └─ HowItWorks.tsx
   ├─ components/
   │  ├─ ui/
   │  │  ├─ crypto-hero.tsx   # the requested hero, retuned to this theme
   │  │  ├─ button.tsx        # loading state = built-in double-submit guard
   │  │  ├─ badge.tsx
   │  │  └─ field.tsx         # Label / Input / Textarea / Select
   │  ├─ AppShell.tsx         # header/footer placement per route
   │  ├─ Providers.tsx        # client wallet provider
   │  ├─ GuardianLogo.tsx
   │  ├─ SiteHeader.tsx       # nav + wallet chip (overlay or sticky)
   │  ├─ SiteFooter.tsx
   │  ├─ ProtocolTelemetry.tsx
   │  ├─ ConsensusPanel.tsx   # AI consensus + evidence verification
   │  ├─ IncidentConsole.tsx  # reads + guarded writes
   │  ├─ TxStatus.tsx         # signature → pending → consensus → final
   │  └─ WalletPicker.tsx     # explicit wallet chooser
   ├─ hooks/
   │  ├─ useWallet.ts         # discovery, connect, chain, error mapping
   │  └─ useProtocolState.ts  # get_state poll
   └─ lib/
      ├─ chain.ts             # studionet 61999 + guardian address
      ├─ genlayer.ts          # SDK wrapper, consensus summary, error text
      ├─ wallet-context.tsx   # one wallet instance shared by every page
      ├─ types.ts             # contract-shaped types
      └─ utils.ts             # cn(), shortHex()
```

`src/views` (not `src/pages`) is deliberate: in a `src/`-rooted Next project
`src/pages` means the **Pages Router**, so page bodies live in `views/` and the
App Router files in `src/app` stay thin (route + `metadata` + render).

## Run

```bash
cd frontend
npm install
npm run dev        # http://127.0.0.1:5180
npm run build      # next build
npm start          # production server on 5180
npm run typecheck  # tsc --noEmit
```

### Configuration

`.env.local` (optional):

```
NEXT_PUBLIC_GUARDIAN_ADDRESS=0x…        # defaults to the deployment below
NEXT_PUBLIC_GENLAYER_RPC=…              # override the read endpoint entirely
```

Default contract: `0x0a138C4F8d5E7F06f597a8203F1B9916a552D8B3` (studionet).
The chain is fixed in `src/lib/chain.ts` (`61999`, RPC `https://studio.genlayer.com/api`) —
it mirrors `genlayer-py` / `genlayer-js` chain metadata.

## Pages

| Route | Purpose |
|---|---|
| `/` | Landing: hero, capabilities, five-step pipeline, entry points into the app |
| `/console` | Operations console: protocol strip, incident lifecycle, AI consensus panel, guarded writes |
| `/how-it-works` | Mechanism: pipeline, consensus guarantees, emergency state machine, policy gates, full 14 read / 14 write reference |

The landing supplies its own overlay header through the hero's `headerSlot`, so
the sticky `SiteHeader` only appears on inner pages — one header component, two
placements. Unknown routes hit the native App Router `not-found` page.

## Why a server-side RPC route

`https://studio.genlayer.com/api` answers **without** `Access-Control-Allow-Origin`,
so a browser cannot call it cross-origin. `src/app/genlayer-rpc/route.ts` forwards
JSON-RPC to studionet from the server, and the client always talks to
`/genlayer-rpc` on its own origin:

- works in `next dev` **and** in production (the earlier Vite proxy only existed
  in the dev server, so a built SPA could not read at all),
- keeps the endpoint out of CORS entirely, no wildcard proxy required,
- transport failures return a real JSON-RPC error object instead of an opaque 500.

The route runs on the Node runtime (`runtime = "nodejs"`) and is dynamic, never
cached, because every call is a fresh `gen_call`.

## Wallet connection — no competing popups

`window.ethereum` is ambiguous when both MetaMask and Rabby are installed: the
last one injected usually wins, and legacy flows can leave two requests pending.
This app therefore uses **EIP-6963**:

1. On mount it dispatches `eip6963:requestProvider` and listens for
   `eip6963:announceProvider`, collecting one entry per `rdns`
   (`io.metamask`, `io.rabby`, …).
2. `Connect wallet` opens **our own picker** listing those wallets. The user
   chooses one; only that provider receives `eth_requestAccounts`.
3. If nothing announced (older wallets), the legacy `window.ethereum` fallback is
   used — including `window.ethereum.providers`, so each injected wallet is still
   listed separately and addressed individually.
4. A synchronous `useRef` guard blocks a second `connect()` while one is running,
   which is what actually prevents the double-popup race.
5. Reconnecting silently uses `eth_accounts` (never opens a popup) and remembers
   the chosen `rdns` in `localStorage`.
6. If the wallet is on another chain, the app calls `wallet_switchEthereumChain`
   and, on error `4902`, `wallet_addEthereumChain` with the studionet parameters.

Handled wallet errors (mapped to one sentence each): `4001` rejected, `-32002`
request already pending, `4100` unauthorised, `4902` unknown chain, `-32603`
RPC failure, plus `accountsChanged` / `chainChanged` / `disconnect` listeners.

One wallet instance lives in `lib/wallet-context.tsx`, so the header, the landing
hero and the console all show the same account and share one picker.

## Reads that surface the AI consensus

| Read | Used for |
|---|---|
| `get_assessment(incident)` | threat level/category, confidence, recommended action, conflict flag, model reasoning, `unresolved_questions` |
| `get_evidence_for_incident(incident)` | per-source `collection_status` (VERIFIED / FAILED / UNAVAILABLE) and `corroborated` |
| `get_incident`, `get_incident_ids` | status, reporter, target, evidence ids |
| `get_history` | audit trail (report → evidence → investigation → assessment → decision → resolution) |
| `get_state`, `get_policy` | protocol strip and hero telemetry |

Studionet allows **30 `gen_call` per minute**, so reads are serialised with a
2.1 s gap, in-flight duplicates are coalesced, results are cached for 3 s, and a
rate-limited call gets one patient retry. The console reads only three methods per
refresh and derives the rest from `get_state`.

The consensus panel states the honest rule the contract enforces: validators compare the five decision fields plus each source's derived status and
content match, and the verdict is
persisted **only** when a validator majority votes `agree`.

## Writes — guards, success and failure

Every write goes through one path (`submitAndWait` in `src/lib/genlayer.ts`):

1. `phase: submitting` — the wallet is signing; buttons are disabled.
2. `phase: pending` — hash returned, polling `getTransaction` until a terminal
   status (max 6 minutes). Live `statusName` and vote counts are shown.
3. `phase: success` — only when **all** of: status `FINALIZED`,
   `resultName === MAJORITY_AGREE` (or agree > disagree), and leader execution
   `SUCCESS`. `MAJORITY_DISAGREE` is reported as "nothing was written — retry",
   which is the true behaviour for nondeterministic AI steps.
4. `phase: error` — a sentence, not a traceback: contract gate messages are
   translated (`[EXPECTED]`/`[LLM_ERROR]` stripped, common cases explained),
   wallet rejections are mapped by code.

Double-submit protection is three-layered: a synchronous `inFlight` ref in the
console, per-action `busy` keys that disable **all** write buttons while one runs,
and `<Button loading>` which disables itself and sets `aria-busy`.

Writes exposed: `submit_report`, `append_evidence`, `startInvestigation`,
`assess` (rotations 5), `syncDecision`, `reassess`, `initiateEmergency`,
`confirmEmergency`, `requestRecovery`, `confirmRecovery`, `resetToNormal`,
`resolveIncident`, `set_policy`, `rollback`.

## Limitations

- Reads need no wallet; writes need studionet GEN for gas.
- `assess` can legitimately fail to reach consensus (`MAJORITY_DISAGREE`); the
  console surfaces it as a retryable error instead of pretending the state changed.
- No transaction history indexer: the audit trail shown is the contract's own
  `get_history` for the selected incident.
- The `/genlayer-rpc` route is an open same-origin proxy; it only forwards JSON-RPC
  and holds no credentials, but a public deployment should still rate-limit it.

## Verification hardening (contract-side)

- `require_content_match` is an optional policy key that makes the evidence gate
  stricter: a 2xx page which never mentions the incident's target address or any
  submitted tx hash is stored as `FAILED`, so HTTP success alone cannot satisfy
  G7. Policies with the original five keys keep the previous behaviour.
- Validators compare each source's derived `status` (VERIFIED / FAILED /
  UNAVAILABLE) and its content-match flag, not just a collapsed boolean, so a
  leader cannot pass off `UNAVAILABLE` as `FAILED`.
- Every assessment persists `content_hash` (FNV-1a over the fetched bytes),
  `fetched_at` and `content_match` per evidence, and appends an
  `EVIDENCE_VERIFIED` audit entry tagged with the assessment sequence number.
