# GENESIS GUARDIAN — Repository Structure

**Phase:** 1 — Architecture & Feasibility · **Deliverable 6**

## 1. Target Repository Layout

```
GENESIS-GUARDIAN/
├── README.md                        # Entry point, status, deliverable index
├── PROJECT_OVERVIEW.md              # Vision, objectives, workflow, glossary
├── FEASIBILITY_REPORT.md            # Phase 1 deliverable 1 + phase status report
├── ARCHITECTURE.md                  # Phase 1 deliverable 2 (+ diagrams, state machines)
├── COMPONENT_RESPONSIBILITY_MATRIX.md  # Phase 1 deliverable 3
├── DATA_FLOW.md                     # Phase 1 deliverable 4
├── THREAT_MODEL.md                  # Phase 1 deliverable 5
├── REPO_STRUCTURE.md                # Phase 1 deliverable 6 (this file)
├── CONTRACT_DESIGN.md               # Phase 1 deliverable 7
├── GENLAYER_INTEGRATION.md          # Phase 1 deliverable 8
├── SECURITY_MODEL.md                # Policy tiers, guardrails, authorization matrix
├── LIFEFORM_EVOLUTION.md            # Self-evolution design + safety rules (Phase 3)
├── TESTING.md                       # Test strategy + scenario matrix (plan)
├── DEPLOYMENT.md                    # Networks, wiring, runbooks (plan)
│
├── contracts/                       # ONE intelligent-contract class per file (GenLayer rule)
│   ├── SecurityPolicyManager.py     # Phase 2 — versioned policy store (governance writes)
│   ├── IncidentRegistry.py          # Phase 2 — reports · evidence · lifecycle · history
│   ├── ThreatAnalyzer.py            # Phase 2 — verification + LLM assessment (equivalence)
│   ├── GenesisGuardian.py           # Phase 2 — emergency state machine + gates
│   ├── PauseableTarget.py           # Phase 2 — controlled pause target
│   └── LifeformEngine.py            # Phase 3 — proposals + protected-rule validation
│
├── tests/
│   ├── direct/                      # genlayer-test direct mode (fast, mocked web/LLM)
│   │   ├── conftest.py              # fixtures: deployed wiring, mock evidence/LLM sets
│   │   ├── test_report_flow.py      # Scenario A/B (intake + false report)
│   │   ├── test_assessment.py       # Scenario C/D (injection, conflicting evidence)
│   │   ├── test_emergency.py        # Scenario A/E (gates, undetermined-safe, auth)
│   │   ├── test_policy.py           # policy tiers, protected rules, rollback (P3)
│   │   └── test_lifeform.py         # Scenario F/G (proposal, malicious proposal) (P3)
│   └── integration/                 # gltest (real consensus, real LLM/web — Studionet)
│       └── test_e2e_studionet.py    # Scenarios A–H against live consensus
│
├── scripts/
│   ├── keeper.py                    # Off-chain permissionless orchestrator (labeled off-chain)
│   └── status.sh                    # Receipt/lifecycle inspection helper
│
├── deploy/                          # GenLayerJS deploy scripts (filename order = run order)
│   ├── 01_target.ts
│   ├── 02_policy.ts
│   ├── 03_registry.ts
│   ├── 04_analyzer.ts
│   ├── 05_guardian.ts
│   └── 06_wiring.ts                 # linkAnalyzer + setGuardian + smoke checks
│
├── frontend/                        # Phase 3 — Next.js web frontend (no trust-path role)
│   └── (views per §10 of the project spec)
│
├── requirements.txt                 # genvm-linter, genlayer-test (host-side dev deps)
├── gltest.config.yaml               # networks: localnet / studionet / testnet_bradbury
└── .gitignore                       # secrets, caches (.gltest_cache), .env*, artifacts
```

## 2. Conventions

| Rule | Detail |
|---|---|
| One contract class per file | File name == class name (`GenesisGuardian.py` → `class GenesisGuardian(gl.Contract)`) — required by GenVM |
| Runner header | Line 1 of every contract: `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }` (pinned hash — never `test`/`latest`) |
| Lint before test | `genvm-lint check contracts/<file>.py` must exit 0 before any test run |
| Test layers | direct (mocks, ms) → integration (gltest, real consensus) — never claim "works" from lint alone |
| Naming | snake_case methods; `incident_id` / `assessment_seq` keys stable across contracts; error messages prefixed `[EXPECTED]/[EXTERNAL]/[TRANSIENT]/[LLM_ERROR]` |
| Secrets | Never in repo: private keys via env (`ACCOUNT_PRIVATE_KEY_*` for testnet), Studio uses unlocked local accounts |
| Status labeling | Mock/simulated paths appear only under `tests/` and are named `mock_*`; production code never imports test fixtures |

## 3. What Exists Today (end of Phase 1)

Documentation only (the 14 markdown files above). `contracts/`, `tests/`, `scripts/`,
`deploy/`, `frontend/` are **planned** — created in Phase 2 alongside their first real files.
No placeholder code is committed, per the rule against starting unsupported implementation
before the feasibility report (now complete).
