# GENESIS GUARDIAN — Security Model

**Phase:** 1 — Architecture & Feasibility
**Philosophy:** AI investigates · Validators evaluate · Smart contracts enforce · Governance controls evolution.

---

## 1. Three Configuration Tiers

Everything the system can "configure" belongs to exactly one tier. Tier is enforced by
*where* the data lives and *who* can write it — not by convention.

| Tier | Content | Mutability | Writer | Enforcement |
|---|---|---|---|---|
| **Tier 1 — Immutable safety rules** | Emergency-gate logic (G1–G11), protected policy paths (safety rules, recovery rules, roles, validator requirements, rollback, gate-threshold floors), evidence taxonomy enums, idempotency rules, finality gating, code bytecode | **Never** (v1 = frozen code, no upgraders registered) | Nobody — exists only as contract code + structural validators | `lock_default()` at deploy; protected-path validation rejects any proposal touching these; tests P1–P9 |
| **Tier 2 — Governed security policies** | min_confidence, min_corroborating_sources, allowed_threat_levels, allowed_actions, cooldowns, recovery_requires_governance, auto_recovery, evidence/report caps | Versioned changes only (append N+1; rollback re-activates a prior version — history never deleted) | **Governance address only** (multisig recommended) — via `SecurityPolicyManager.set_policy` / `rollback`; Phase 3: only payloads that passed LifeformEngine validation | `set_policy` caller check + full schema/enum/protected-path validation; every version stored with `activated_by` + timestamp |
| **Tier 3 — Operational parameters** | Keeper pacing, investigation start policy, report field input caps (hard constants), retry/backoff, fee budgets, dashboard refresh | Off-chain or contract constants; policy-bounded where dynamic | Keeper operators / deploy-time constants — **cannot weaken Tier 2 thresholds or Tier 1 rules** | Keeper has no write authority beyond permissionless methods; constants verified by tests; any "policy-bounded" value clamped to policy ranges in code |

**Invariant:** Tier 3 can never increase capability; Tier 2 can never touch Tier 1; Tier 1 is
not reachable by any transaction.

---

## 2. Authorization Matrix

| Action | Reporter | Keeper (any account) | ThreatAnalyzer (contract) | Governance | AI/LLM |
|---|---|---|---|---|---|
| Submit report / append evidence (USER_CLAIM/EXTERNAL) | ✅ | ✅ | — | ✅ | ❌ |
| Record evidence verification | ❌ | ❌ | ✅ (caller-gated) | ❌ | indirect (consensus result only) |
| startInvestigation / syncDecision / reassess | ❌ | ✅ (deterministic, permissionless) | ❌ | ✅ | ❌ |
| Store assessment | ❌ | calls `assess` | ✅ via consensus (leader proposes, validators verify) | ❌ | **recommends only** |
| initiateEmergency / confirmEmergency / confirmRecovery | ❌ | ✅ (but every gate checked in code) | ❌ | ❌ (gates apply to everyone) | ❌ |
| requestRecovery | ❌ | ❌ | ❌ | ✅ only | ❌ |
| set_policy / rollback | ❌ | ❌ | ❌ | ✅ only (P3: validated payloads only) | ❌ propose-only |
| activate proposal (P3) | ❌ | ❌ | ❌ | ✅ only | ❌ |
| pause/unpause target | ❌ | ❌ | ❌ | ❌ | ❌ — **only GenesisGuardian contract** |
| linkAnalyzer / setGuardian / setTarget (wiring) | ❌ | ❌ | ❌ | ✅ one-time | ❌ |
| resolveIncident | ❌ | ✅ only for REJECTED/INCONCLUSIVE with no active emergency | ❌ | ✅ always | ❌ |
| Upgrade code (v1) | ❌ | ❌ | ❌ | ❌ — **frozen** | ❌ |

---

## 3. Guardrails Against Unauthorized Change

1. **Contract code never evolves in v1.** No upgraders → upgrade attempts fail; AI has no path
   to source code, storage-layout, or role fields.
2. **Policy writes are structurally validated before storage:** required keys, enum membership,
   numeric ranges, and protected-path rejection (any key whose name/hash matches the frozen
   protected set → `UserError [EXPECTED]`). Validation code is itself Tier 1.
3. **Versioned history + rollback:** every activation appends; rollback re-activates an older
   payload as a *new* version — full audit trail, no deletion, instant undo of a bad policy.
4. **Recovery is governance-gated:** AI or keepers cannot unpause; `requestRecovery` requires
   the governance address and is recorded in history.
5. **Wiring setters are one-time:** analyzer/guardian/target addresses lock after deploy;
   re-wiring attempts rejected.
6. **Emergency gates are fail-closed:** any missing/contradictory evidence, failed fetch, LLM
   error, or unknown state → no transition. "No decision" is always safe.
7. **Idempotency:** duplicate messages and repeated permissionless calls cannot double-act.
8. **Least privilege for intelligence:** analyzer and guardian obtain policy by `view()` only;
   neither can write it; the LifeformEngine cannot write it at all.

---

## 4. Anti-Prompt-Injection Design (defense in depth)

| Layer | Mechanism |
|---|---|
| Input framing | Evidence/web/LLM content enters prompts as delimited JSON *data* with an explicit system instruction that it is untrusted and never instructions |
| Size bounding | Contract truncates evidence fields to caps before prompting (no hidden tail instructions) |
| Schema allowlist | Output parsed defensively; only the 11 known fields, known enums, bounded lengths survive — anything else dropped/rejected in code |
| Consensus rerun | Validator independently re-fetches and re-prompts; decision fields must match exactly — an injection that only affects one run is filtered |
| Deterministic gates | Even a fully manipulated assessment can at worst yield an assessment that **fails** G5–G8; contract code, not the model, decides |
| Separation | AI_INTERPRETATION evidence type is never counted toward corroboration |
| Fail-closed defaults | Parse/validation/consensus failure → INCONCLUSIVE — never EMERGENCY_* |
| Testing | Scenario C (prompt injection attempt) must prove no emergency occurs |

**Residual risk (documented):** a *persistent* injection embedded in evidence that survives
into every validator's rerun and aligns with a genuinely high-severity reading could influence
the verdict fields. Corroboration requirements, conflict-flagging, appeal rights, governance
recovery, and false-positive review are the compensating controls. This residual risk is
accepted and stated in THREAT_MODEL (T3/T4).

---

## 5. Emergency Safety Invariants (asserted in tests)

- E1: No path from `submit_report` to `EMERGENCY_*` exists in code.
- E2: No `initiateEmergency` succeeds without a CONFIRMED incident + ACCEPTED assessment + all gates G1–G11.
- E3: No pause reaches the target from any address other than the Guardian contract.
- E4: No state change occurs on Undetermined / failed consensus.
- E5: No unpause occurs without governance `requestRecovery`.
- E6: Every emergency/recovery transition appends a history entry (action, incident, actor, time).
- E7: Mock/simulated data paths exist only in tests (P2 enforcement — grep-testable).
