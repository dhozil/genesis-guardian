# GENESIS GUARDIAN — Security Threat Model

**Phase:** 1 — Architecture & Feasibility · **Deliverable 5**
**Scope:** GENESIS GUARDIAN contracts (reporting, evidence, analysis, decision, emergency,
lifeform) + off-chain keeper/dashboard + the controlled target contract.
**Assume:** attackers are adversarial reporters, malicious evidence sources, LLM manipulation
attempters, validator-level adversaries within the consensus model, governance misuse, and
keeper/dashboard compromise. The GenLayer consensus layer itself (stake, slashing, committee
honesty) is treated as the platform assumption, not re-secured here.

---

## 1. Assets

| Asset | Where it lives | Impact if compromised |
|---|---|---|
| Emergency authority (pause/unpause) | GenesisGuardian state + target guardian-role | Illicit halt of the protected protocol, or blocked halt during a real attack |
| Policy integrity | SecurityPolicyManager versions | Weakened thresholds → false halts / missed attacks; destructive rules |
| Incident & evidence integrity | IncidentRegistry | Poisoned decisions, history rewriting, cover-up of an attack |
| Assessment consensus | ThreatAnalyzer records | Fabricated threat verdicts |
| Immutable safety rules / code | Contract bytecode + protected fields | Permanent subversion of the system (worst case) |
| Governance key(s) | Off-chain key material | Policy activation, recovery authorization, wiring abuse |
| LLM/web access | Nondet channels | Prompt injection, data exfiltration attempts, poisoned evidence |
| Availability of the flow | Keeper + rate-limited network | Stalled investigations (fail-safe, not fail-open) |

---

## 2. Threat Analysis (STRIDE + project-specific)

| ID | Category | Threat | Vector | Existing mitigation (design) | Residual risk |
|---|---|---|---|---|---|
| T1 | **Spoofing** | Fake reporter/evidence claims a fake exploit | Malicious `submit_report` / evidence entries | Evidence taxonomy: USER_CLAIM never counts alone; corroboration derived from verified entries; submitter pays fees; deterministic gate re-checks | Well-crafted fake *external* sources can still count → multi-source requirement + appeal |
| T2 | **Spoofing** | Attacker calls target `pause()` directly | EOA/contract calls target | Target checks `gl.message.sender_address == guardian` (only Guardian contract passes) | None if wiring verified by deployment test |
| T3 | **Tampering** | Prompt injection in evidence/web content steers the LLM | Evidence text, fetched pages, tx-memo content | Evidence = untrusted data: delimited, size-capped, explicit "never instructions" system framing; strict schema allowlist (unknown fields dropped); **deterministic gates in contract code** — injected output can at worst produce a *rejected* assessment; independent validator rerun; Scenario C test | Same-model leader+validator could share a manipulated verdict → mitigated by corroboration counts + appeal + conflict flag; residual = accepted risk, documented |
| T4 | **Tampering** | Malicious "evidence" claims instructions inside LLM prompts (e.g., "ignore policy") | As above | Contract builds prompts from structured fields only; policy checks are code, not prompt; recommended_action constrained to policy enum in code | Residual as T3 |
| T5 | **Repudiation** | Actor denies submitting a report / governance denies a policy change | Off-chain dispute | Every record keyed to `gl.message.sender_address` / `origin_address` + `gl.message_raw.datetime`; append-only history | Governance is a single address in MVP → multisig recommended (T11) |
| T6 | **Repudiation** | Claim "the AI decided" vs "validators decided" confusion | Dashboard misrepresentation | Distinct stored states: assessment (recommendation), decision status (consensus), action history (executed), proposal vs activated policy; dashboard must render them separately (§10) | Dashboard is off-chain — not part of trust path |
| T7 | **Information disclosure** | Prompt tries to exfiltrate contract/other data via LLM output | Injected prompt content | LLM output passes only into stored assessment fields (no external calls from output); no secrets exist in contract storage (everything on-chain is public anyway) | On-chain data is inherently public — no confidentiality claims made |
| T8 | **Denial of service** | Report spam bloats storage / keeper overwhelmed | Mass `submit_report` | Field length caps, id uniqueness, per-incident evidence caps, submitter fee cost, keeper rate-limits investigation starts; deposit scheme reserved (Phase 4) | Studionet fee-less environment makes spam cheap there → tests paced; production target should use fee-bearing network |
| T9 | **Denial of service** | Flood assessments to drain time-units / force Undetermined churn | Repeated `assess` calls | Assessment keyed per incident (re-assessment supersedes, seq guard); keeper paces; consensus economics (appeal/rotation costs) | Cost-based mitigation only |
| T10 | **Denial of service** | Exhaust appeals to keep a tx provisional forever | Appeal spam | Appeal costs bond+funding (economics); keeper waits for FINALIZED before acting — **fail-safe stall**, never a premature halt | Liveness depends on appeal economics (platform-level) |
| T11 | **Elevation of privilege** | Compromise of governance key → malicious policy / forced recovery | Key theft | Protected-rule validation rejects destructive shapes structurally (Phase 3); recovery is the *only* governance bypass of emergency state and is history-recorded; recommend multisig/timelock; rollback exists to undo policy harm | Single-key MVP → residual risk accepted and documented for Phase 2 |
| T12 | **Elevation of privilege** | AI grants itself rights via evolution proposal | Malicious/buggy proposal generation | AI never writes policy directly; proposals only *suggest*; protected paths (safety rules, roles, recovery, validator requirements, emergency gates, rollback) structurally rejected; governance activation required | Proposal content is untrusted input to validation — validation must be exhaustive (tested, Scenario G) |
| T13 | **Elevation of privilege** | Keeper tries to skip gates | Modified keeper scripts | Keeper holds no special rights; every step re-verifies on-chain; permissionless entry means a *hostile* keeper gains nothing | None |
| T14 | **Elevation of privilege** | LLM output smuggles a state change | Malformed/hostile JSON | Schema validation in code; only allowlisted fields stored; enums enforced; unknown fields dropped; `gl.vm.UserError [EXPECTED]` on violation | None if validation exhaustive |
| T15 | **Logic — false positive halt** | Legit protocol wrongly paused | Bad reports + weak evidence + LLM bias | Confidence + corroboration thresholds from policy; conflict flag blocks HIGH+; appeal path; governance recovery; false-positive review marks history and feeds proposals | Wrong-but-consensus verdict possible → recovery path is the designed countermeasure |
| T16 | **Logic — false negative** | Real attack missed | Suppressed reports, slow keeper, weak policy | Multiple reporters can submit; INCONCLUSIVE status visible on dashboard; policy tightening via evolution; keeper availability is permissionless | Coverage limitation stated in project scope (not all chains monitored) |
| T17 | **Logic — Undetermined limbo** | Incident stuck with no verdict | Persistent validator disagreement | Keeper observes receipt status off-chain → retry/re-assess; anyone may appeal; **no state change** on Undetermined (cannot cause a wrong halt) | Liveness, not safety, affected |
| T18 | **Logic — appeal reversal after action** | Accepted assessment overturned post-halt | Appeal during window | Finality gating (FINALIZED before emergency initiation) + `emit(on='finalized')` double protection; re-assessment supersedes; recovery available | Window length unknown a priori → keeper reads lifecycle; residual minimal |
| T19 | **Logic — duplicate messages** | ≤6× re-emitted pause/unpause corrupts state | Platform message semantics | Idempotent keyed receivers; no design dependency on `on='accepted'` | None if idempotency tested |
| T20 | **Supply chain / integration** | Wrong wiring (guardian not set, wrong analyzer) | Deploy mistake | One-time wiring setters + deploy smoke tests (verify target pauses only for guardian; analyzer linked; policy readable) | Human error → deployment runbook in DEPLOYMENT.md |
| T21 | **Availability — external feeds die** | RPC/web unreachable during analysis | Infrastructure failure | `[EXTERNAL]/[TRANSIENT]` classification; verification status UNAVAILABLE; assessment fails closed to INCONCLUSIVE; retry via re-assess | Fail-closed = missed detection window until feeds recover |
| T22 | **Platform — consensus not reached / leader faults** | LeaderTimeout/ValidatorsTimeout statuses | Network/validator issues | These are *transaction* statuses handled by retry; no state change on failure | Platform-level |

---

## 3. Safety Properties (to be proven by tests, Phase 2/3)

| # | Property | Test scenario |
|---|---|---|
| P1 | A report alone never changes emergency state | B, A |
| P2 | Unvalidated/simulated consensus cannot produce CONFIRMED | B (mock_llm/mock_web must be confined to tests) |
| P3 | Prompt injection in evidence cannot bypass deterministic gates | C |
| P4 | Conflicting/insufficient evidence → INCONCLUSIVE, never EMERGENCY_* | D, B |
| P5 | Validator disagreement → no state change (Undetermined-safe) | E |
| P6 | Only FINALIZED assessments can feed `initiateEmergency` | A (happy path) + E |
| P7 | Only the Guardian contract can pause the target | A + dedicated auth test |
| P8 | Duplicate emits cause no double action | A (repeat confirm/no-op assertions) |
| P9 | AI proposal cannot alter protected rules or self-activate | G |
| P10 | Recovery requires authorization and is history-recorded | H |
| P11 | Rollback restores prior policy without deleting history | H (Phase 3) |
| P12 | All security-critical methods have tests (project rule) | TESTING.md matrix |

---

## 4. Explicit Non-Claims

- GENESIS GUARDIAN does not secure GenLayer consensus itself (staking, committee selection).
- It does not guarantee detection of attacks outside its evidence coverage.
- It does not provide confidentiality — all contract data is public.
- It does not auto-execute LLM recommendations — the halt path is deterministic code.
- Simulated/mocked LLM or web responses exist **only in tests** and are labeled as mocks;
  no production path substitutes mock data (P2 is tested).
