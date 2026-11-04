# GENESIS GUARDIAN

**Autonomous Security & Self-Evolving Protocol — built on GenLayer**
*AI investigates. Validators evaluate. Smart contracts enforce. Governance controls evolution.*

GENESIS GUARDIAN is an emergency-response and intelligent protection system: it accepts
security reports, collects and verifies evidence, performs AI threat analysis validated by
GenLayer's decentralized consensus, enforces deterministic emergency gates, and — only when
every gate passes — halts an explicitly integrated target contract. It keeps an immutable
incident history, recovers under governance authorization, and (Phase 3) evolves its own
security policies through a controlled, governance-approved proposal mechanism with rollback.

---

## Current Status

**PHASE 1 — ARCHITECTURE & FEASIBILITY: ✅ COMPLETE (approved to proceed to Phase 2 MVP)**

- Development environment verified (genlayer CLI 0.39.2, Python 3.12, Node 24, Studionet configured, funded account).
- Toolchain verified installed: `genvm-lint` 0.11.1-rc.2 · `genlayer-test` 0.29.2 · `genlayer-py` 0.16.3.
- All GenLayer capabilities verified against **official documentation** (two independent read routes); unverifiable items recorded as open questions — none assumed.
- Full Phase 1 documentation set below written. **No contract code yet** — per plan, implementation starts in Phase 2.

| Phase | Scope | Status |
|---|---|---|
| 1 — Architecture & Feasibility | Feasibility report · architecture · responsibility matrix · data flow · threat model · repo structure · contract design · GenLayer integration plan | ✅ Complete |
| 2 — MVP | Reporting → evidence → consensus assessment → emergency gates → pause target → history; keeper; Scenarios A–E | ⏳ Next |
| 3 — Lifeform + Dashboard | Policy versioning, proposals F/G, rollback, dashboard views | ⏳ |
| 4 — Hardening | Security test report, EVM-target spike, anti-spam, deployment docs, final suite A–H | ⏳ |

---

## Documentation Index

**Phase 1 deliverables (in production order):**

1. [FEASIBILITY_REPORT.md](FEASIBILITY_REPORT.md) — environment inspection, verified capability table, per-module feasibility, risks, open questions, phase status report
2. [ARCHITECTURE.md](ARCHITECTURE.md) — system architecture, diagrams, trust boundaries, state machines, design decisions
3. [COMPONENT_RESPONSIBILITY_MATRIX.md](COMPONENT_RESPONSIBILITY_MATRIX.md) — every suggested component: placement, authority, reads, phase
4. [DATA_FLOW.md](DATA_FLOW.md) — sequence + structural data-flow diagrams, 12-step mapping, message inventory
5. [THREAT_MODEL.md](THREAT_MODEL.md) — assets, STRIDE+ threat table, safety properties P1–P12, non-claims
6. [REPO_STRUCTURE.md](REPO_STRUCTURE.md) — repository layout and conventions
7. [CONTRACT_DESIGN.md](CONTRACT_DESIGN.md) — six contracts: storage, methods, gates G1–G11, wiring
8. [GENLAYER_INTEGRATION.md](GENLAYER_INTEGRATION.md) — verified interface inventory, Module D decision-process documentation, constraints

**Supporting documentation:**

- [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) — vision, objectives, workflow, glossary
- [SECURITY_MODEL.md](SECURITY_MODEL.md) — three configuration tiers, authorization matrix, guardrails, anti-prompt-injection design
- [LIFEFORM_EVOLUTION.md](LIFEFORM_EVOLUTION.md) — self-evolution engine: proposal schema, lifecycle, safety rules (Phase 3)
- [TESTING.md](TESTING.md) — test layers, Scenario A–H matrix, test rules, results log
- [DEPLOYMENT.md](DEPLOYMENT.md) — networks, deploy/wiring procedure, keeper runbook, upgrade policy

---

## Repository Layout (planned — created in Phase 2)

```
contracts/   # one GenVM contract class per file, pinned runner header on line 1
tests/direct/     # genlayer-test direct mode (mocked web/LLM, ms/test)
tests/integration/  # gltest — real consensus on studionet/localnet
scripts/    # keeper (off-chain, permissionless), status helpers
deploy/     # GenLayerJS deploy scripts (filename order)
frontend/  # Phase 3 web frontend (Next.js)
```

See [REPO_STRUCTURE.md](REPO_STRUCTURE.md) for conventions.

## Development Workflow (every phase)

```bash
genvm-lint check contracts/<file>.py      # 1. lint + validate (must exit 0)
genlayer-test tests/direct/ -v            # 2. fast logic tests (mocks, test-only)
gltest tests/integration/ -v -s --network studionet   # 3. real consensus, paced
```

Rules: pinned runner hash only (never `test`/`latest`) · mocks confined to tests ·
`tx_execution_succeeded` + FINALIZED before trusting state · no feature claimed without its
executed test output · limitations stated, never simulated away.

---

*Phase 1 feasibility verdict: **FEASIBLE** — every MVP capability maps to a verified, documented
GenLayer interface. See [FEASIBILITY_REPORT.md](FEASIBILITY_REPORT.md) §8.*
