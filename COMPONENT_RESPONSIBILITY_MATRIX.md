# GENESIS GUARDIAN — Component Responsibility Matrix

**Phase:** 1 — Architecture & Feasibility · **Deliverable 3**

Placement legend: **IC** = GenLayer Intelligent Contract (consensus-enforced) ·
**Off-chain** = ordinary external service · **Target** = controlled integration contract ·
**Address** = governance/role address held by a contract.

---

## 1. Full Responsibility Matrix (all suggested components)

| # | Suggested component | Placement | Phase | Primary responsibility | Write authority | Reads (via `view()`) | Nondeterministic? | Never allowed to |
|---|---|---|---|---|---|---|---|---|
| 1 | **GenesisGuardianCore** | IC `GenesisGuardian` | 2 | Emergency state machine, activation gates, recovery orchestration, action history | Anyone (permissionless entry points) — **but every transition is a deterministic gated check**; `requestRecovery` requires governance | IncidentRegistry, ThreatAnalyzer, SecurityPolicyManager, PauseableTarget | No (fully deterministic) | Bypass policy/assessment gates; write policy; act on Accepted-only assessments |
| 2 | **SecurityReporting** | IC `IncidentRegistry` (module) | 2 | Accept reports: incident id, contract, network, tx hashes, wallets, description, evidence refs; rate/size caps; timestamps | Anyone (submitter pays fees) | — | No | Auto-start investigation; auto-trigger any state beyond `SUBMITTED` |
| 3 | **EvidenceRegistry** | IC `IncidentRegistry` (module) | 2 | Store typed evidence records (ONCHAIN_VERIFIED / EXTERNAL / USER_CLAIM / AI_INTERPRETATION), verification status, corroboration flags, bounded history | Reporter (initial entries), ThreatAnalyzer (verification results), keeper (sync) | — | No | Count AI_INTERPRETATION toward corroboration; hold unbounded arrays |
| 4 | **ThreatAssessment** | IC `ThreatAnalyzer` | 2 | Evidence verification (HTTP/JSON-RPC fetch) + LLM threat analysis validated by a custom Equivalence Principle; produce consensus-accepted structured assessment (`assessment_seq`) | Keeper/anyone calls `assess`/`reassess`; **consensus** writes the result | IncidentRegistry (report+evidence snapshot), SecurityPolicyManager (evidence requirements) | Yes — `gl.nondet.web.*` + `gl.nondet.exec_prompt` inside `run_nondet_unsafe` | Authorize emergencies; write policy; emit actions; treat leader output alone as consensus |
| 5 | **EmergencyController** | IC `GenesisGuardian` (module) | 2 | Evaluate the activation checklist; `initiateEmergency` / `confirmEmergency` / `requestRecovery` / `confirmRecovery`; `emit(on='finalized')` pause/unpause | Anyone (gated) / governance (recovery) | IncidentRegistry, ThreatAnalyzer, SecurityPolicyManager, PauseableTarget | No | Fire pause without FINALIZED assessment + all gates; trust LLM confidence alone |
| 6 | **IncidentRegistry** | IC `IncidentRegistry` (module) | 2 | Incident lifecycle (SUBMITTED→…→RESOLVED), decision sync, incident memory (assessments, decisions, actions, appeals as history entries), per-incident bounded records | Keeper/anyone (deterministic sync methods), governance (wiring, resolution overrides) | ThreatAnalyzer (after `linkAnalyzer`) | No | Overwrite history (append-only entries); transition without a source record |
| 7 | **LifeformEngine** | IC `LifeformEngine` | 3 | Generate self-evolution proposals from incident records (LLM nondet), store proposal schema (12 required fields), deterministic protected-rule validation, proposal registry | Anyone calls `propose` (proposal generation); **governance alone activates** (writes to PolicyManager) | IncidentRegistry, ThreatAnalyzer, SecurityPolicyManager | Yes — LLM proposal generation | Modify code; grant itself roles; activate a proposal; bypass protected-rule validation |
| 8 | **PolicyManager** | IC `SecurityPolicyManager` | 2 (bootstrap) / 3 (evolution) | Three-tier configuration: immutable safety rules (validated structurally), governed policies (versioned), operational params; rollback preserves history | **Governance address only** (Phase 3: governance activation of validated proposals) | — | No | Accept changes touching protected paths; let AI/analyzer/guardian write |
| 9 | **GovernanceController** | Address-role checks inside each IC | 2 | Hold per-contract `governance` address: policy writes, wiring setters, recovery authorization, (P3) proposal activation/rollback | Governance address itself (multisig recommended at deploy) | — | No | Exist as an AI-controlled or LLM-derived address |
| — | **Target integration** | Target IC `PauseableTarget` | 2 | Explicit pause/unpause honoring only the Guardian contract (guardian-role check); idempotent no-ops; expose `paused` state | `GenesisGuardian` contract only (via finalized emits) | — | No | Accept pause from EOAs or any non-guardian address |
| — | **Orchestration (keeper)** | **Off-chain** script | 2 | Drive permissionless steps in the right order; wait for FINALIZED before emergency initiation; observe receipts/undetermined; pace against rate limits | Submits txs as a normal account (no special rights) | Receipts, lifecycle (off-chain APIs), contract views | N/A | Have any privilege a contract does not verify itself |
| — | **Dashboard** | **Off-chain** web app | 3 | Read-only views: incident flow, evidence, assessment vs decision vs action (distinct states), policy versions, history, proposal results | None (read-only) | All contracts over RPC | N/A | Enter the trust path; present proposals as executed; display unvalidated data as executed |
| — | **External data sources** | Integration (HTTPS/JSON-RPC via `gl.nondet.web`) | 2 | Provide evidence inputs to the analyzer | N/A (read by analyzer) | N/A | Yes (fetched content) | Be trusted; carry instructions that reach contract logic |

---

## 2. Per-Module Responsibility Summary (Modules A–F)

| Module | Owner component(s) | In | Out | Failure mode |
|---|---|---|---|---|
| **A — Security Reporting** | `IncidentRegistry.submit_report` + keeper `startInvestigation` | Report fields, tx hashes, wallets, description | Incident record (`SUBMITTED` → `UNDER_INVESTIGATION`) | Invalid input → rejected in deterministic code; spam → submitter pays fees |
| **B — Evidence Collection** | Reporter + `ThreatAnalyzer.verifyEvidence` | URLs, hashes, tx ids, fetch results | Typed evidence records with verification status | Fetch fails → `[EXTERNAL]`/`[TRANSIENT]` → status UNAVAILABLE, assessment proceeds fail-closed |
| **C — Intelligent Threat Analysis** | `ThreatAnalyzer.assess` | Evidence snapshot + report (pre-read outside nondet) | Structured assessment (11 fields), `assessment_seq` | LLM error/format failure → `[LLM_ERROR]` → validator disagrees → rotation → no state → INCONCLUSIVE path |
| **D — GenLayer Decision & Validation** | Consensus itself + `IncidentRegistry.syncDecision` | Assessment tx receipt | CONFIRMED / REJECTED / REJECTED / INCONCLUSIVE status | Undetermined → no state → keeper retry/appeal; never a halt |
| **E — Emergency Halt** | `GenesisGuardian` + `PauseableTarget` | Gated checklist inputs | EMERGENCY_PENDING → ACTIVE; history entry; pause on target | Gate fail → no transition; pause not observed → stays PENDING; duplicate emits → no-ops |
| **F — Lifeform Engine** | `LifeformEngine` + `SecurityPolicyManager` | Incident/assessment/policy snapshots | Proposal record (DRAFT → VALIDATED → APPROVED/REJECTED) → policy version N+1 | Protected-rule violation → REJECTED_AUTO, immutable rules intact; AI never activates |

---

## 3. Authority Rules (invariants — enforced in code, tested in Phase 2)

1. **AI** may write: assessments (via consensus), proposals (Phase 3). **AI may never write:**
   policy, roles, emergency state, recovery, code.
2. **Any account** may write: reports, evidence sightings, permissionless deterministic syncs,
   appeals (off-chain). **No account** may skip a gate — including governance, except the
   explicitly governance-only recovery/policy/wiring paths.
3. **Emergency activation** requires *all* of: incident CONFIRMED · FINALIZED assessment ·
   threat/confidence/corroboration thresholds · no conflict flag · cooldown · state guard ·
   policy allowance · target capability — re-checked in contract code every call.
4. **History is append-only**; status transitions always reference a source record id.
5. **Code is frozen**; only versioned policy data evolves, and only through governance activation.
