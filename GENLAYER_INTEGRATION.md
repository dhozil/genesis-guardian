# GENESIS GUARDIAN — GenLayer Integration Plan

**Phase:** 1 — Architecture & Feasibility · **Deliverable 8**
**Source of truth:** official documentation (verified routes described in FEASIBILITY_REPORT §2).

---

## 1. Verified Interface Inventory (what we will actually use)

All items below were read from the official docs; nothing is invented.

| Concern | Interface we use | Doc source |
|---|---|---|
| Contract skeleton | `# { "Depends": "py-genlayer:<pinned>" }` line 1 · `class X(gl.Contract)` · `@gl.public.view` / `@gl.public.write` · `__init__` undecorated | first-contract, first-intelligent-contract |
| Storage | `TreeMap[K, V]`, `DynArray[T]`, `u256/i256`, `bigint`, `Address`; `@allow_storage @dataclass` for structured values; no `dict`/`list` fields | storage, types/collections |
| Clock | `gl.message_raw.datetime` (transaction time — deterministic across validators); `gl.message.sender_address` / `origin_address` / `contract_address` / `chain_id` | transaction-context |
| HTTP evidence | `gl.nondet.web.get(url)` · `gl.nondet.web.post(url, body=...)` (JSON-RPC `eth_call`/`eth_getTransactionReceipt`) · `.status_code`, `.body` — nondet only | web-access |
| LLM analysis | `gl.nondet.exec_prompt(prompt, response_format='json')` — nondet only; max 2 images (unused in MVP) | calling-llms |
| Equivalence | `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)` (primary) · `gl.eq_principle.strict_eq` for byte-stable derivations · error classes `[EXPECTED]/[EXTERNAL]/[TRANSIENT]/[LLM_ERROR]` | equivalence-principle, error-handling |
| VM results | `gl.vm.Return(.calldata)` / `gl.vm.UserError(.message)` / `gl.vm.VMError`; `isinstance` checks first | equivalence-principle |
| Cross-contract reads | `gl.get_contract_at(Address(...))` → `.view().method()` (sync) | interacting-with-intelligent-contracts |
| Cross-contract actions | `.emit(on='finalized').method(...)` (async child tx; ≤~6× re-emission → idempotent receivers) | messages, interacting-with-intelligent-contracts |
| Deployment | `genlayer deploy --contract … --args …` (str/int/float/bool) · `deploy/*.ts` scripts with `waitForFinalization()` + `isSuccessful()` · `gl.deploy_contract` factory (unused in MVP) | cli-deployment, deploy-scripts, messages |
| Validation | `genvm-lint check <file>` (lint + validate, `--json`) | tooling-setup |
| Fast tests | `genlayer-test` direct mode: `direct_deploy`, `direct_vm`, `mock_web`, `mock_llm`, `run_validator`, `snapshot`/`revert`, `expect_revert` — ms/test, no network | testing |
| Consensus tests | `gltest tests/integration/ --network studionet` with `get_contract_factory`, `.transact()`, `.call()`, `tx_execution_succeeded` | testing + integration skill |
| Receipts / finality | `genlayer receipt <txId>` / `gen_getTransactionStatus` / `gen_getTransactionLifecycle` — **off-chain only** | finality, cli-receipt, cli-transaction-lifecycle |
| Upgradability | `gl.storage.Root` + `lock_default()` (automatic) — **we register no upgraders ⇒ frozen code** | upgradability |
| Fees | `estimateTransactionFees({...})` for time-units / execution / message budgets | fees-and-transaction-kit |

**Explicitly NOT used (unsupported or unverified):** `@gl.evm.contract_interface`
(not functional in Studio), `gl.evm` in general for MVP, IPFS (unverified), on-chain reads of
other transactions' statuses (no API), on-chain schedulers (none documented), wall-clock time,
block numbers.

---

## 2. How Each Project Module Maps to GenLayer Primitives

| Project module | GenLayer primitive(s) | Determinism strategy |
|---|---|---|
| A — Reporting | `@gl.public.write` + `TreeMap`/`DynArray` records + `gl.message_raw.datetime` | Fully deterministic code |
| B — Evidence | Storage records + `gl.nondet.web.*` fetch/verify inside analyzer | Verification verdicts consensus-checked (rerun fetch + compare) |
| C — Threat analysis | `gl.nondet.exec_prompt` inside `gl.vm.run_nondet_unsafe` | Independent validator rerun; decision-field equality; schema/policy post-checks in code |
| D — Decision/validation | The tx lifecycle itself: Leader → committee commit-reveal → Accepted / Undetermined; appeals by anyone | Platform consensus; we consume `FINALIZED` receipts off-chain |
| E — Emergency halt | Deterministic gates in `GenesisGuardian` + `emit(on='finalized')` to `PauseableTarget` | No nondeterminism anywhere in this path |
| F — Lifeform | `gl.nondet.exec_prompt` proposal generation (P3) + deterministic protected-rule validation + governance writes | Same equivalence pattern as C; activation is governance-gated code |
| Governance | `Address` equality checks (`gl.message.sender_address == governance`) | Deterministic |
| Orchestration | Off-chain keeper (CLI/SDK) — **labeled off-chain** | Keeper has no privileges; gates re-verified on-chain |

---

## 3. Network & Fee Plan

| Phase | Network | Why | Notes |
|---|---|---|---|
| Development (tests, iteration) | **localnet** (`genlayer up` / GLSim) | Full GenVM + consensus locally, no rate limits, Docker/Studio available | Heavy suites run here |
| MVP integration | **studionet** (61999) — current active network | Hosted Studio, gasless-ish, account `genlayer_dev` funded; no setup | Rate limits: 60 req/min · 1000/hr · 10000/day · max 32 in-flight tx/sender → keeper paces `.transact()` |
| Later validation | **testnet-bradbury** (4221) | Real network with faucet when EVM-target question (open question #1) is tested | Requires funded keys via env |

Fee handling: keeper estimates with `estimateTransactionFees` before `assess` (the expensive
tx); deterministic txs submitted in bounded batches; receipts awaited before the next batch
(respects the in-flight cap).

---

## 4. Decision Process Documentation (required by Module D)

**What is decided by the Intelligent Contract:**
schema/enum validity of the assessment, which incident/evidence/policy inputs enter the
analysis (read deterministically before the nondet block), post-block sanity + policy-enum
checks, `assessment_seq` increment, and storage of the verdict fields.

**What is checked by validators:**
that the leader's nondeterministic work reproduces — the validator **re-runs** evidence
fetching and the LLM analysis independently, then compares the decision fields
(`threat_category`, `threat_level`, `recommended_action`, `evidence_conflict` exactly;
`confidence_level` by bucket). Deterministic contract code must match exactly across all
executions. A validator that only checked JSON shape would *not* be consensus (docs rule) —
our validator never does that.

**What happens when an Accepted decision exists:**
the assessment is stored (provisional). The keeper waits for **FINALIZED** (appeals
exhausted/window closed), then calls the permissionless `syncDecision`, which — reading the
assessment + policy + evidence — moves the incident to CONFIRMED / REJECTED / INCONCLUSIVE and
records a decision history entry. CONFIRMED is a *status*, not an action.

**What happens when validators disagree:**
the platform rotates the leader and retries. If disagreement persists with no funded
rotation left → status **Undetermined → contract state unchanged** → keeper observes the
receipt off-chain and either retries `assess` or surfaces the incident for appeal.
Undetermined can never produce a halt (P5).

**How changed evidence affects a decision:**
new evidence → anyone calls `reassess` → new consensus round → `seq+1` supersedes the prior
assessment; `syncDecision` re-evaluates. If an emergency is already ACTIVE, changed evidence
feeds the re-evaluation/recovery path — it never auto-unpauses or auto-escalates.

**Who can appeal:**
anyone, during the appeal window, by paying bond + funding (`genlayer appeal <txId>` /
`genlayer appeal-bond <txId>`). Validator appeal → fresh committee re-judges the original
proposal; leader appeal → new proposal round. GENESIS GUARDIAN's keeper *monitors* lifecycle
statuses and can fund an appeal if an assessment it depends on is under challenge — while
holding emergency actions until FINALIZED (G4).

**Under what conditions an emergency is permitted:**
only the eleven gates in CONTRACT_DESIGN §5, all evaluated in deterministic contract code,
plus the target's own guardian-role check, plus finality of the assessment (off-chain gate +
`on='finalized'` emission). AI output influences gate *inputs*, never gate *logic*.

---

## 5. Error & Failure Handling (per docs error taxonomy)

| Class | Example | Contract behavior |
|---|---|---|
| `[EXPECTED]` | gate failed, unauthorized caller, duplicate id, bad enum | `gl.vm.UserError` — deterministic, identical across validators; no state change |
| `[EXTERNAL]` | RPC/web unreachable, target rejected | reported as verification `UNAVAILABLE` / retryable; assessment path fails closed |
| `[TRANSIENT]` | timeout, rate-limit, leader/validator infra blip | validators treat transient-vs-transient as agreement on retry; keeper backs off |
| `[LLM_ERROR]` | model unavailable, response unparseable | validators disagree → rotation → no state → INCONCLUSIVE path; never a halt |
| Platform statuses | LeaderTimeout / ValidatorsTimeout / Undetermined | handled off-chain by keeper (retry, appeal); no on-chain state change |

Defensive parsing: LLM JSON is validated in code after the nondet block (schema allowlist,
enum membership, size caps) — malformed output cannot become stored state.

---

## 6. Integration Constraints & Their Consequences (honest limitations)

1. **No on-chain scheduler** → autonomy = permissionless entry points + off-chain keeper
   (anyone can run it). The system is *self-enforcing*, not *self-clocking*.
2. **No on-chain cross-tx status reads** → finality gating (G4) is implemented by the keeper
   using receipt/lifecycle APIs before calling `initiateEmergency`; the design never trusts
   provisional state for irreversible external effects.
3. **EVM external pause unavailable in Studio** → MVP target is a GenLayer-native
   `PauseableTarget`; EVM integration deferred to a Bradbury spike (Phase 4 open question).
4. **Web data is untrusted and variable** → every fetch is inside the equivalence-checked
   nondet path; corroboration counts derive from stored verification records, not fetch trust.
5. **Accepted ≠ finalized ≠ succeeded** → integration tests assert
   `tx_execution_succeeded(receipt)` *and* lifecycle state before reading state (gltest rule).
6. **Message duplication (≤6×)** → all receivers idempotent; no `on='accepted'` dependency.
7. **Studionet rate limits** → keeper/test pacing, receipts-before-next-batch, heavy runs on localnet.
8. **Frozen code** → bug fixes require redeploy + governance-approved migration of policy/state
   references (documented in DEPLOYMENT.md); accepted trade-off for v1 security.

---

## 7. GenLayer Integration Checklist (Definition of Done per phase)

- [ ] Every contract starts with the pinned runner header (exact hash)
- [ ] `genvm-lint check` exits 0 on all contracts (lint + validate)
- [ ] Direct-mode tests green (mocks labeled `mock_*`, confined to tests/)
- [ ] Integration tests green on studionet with `tx_execution_succeeded` + FINALIZED assertions
- [ ] Receipts polled via documented lifecycle APIs; keeper paces within rate limits
- [ ] Deployment scripts wait for finalization and verify success before wiring
- [ ] Scenario A–H covered (TESTING.md) with results recorded
- [ ] No claim of "works" without the corresponding executed test output
