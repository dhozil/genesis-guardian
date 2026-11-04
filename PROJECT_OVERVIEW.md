# GENESIS GUARDIAN — Project Overview

**An autonomous security and self-evolving protocol on GenLayer.**
An emergency response + intelligent protection system that detects threats, gathers and
verifies evidence, performs AI-driven analysis validated through decentralized consensus,
and — only through explicit policy and governance — can trigger an emergency halt, recover,
and evolve its own security policies.

**Development philosophy:** *AI investigates. Validators evaluate. Smart contracts enforce.
Governance controls evolution.*

---

## 1. Vision

An intelligent guardian for smart-contract protocols and cross-chain assets that can
independently investigate suspicious activity, evaluate it with human-like intelligence
verified by decentralized consensus, and autonomously coordinate an emergency response —
while remaining bounded by explicit security rules, auditable governance, and a controlled
evolution mechanism that learns from incidents without ever granting the AI unchecked power.

---

## 2. Objectives

- Detect and verify suspicious smart-contract and cross-chain activity.
- Collect, verify, and permanently store security evidence on-chain.
- Use AI for contextual threat analysis — validated by GenLayer consensus, not by any single model run.
- Produce decentralized decisions under an explicit security policy.
- Trigger a protocol-level emergency halt **only when all security gates are satisfied**.
- Protect the original protocol from cascading damage by isolating the affected component.
- Preserve a permanent, auditable history for research, incident response, and governance.
- Continuously evolve security policies in response to incidents — under governance approval and immutable safety rules.
- Provide a transparent dashboard showing reports, evidence, AI recommendations, validator decisions, executed actions, and governance outcomes.

---

## 3. Capabilities (honest scope)

**What GENESIS GUARDIAN does:**
- Accepts reports from users, monitoring agents, and security systems.
- Collects typed evidence (on-chain verified / external / user claim / AI interpretation) with verification status.
- Runs LLM threat analysis inside a GenLayer transaction whose consensus *is* the decision (leader proposes, validators independently re-run and compare).
- Records CONFIRMED / REJECTED / RECONCILED → INCONCLUSIVE decisions with full history.
- Enforces eleven deterministic emergency gates in contract code before any halt.
- Pauses/unpauses an explicitly integrated target contract (guardian-role authorized, idempotent, finalized-only messages).
- Recovers under governance authorization, with false-positive review.
- (Phase 3) Proposes and applies versioned security-policy evolution with rollback — AI proposes, governance activates, immutable rules hold.

**What it does NOT do:**
- Monitor every blockchain automatically — coverage comes from submitted reports and reachable HTTPS/JSON-RPC sources.
- Pause arbitrary external contracts — only those that adopt the Guardian pause interface (EVM-native pause is out of scope for the Studio MVP; see FEASIBILITY_REPORT open question #1).
- Guarantee perfect AI — validator disagreement yields *no decision* (Undetermined), which is a safe outcome.
- Self-modify its executable code — code is frozen; only governed data policy evolves.
- Run on-chain scheduling — an off-chain, permissionless keeper drives the flow (documented, labeled).

---

## 4. Core End-to-End Workflow (the 12 steps)

1. **Security report received** → incident created (`SUBMITTED`).
2. **Evidence collected** → typed, bounded, timestamped records.
3. **Intelligent threat analysis** → LLM analysis inside a GenLayer transaction (nondeterministic work, equivalence-validated).
4. **GenLayer decentralized validation** → committee validators independently re-run the analysis; consensus Accepted / Undetermined.
5. **Decision status recorded** → after FINALIZED: CONFIRMED / REJECTED / INCONCLUSIVE (permissionless deterministic sync).
6. **Automatic emergency condition evaluated** → eleven deterministic gates in contract code.
7. **Emergency halt initiated** → `emit(on='finalized')` pause to the target (idempotent).
8. **Target contract responds** → verifies guardian role, pauses, exposes state.
9. **Incident history updated** → gates snapshot, action, actor, timestamp — append-only.
10. **Recovery** → governance-authorized unpause, confirmed against target state.
11. **False-positive handling** → review marks history; feeds evolution proposals.
12. **Lifeform self-evolution** (Phase 3) → validated proposal → governance activation → policy version N+1 (rollback available).

---

## 5. Architecture at a Glance

Six components on GenLayer (one class per file, pinned runner):

| Contract | Phase | One-line role |
|---|---|---|
| `SecurityPolicyManager` | 2 | Versioned three-tier policy; governance-only writes |
| `IncidentRegistry` | 2 | Reports, evidence, incident lifecycle, append-only memory |
| `ThreatAnalyzer` | 2 | Evidence verification + LLM assessment under a custom Equivalence Principle |
| `GenesisGuardian` | 2 | Emergency state machine + deterministic gates (no LLM inside) |
| `PauseableTarget` | 2 | Controlled target; pauses only for the Guardian contract |
| `LifeformEngine` | 3 | LLM proposal generation + protected-rule validation (governance activates) |

Off-chain (labeled): **keeper** (permissionless orchestration), **dashboard** (read-only),
test suites. Full detail: `ARCHITECTURE.md`, `CONTRACT_DESIGN.md`.

---

## 6. Development Phases

| Phase | Content | Status |
|---|---|---|
| **1 — Architecture & Feasibility** | Environment + official-docs verification; feasibility report, architecture, responsibility matrix, data flow, threat model, repo structure, contract design, GenLayer integration plan | ✅ **COMPLETE** (this documentation set) |
| **2 — MVP** | Core reporting → evidence → consensus assessment → emergency → history flow; five contracts; keeper; Scenarios A–E tested; studionet deploy + dry run | ⏳ next |
| **3 — Lifeform Engine + Dashboard** | Policy versioning UI paths, proposal generation/validation/activation/rollback; dashboard views (Scenarios F, G); Scenarios A–H complete | ⏳ |
| **4 — Hardening & Deployment** | Security test report, EVM-target feasibility spike (Bradbury), performance/fee tuning, deposit/anti-spam, deployment instructions, final documentation | ⏳ |

---

## 7. Glossary

| Term | Meaning |
|---|---|
| **Activator** | Genesis account that starts transactions and fixes the initial committee seed (GenLayer role) |
| **Leader** | Validator that executes a transaction and proposes the receipt for review |
| **Committee** | Stake-weighted validator group voting commit–reveal on a proposal |
| **Equivalence Principle** | Rule defining when a validator may accept the leader's nondeterministic result (strict, custom, prompt-comparative, prompt-non-comparative) |
| **Accepted** | Provisional success — appealable, not final |
| **Finalized** | Terminal state — appeal window complete; required before irreversible effects |
| **Undetermined** | No consensus → **no state change** (safe failure) |
| **Emit (on='finalized')** | Async cross-contract message executed only after finality; may re-fire across appeals → receivers idempotent |
| **Gate (G1–G11)** | Deterministic on-chain condition all of which must hold before an emergency |
| **Keeper** | Off-chain script driving permissionless steps; holds no special rights |
| **Tier 1/2/3** | Immutable safety rules / governed versioned policy / operational parameters |
| **INCONCLUSIVE** | Fail-closed decision status: insufficient, conflicting, or failed evidence/analysis |
