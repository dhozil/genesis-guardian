# GENESIS GUARDIAN — Project Feasibility Report

**Phase:** PHASE 1 — ARCHITECTURE & FEASIBILITY
**Status:** COMPLETE — approved for Phase 2 (MVP) implementation
**Date:** 2026-11-02
**Source of truth:** https://docs.genlayer.com/ (official GenLayer documentation, verified as described below)

> All GenLayer capabilities claimed in this report were checked against the official
> documentation. Items that could not be confirmed are labeled **OPEN QUESTION** and are
> not treated as available capabilities.

---

## 1. Development Environment Inspection

Inspected locally on the target machine:

| Component | Observed value | Status |
|---|---|---|
| `genlayer` CLI | **0.39.2** | ✅ Installed |
| Node.js | v24.15.0 | ✅ |
| npm | 11.12.1 | ✅ |
| Python | 3.12.10 | ✅ (meets Python 3.12+ requirement of the testing suite) |
| Git | 2.56.0.windows.2 | ✅ |
| Active network | `studionet` (Genlayer Studio Network), chainId **61999**, RPC `https://studio.genlayer.com/api` | ✅ |
| Consensus contract | `0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575` | ✅ |
| Explorer | `https://genlayer-explorer.vercel.app` | ✅ |
| Active account | `genlayer_dev` — `0x3958a649b41cd7c8561f4233cc0f5b0469bc98e0` | ✅ |
| Account balance | 99,604.46 GEN (Studionet is gasless for EVM-layer ops; protocol fees still apply) | ✅ |
| Workspace | Empty (fresh project, only `.freebuff/` marker) | ✅ Clean start |

Toolchain installed and verified during Phase 1:

| Tool | Version | Verification |
|---|---|---|
| `genvm-lint` (genvm-linter) | 0.11.1-rc.2 | `genvm-lint --version` → OK |
| `gltest` (genlayer-test) | 0.29.2 | `gltest --version` → OK (pytest 9.1.1) |
| `genlayer-py` (host-side SDK) | 0.16.3 | `pip show genlayer-py` → OK |
| in-VM `genlayer` module | not importable on host | ✅ **Expected** — the `genlayer` Python module runs inside GenVM (provided by the pinned runner), not on the host. Direct-mode tests embed it via genlayer-test. |

**Environment verdict: FEASIBLE.** The documented toolchain (CLI, linter, test suite, host SDK)
installs and runs on this machine. No environment blockers found.

---

## 2. Official Documentation Verification

`docs.genlayer.com` blocks automated fetchers (HTTP 403). Documentation was verified through
two independent routes that return identical content:

1. The docs source repository `github.com/genlayerlabs/genlayer-docs` (raw MDX files — same content the site renders).
2. A text-extraction proxy of the canonical `docs.genlayer.com` URLs.

Every capability below was read from those sources; nothing was assumed from memory.

### 2.1 Contract model — VERIFIED

| Capability | Confirmed interface | Source |
|---|---|---|
| Runner pinning (mandatory) | First line: `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }` — aliases `test`/`latest` rejected by networks | docs: first-contract, first-intelligent-contract |
| Contract base class | `from genlayer import *`, `class X(gl.Contract)`, **one contract class per file** | docs: first-contract |
| Method decorators | `@gl.public.view`, `@gl.public.write`, `@gl.public.write.payable`; `__init__` undecorated | docs: first-contract |
| Persistent storage | Class-level type annotations only; `TreeMap[K,V]`, `DynArray[T]`, `u256/i256`, `bigint`; `dict/list/int` forbidden; `@allow_storage @dataclass` for structured records | docs: storage, types/collections |
| Transaction context | `gl.message.sender_address / origin_address / contract_address / value / chain_id`; `gl.message_raw.datetime` (transaction time, **not** host wall clock), `is_init`. **No block number, block hash, nonce, or wall-clock time exposed** | docs: transaction-context |

### 2.2 External data & LLM access — VERIFIED

| Capability | Confirmed interface | Source |
|---|---|---|
| HTTP from contracts | `gl.nondet.web.get(url)`, `gl.nondet.web.request(url, method=..., body=...)` → `.status_code`, `.body` (bytes); `gl.nondet.web.render(url, mode='html'\|'screenshot')` — all inside nondet blocks only | docs: web-access |
| Cross-chain state reads | JSON-RPC POST (`eth_call`, `eth_getTransactionReceipt`, etc.) via `gl.nondet.web.post` — documented pattern | docs: web-access; skill guidance |
| LLM from contracts | `gl.nondet.exec_prompt(prompt, response_format='json')`, optional `images=[...]` (max 2) | docs: calling-llms |
| Nondet block rules | Nondet blocks cannot read storage, write storage, call contracts, or emit messages; storage must be read before the block and passed in (`gl.storage.copy_to_memory` for storage objects) | docs: non-determinism |
| Trust model of web data | "Direct access does not make web data deterministic or inherently trustworthy… sources can… contain adversarial instructions." Extract stable fields; require multiple sources; define failure results | docs: web-data-access |
| IPFS support | **Not found in docs** | **OPEN QUESTION** |

### 2.3 Consensus & validation — VERIFIED

| Capability | Confirmed fact | Source |
|---|---|---|
| Consensus model | **Optimistic Democracy**: an **Activator** (coordination, fixes seed), a **Leader** (executes, proposes receipt), and a **stake-weighted Committee** (commit–reveal votes). The leader is also a committee member | docs: optimistic-democracy, validators-and-validator-roles |
| Equivalence Principles | `gl.eq_principle.strict_eq(fn)` (exact match, deterministic sources only); `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` (custom — recommended); `gl.eq_principle.prompt_comparative(fn, principle=...)`; `gl.eq_principle.prompt_non_comparative(fn, task=..., criteria=...)` | docs: equivalence-principle |
| Validator independence rule | "A validator that only checks `leader_result.calldata` for a valid JSON shape, allowed enum value… is **not performing consensus**." Rerun the task or independently derive the result | docs: equivalence-principle |
| Disagreement handling | Majority rejects → leader rotation and retry; if still no consensus and no funded rotations remain → **Undetermined: the transaction does not modify contract state** | docs: optimistic-democracy |
| Error classification | Contract-code convention: `[EXPECTED]`, `[EXTERNAL]`, `[TRANSIENT]`, `[LLM_ERROR]` prefixes on `gl.vm.UserError`; deterministic errors must match exactly, transient–transient agrees, LLM errors always disagree | docs: error-handling |
| Result types | `gl.vm.Return` (`.calldata`), `gl.vm.UserError` (`.message`), `gl.vm.VMError`; always `isinstance` check first | docs: equivalence-principle |

### 2.4 Transaction lifecycle & appeals — VERIFIED

| Capability | Confirmed fact | Source |
|---|---|---|
| Lifecycle statuses | 14 statuses: Uninitialized, Pending, Proposing, Committing, Revealing, **Accepted**, Undetermined, **Finalized**, Canceled, AppealCommitting, AppealRevealing, ValidatorsTimeout, LeaderTimeout, LeaderRevealing. **There is no `SUBMITTED` status at the GenLayer layer** (submission is a separate EVM tx on GenLayer Chain) | docs: transaction-statuses |
| Accepted vs Finalized | **Accepted = provisional, appealable**; "Applications that need irreversible settlement should wait for `Finalized`." **Finalized = terminal**, appeal process complete. Neither status implies execution success — check execution result too | docs: finality, consensus-v06-migration |
| Appeals | Anyone may appeal an eligible tx during its **appeal window** by paying **bond + funding** (quoted by consensus contracts). **Validator appeal**: a fresh committee re-evaluates the *original* proposal; if majority differs → recomputation. **Leader appeal**: starts a new proposal round. Committee sizes grow: 5 → 7 (appeal) → 11 → … | docs: appeal-process |
| Appeal window | Duration is a **governance-managed parameter** — no fixed seconds published; must read the lifecycle projection. Window pauses while a validator appeal votes; a successful appeal grants a fresh window | docs: appeal-process |
| Message duplication | `emit(on='accepted')` messages can be re-emitted across appeal rounds **up to ~6 times**; receivers **must be idempotent**. `on='finalized'` is the safe default | docs: messages, interacting-with-intelligent-contracts |
| Reading other tx status on-chain | **No documented API** for a contract to read another transaction's status. Status inspection is off-chain (`gen_getTransactionStatus`, `genlayer receipt`) | docs: finality (absence noted) |

### 2.5 Cross-contract interaction — VERIFIED

| Capability | Confirmed interface | Source |
|---|---|---|
| Contract references | `gl.get_contract_at(Address(...))` or `@gl.contract_interface` typed form (same runtime value) | docs: interacting-with-intelligent-contracts |
| Sync reads | `other.view().method()` — reads state as of current block, returns immediately | same |
| Async writes | `other.emit(on='accepted').method()` / `other.emit(on='finalized').method()` — child tx created when parent reaches that state, then goes through consensus independently. In child context, `gl.message.sender_address` = calling contract | docs: messages |
| External EVM messages | `@gl.evm.contract_interface` — **only `on='finalized'`**; and **"not functional in Studio"** (EVM interaction beyond value transfers to EOAs is not implemented in Studio) | docs: interacting-with-intelligent-contracts, studio limitations |
| Factory deploys | `gl.deploy_contract(code=..., args=[...], salt_nonce=..., on=...)` — child contracts **immutable** after deployment | docs: messages |

### 2.6 Deployment, testing, upgradability — VERIFIED

| Capability | Confirmed interface | Source |
|---|---|---|
| CLI deploy | `genlayer deploy --contract <path> --args ...` — constructor args `str/int/float/bool` only; **lists not supported** (use deploy scripts); prints tx hash + contract address | docs: cli-deployment |
| Deploy scripts | `deploy/` folder of TS/JS files run in filename order with a GenLayerJS client; must `waitForFinalization` + `isSuccessful()` | docs: deploy-scripts |
| Linter | `genvm-lint check contracts/x.py` (AST safety + SDK semantic validation, `--json` supported) | docs: tooling-setup |
| Direct-mode tests | `genlayer-test` pytest suite: fixtures `direct_deploy`, `direct_vm`, `direct_alice`…; cheatcodes `mock_web`, `mock_llm`, `snapshot/revert`, `expect_revert`, `run_validator`; milliseconds/test, no network | docs: testing |
| Integration tests | `gltest tests/integration/ -v -s [--network studionet]`; `get_contract_factory`, `.transact()`, `.call()`, `tx_execution_succeeded(receipt)`; real consensus + real LLM/web | docs: testing; skill guidance |
| Upgradability | `gl.storage.Root` with `upgraders` + `locked_slots`; deploy auto-calls `root.lock_default()` locking root/code/locked_slots/upgraders. Upgraders may replace `code` if storage layout preserved (append-only). **Freezing (empty upgraders) is irreversible** | docs: upgradability |
| Fees | Per-tx fee deposit: leader/validator **time units**, execution budget, message budget; `estimateTransactionFees({...})`; unused budget refunded at finalization | docs: fees-and-transaction-kit |
| Networks | `localnet` (61127), `studionet` (61999, rate-limited 60 req/min · 1000/hr · 10000/day, max 32 in-flight txs/sender), `testnet-bradbury` (4221), studio-dev preview (61997). `testnet-asimov` not listed on current Networks page | docs: networks; CLI notes |

---

## 3. Feasibility Verdict per GENESIS GUARDIAN Module

| Module | Feasible? | Implementation basis on GenLayer | Constraints / caveats |
|---|---|---|---|
| **A — Security Reporting** | ✅ YES | Deterministic `@gl.public.write` intake into an incident registry contract; unique IDs, reporter, `gl.message_raw.datetime` timestamps | Anyone can write → submitter pays fees (natural spam cost); optional deposit = Phase 4 hardening |
| **B — Evidence Collection** | ✅ YES (with limits) | Evidence stored as typed records; verification via `gl.nondet.web.get` (HTTP, JSON-RPC) + `gl.nondet.exec_prompt` extraction inside nondet blocks with custom equivalence | Web data is untrusted and variable; Studio web access depends on its WebDriver environment; **no IPFS (OPEN QUESTION)**; monitoring coverage = only sources reachable over HTTPS/RPC — **not** "all chains automatically" |
| **C — Intelligent Threat Analysis** | ✅ YES | `ThreatAnalyzer` contract: LLM assessment via `exec_prompt(response_format='json')`, validated by `gl.vm.run_nondet_unsafe` — validator **reruns** the analysis and compares decision fields; deterministic schema/policy post-checks in contract code | LLM nondeterminism handled by equivalence principle; cost = leader+validator time units per assessment |
| **D — GenLayer Decision & Validation** | ✅ YES | The assessment **write transaction itself** is the consensus decision: leader proposes receipt → committee evaluates equivalence → Accepted (provisional) / Undetermined (no state change). Appeals available to anyone; finality observed off-chain via `genlayer receipt` | Quorum computed on-chain by consensus contracts (exact % not published — protocol detail, not needed by us); **contracts cannot read other tx statuses on-chain** → finality gating is off-chain/keeper-driven |
| **E — Emergency Halt** | ✅ YES — **on a GenLayer target contract** | Guardian contract holds the emergency state machine + deterministic gates; executes pause on an explicitly integrated `PauseableTarget` intelligent contract via `emit(on='finalized')`, target checks `sender == guardian` | **An IC cannot arbitrarily pause external EVM contracts**: `@gl.evm.contract_interface` is **not functional in Studio** and finalized-only. MVP targets a GenLayer-native pauseable contract. EVM-target support = **OPEN QUESTION** (test on Bradbury later) |
| **F — Lifeform / Self-Evolution** | ✅ YES — **as versioned data, not code** | Policies stored as versioned records; AI (LLM nondet) *proposes* JSON change-sets; deterministic protected-rule validation; **governance address** activates/rolls back via policy-manager writes. Code itself frozen (no upgraders registered) | No on-chain scheduler → proposal generation is triggered off-chain (permissionless keeper) after resolution; AI never receives write authority |
| Dashboard (§10) | ✅ YES (Phase 3) | Off-chain frontend reading contract state over RPC/SDK (`genlayer call` / genlayer-py / explorer) | Must render AI-recommendation vs validator-decision vs executed-action vs governance-approval as distinct states |
| Autonomous scheduling | ⚠️ PARTIAL | No documented on-chain cron/scheduler. Autonomy model = **permissionless deterministic entry points + off-chain keeper** anyone can run | Keeper is an ordinary off-chain service (labeled as such); keeper compromise cannot violate gates (all checks deterministic on-chain) |

### What GENESIS GUARDIAN explicitly does NOT claim

1. **Not** continuous monitoring of every blockchain. Coverage depends on submitted reports and
   the HTTPS/JSON-RPC sources contracts can actually fetch.
2. **Not** an arbitrary cross-chain kill switch. Emergency authority exists only over contracts
   that explicitly integrate the Guardian's pause interface.
3. **Not** infallible AI consensus. Validator disagreement → rotation → possibly *Undetermined*;
   the system must handle "no decision" as a first-class outcome.
4. **Not** self-modifying executable code. v1 evolves **data policies** under governance only.

---

## 4. Key Architecture Conclusions (Phase 1 decisions)

1. **Six Intelligent Contracts** (5 in Phase 2 MVP + 1 in Phase 3), each a single class per file:
   `SecurityPolicyManager`, `IncidentRegistry`, `ThreatAnalyzer`, `GenesisGuardian`,
   `PauseableTarget`, plus `LifeformEngine` (Phase 3). Rationale: separate *untrusted-input
   records* and *AI nondeterminism* from *emergency authority* and *policy governance* — the
   security boundaries that matter — while avoiding needless async emits inside one workflow.
2. **Finality gating:** emergency actions are only initiated after the assessment transaction is
   **FINALIZED** (observed off-chain by the keeper), and the pause message itself uses
   `on='finalized'` — two independent protections against appeal-reversal.
3. **Idempotency everywhere:** all cross-contract messages tolerate up-to-~6x re-emission
   (pause/unpause/record methods are no-ops when already in target state).
4. **Deterministic emergency gates:** the LLM only *recommends*. Every activation condition
   (status, threat level, confidence, corroborated-source count, cooldown, policy allowance,
   target capability) is checked in **contract code** — AI output cannot authorize a halt.
5. **Three-tier configuration:** immutable safety rules (structural, enforced by validation
   logic + frozen code) / governed security policies (versioned, governance-activated) /
   operational parameters (keeper-observable but policy-bounded).
6. **Policy lives in its own contract** so analyzer and guardian only ever `view()` it —
   least privilege: neither can write policy.
7. **Code is frozen in v1:** no upgraders registered → `lock_default()` semantics make the
   deployed bytecode immutable; bug fixes = redeploy + governance-approved migration.
8. **Orchestration is off-chain and permissionless:** a keeper script advances deterministic,
   permissionlessly-callable state transitions and waits for FINALIZED where required.

---

## 5. Technical Risks

| # | Risk | Impact | Mitigation (designed into architecture) |
|---|---|---|---|
| R1 | Prompt injection via evidence/web content manipulates the LLM | Wrong threat assessment | Evidence = untrusted data (delimited, size-capped, "never instructions" system framing); independent validator rerun; **deterministic gates** in contract code override any LLM claim; strict schema allowlists; Scenario C test |
| R2 | Leader & validator LLMs share the same bias/model → false consensus | False-positive or false-negative halt | Decision-field comparison + deterministic sanity rules; threat gates require *corroborated on-chain/external evidence counts derived in code*, not LLM confidence alone; INCONCLUSIVE default on insufficiency; appeals allow challenge |
| R3 | Appeal reverses an Accepted assessment after emergency initiated | Emergency based on overturned decision | Finality gating (wait FINALIZED); `emit(on='finalized')`; recovery/false-positive path; re-assessment supersedes |
| R4 | Duplicate re-emitted messages (≤~6x) cause double actions | Double pause / corrupted history | Idempotent receivers; keyed records (`incident_id`); sequence numbers for assessments |
| R5 | Validator disagreement → *Undetermined* leaves incident stuck | Liveness gap | Keeper observes receipt status off-chain; retry/re-submit; appeal funded by anyone; **no state change on Undetermined** (safe by design) |
| R6 | Studionet rate limits (60/min, 1000/hr, 10000/day; 32 in-flight) break test suites | CI failures | Pace transactions, wait for receipts, heavy batches on localnet/GLSim |
| R7 | LLM unavailability / format breakage during analysis | Failed assessments | `[LLM_ERROR]` → validator disagrees → rotation; defensive JSON parsing/aliasing; assessment fails closed → INCONCLUSIVE, never a halt |
| R8 | Spam/DoS via free report submission | Storage bloat, keeper noise | Submitter bears tx fees; field length caps; keeper rate-limits investigation starts; deposit scheme reserved for Phase 4 |
| R9 | Governance key compromise → malicious policy change | Protocol subversion | Protected-rule layer rejects destructive proposals structurally; recommend multisig/timelock for governance (documented, deployment-time choice); rollback preserves history |
| R10 | Keeper unavailable | Flow stalls (not unsafe) | All entry points permissionless — anyone can run the keeper; deterministic transitions are idempotent |
| R11 | External RPC/web sources lie or change between leader/validator fetches | Inconsistent evidence verification | Stable-field extraction, derived-status comparison, multi-source corroboration counts, explicit `[EXTERNAL]/[TRANSIENT]` error classes |
| R12 | Target contract not actually pausable / wrong wiring | Emergency silently fails | Target integration is explicit (guardian role + `pause()`); `confirmEmergency` verifies `target.view().paused` before EMERGENCY_ACTIVE; deployment smoke tests |

---

## 6. Open Technical Questions (unresolved — tracked, not assumed)

1. **EVM-target emergency integration from an IC.** `@gl.evm.contract_interface` is documented
   as *not functional in Studio* and finalized-only. Will it work on Testnet Bradbury?
   → Resolve in Phase 4 by an explicit Bradbury spike. MVP uses a GenLayer-native target.
2. **Appeal window duration** is governance-managed with no fixed value published. → Keeper must
   read the transaction lifecycle projection (`gen_getTransactionLifecycle` / receipt polling)
   instead of assuming seconds.
3. **On-chain scheduler.** No documented cron/timer in GenVM. → Keeper model adopted; revisit if
   docs publish a scheduler.
4. **Exact committee quorum percentage** — computed on-chain by consensus contracts; not
   published as a single number. → Not required by our design (we consume Accepted/Finalized/Undetermined).
5. **`genlayer-py` full API surface** — the API-reference page could not be read (404/PyPI block).
   → MVP interaction uses the verified `genlayer` CLI + documented deploy-script JS client;
   Python client usage limited to what genlayer-test exercises.
6. **IPFS / formal HTTPS restrictions** — not found in docs. → Design assumes HTTPS only.
7. **Numeric storage/compute caps** — no explicit figures found. → Fee estimation via
   `estimateTransactionFees`; keep on-chain records lean (JSON strings, bounded arrays).
8. **`testnet-asimov` status** — absent from the current Networks page. → Treated as unavailable;
   networks used: studionet (dev/tests), localnet (heavy tests), testnet-bradbury (later phases).

---

## 7. Phase 1 Status Report

**What was implemented:** Research, environment verification, and the complete Phase 1
documentation set (feasibility, architecture, component matrix, data-flow, threat model,
repo structure, contract design, GenLayer integration plan, security model, lifeform design,
testing plan, deployment plan). **No contract or application code was written** — per the
development rules, implementation starts only after this report.

**Files created:**

| File | Purpose |
|---|---|
| `README.md` | Project entry point, status, deliverable index |
| `PROJECT_OVERVIEW.md` | Vision, objectives, workflow, glossary |
| `FEASIBILITY_REPORT.md` | This document (deliverable 1 + phase report) |
| `ARCHITECTURE.md` | System architecture + diagram (deliverable 2) |
| `COMPONENT_RESPONSIBILITY_MATRIX.md` | Deliverable 3 |
| `DATA_FLOW.md` | Data-flow diagrams (deliverable 4) |
| `THREAT_MODEL.md` | Security threat model (deliverable 5) |
| `REPO_STRUCTURE.md` | Repository structure (deliverable 6) |
| `CONTRACT_DESIGN.md` | Smart contract design (deliverable 7) |
| `GENLAYER_INTEGRATION.md` | GenLayer integration plan (deliverable 8) |
| `SECURITY_MODEL.md` | Policy tiers & guardrails |
| `LIFEFORM_EVOLUTION.md` | Self-evolution design + safety rules |
| `TESTING.md` | Test strategy & scenario matrix (plan) |
| `DEPLOYMENT.md` | Deployment plan (plan) |

**Dependencies (verified installed):** genlayer CLI 0.39.2 · genvm-linter 0.11.1-rc.2 ·
genlayer-test 0.29.2 · genlayer-py 0.16.3 · Python 3.12.10 · Node 24 / npm 11.

**Tests performed:** (Phase 1 has no contract code — verification was environmental and documentary)
1. Toolchain install/version checks — **PASS** (all tools respond).
2. Network/account/config inspection — **PASS** (studionet reachable config, funded account).
3. Capability verification against official docs (§2, two independent doc routes) — **PASS**;
   every claimed capability has a source; unconfirmed items listed as open questions.

**Known limitations:** docs site blocks direct fetchers (worked around via source repo);
genlayer-py API reference unread; no code written yet (by design).

**Remaining work:** Phase 2 MVP — implement the five Phase 2 contracts, deploy scripts, keeper,
direct + integration tests for Scenarios A–E, and demonstrate the
report → evidence → assessment → consensus → emergency → history flow on studionet.

---

## 8. Feasibility Verdict

**GENESIS GUARDIAN is FEASIBLE on GenLayer as designed.** Every capability required for the
MVP (Modules A–E) maps to a verified, documented GenLayer interface. The Lifeform Engine
(Module F) is feasible as **governance-validated, versioned policy evolution** — explicitly not
as unrestricted code self-modification, which is both unsupported by the safety requirements
and unnecessary for the project's goals. The principal constraints (no on-chain scheduler,
no arbitrary external-contract pause in Studio, no on-chain cross-tx status reads, untrusted
web data) are handled by the architecture above and documented as limitations rather than
hidden behind simulated functionality.
