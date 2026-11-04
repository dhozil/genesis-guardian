# GENESIS GUARDIAN — Deployment Plan

**Phase:** 1 — plan only (no contracts deployed yet). Execution begins Phase 2.
**Verified tooling:** genlayer CLI 0.39.2 · genvm-lint 0.11.1-rc.2 · genlayer-test 0.29.2 ·
Node 24 / npm 11 · Python 3.12.

---

## 1. Networks

| Network | chainId / RPC | Use | Notes |
|---|---|---|---|
| **localnet** | 61127 (`genlayer up` / Studio local) | Development + heavy test suites | Full GenVM + consensus; no rate limits; Docker for Studio |
| **studionet** (active) | 61999 · `https://studio.genlayer.com/api` | MVP integration tests + initial deploy | Hosted Studio, gasless-ish; **rate limits: 60 req/min · 1000/hr · 10000/day · 32 in-flight tx/sender** → always pace; mainContract `0xb7278A61aa25c888815aFC32Ad3cC52fF24fE575`; explorer `https://genlayer-explorer.vercel.app` |
| **testnet-bradbury** | 4221 | Later validation (incl. EVM-target open question) | Real network; faucet `https://testnet-faucet.genlayer.foundation/`; keys via `ACCOUNT_PRIVATE_KEY_*` env |
| studio-dev preview | 61997 | Preview UI checks | Never for releases |

Accounts: current `genlayer_dev` `0x3958a649b41cd7c8561f4233cc0f5b0469bc98e0` (funded, locked).
Governance address for production deploys: **multisig recommended — chosen at deploy time,
never the AI, never a single hot key** (open decision recorded for Phase 4).

---

## 2. Deployment Procedure (per environment)

### 2.1 Pre-flight (every time)
1. `genvm-lint check contracts/GenesisGuardian.py` → exit 0 (single merged contract,
   Phase 2 — see CONTRACT_DESIGN.md deviation note).
2. `python -m pytest tests/direct/ -q` → green, 65 tests (mocks confined to tests).
3. `gltest tests/integration/ -v -s --network studionet` → green with `tx_execution_succeeded` +
   FINALIZED assertions (for the network being targeted).
4. Confirm pinned runner header on line 1 of the contract (exact hash, no aliases).

### 2.2 Deploy (verified path — genlayer-py client, scalars-only constructor)

The Phase 1 six-contract CLI plan is superseded: **one deploy**, constructor
`(governance, bootstrap_policy)`. Verified on studionet 2026-11-03:

```bash
set -a && source "D:\Genlayer-project\wallet\.env" && set +a   # GENLAYER_DEV_KEY
python - <<'PY'
from genlayer_py import create_client
from genlayer_py.chains import studionet
from eth_account import Account
import os, json
account = Account.from_key(os.environ["GENLAYER_DEV_KEY"])
client = create_client(chain=studionet, account=account)
code = open("contracts/GenesisGuardian.py").read()
bp = json.dumps({"min_confidence":"MEDIUM","min_corroborating_sources":2,
    "allowed_threat_levels":["HIGH","CRITICAL"],"allowed_actions":["PAUSE_TARGET"],
    "cooldown_seconds":3600})
tx = client.deploy_contract(code=code,
    args=["<governance>", bp], consensus_max_rotations=3, leader_only=False)
# then wait_for_transaction_receipt(tx, status=TransactionStatus.FINALIZED)
# assert status_name == "FINALIZED" and tx_execution_succeeded(receipt)
# address = extract_contract_address(receipt)
PY
```

(`gltest.config.yaml` wires the same wallet via `${GENLAYER_DEV_KEY}` for tests; the
private key lives only in the wallet folder / env — never in the repo.)

Record every tx hash + address into `DEPLOYMENT.md` results table (per environment).

### 2.3 Wiring — none required (single contract)

`linkAnalyzer` / `setGuardian` / `setTarget` do not exist in the merged design — there is
one deploy and no cross-contract wiring. Smoke checks (read-only `call()`s, executed on
studionet 2026-11-03):

- `get_policy()` returns bootstrap JSON · `get_version()` == 1
- `is_paused()` == false · `pause_supported()` == true
- `get_assessment(<nonexistent>)` → clean `"null"` (seq 0)
- `get_incident(<nonexistent>)` → clean `[EXPECTED]` failure
- `get_state()` → `state == NORMAL`, `paused == false`

### 2.4 Post-deploy verification checklist
- [ ] All addresses recorded; wiring setters report locked (second call reverts)
- [ ] One benign end-to-end dry run: report → investigation → (mock-free) assess on studionet →
      syncDecision → status visible; **no emergency** (dry-run incident, INCONCLUSIVE or REJECTED path)
- [ ] Explorer links for each deploy tx (genlayer-explorer.vercel.app)
- [ ] Keeper configured with deployed addresses; pacing within rate limits
- [ ] Rollback drill (Phase 3): policy set → rollback → payload restored

---

## 3. Keeper Runbook (off-chain — labeled as such)

The keeper is an **ordinary script with no privileges**; every action it triggers is
re-verified by contract gates. Anyone may run it (permissionless design).

| Trigger | Action | Wait-for |
|---|---|---|
| New report in registry (or external trigger) | `startInvestigation` if evidence present | receipt success |
| Incident UNDER_INVESTIGATION, evidence settled | `assess(incident_id)` (estimate fees first) | **receipt FINALIZED** |
| Assessment FINALIZED | `syncDecision(incident_id)` | receipt success |
| Status CONFIRMED + gates likely pass | `initiateEmergency(incident_id)` | receipt FINALIZED (pause emit) |
| After pause emit finalized | `confirmEmergency` until state ACTIVE | target view paused==true |
| Governance decision | `requestRecovery` (governance signs) | receipt FINALIZED |
| After unpause finalized | `confirmRecovery` → then `resolveIncident` | target view paused==false |
| Receipt = Undetermined / timeout | retry with backoff; surface for appeal funding | lifecycle projection |
| Appeal window activity on a dependency tx | monitor `genlayer appeal` status; hold all emergency steps | Finalized |

Failure policy: **fail-safe stall** — the keeper never forces a transition; on any uncertainty
it stops and reports, because all failure modes of inaction are liveness (recoverable), while
forced action could be a safety violation.

---

## 4. Upgrade / Migration Policy (v1)

- **Code is frozen** (no upgraders registered; `lock_default` semantics). There is no
  in-place upgrade.
- Bug fix path: redeploy affected contract(s) to a fresh address → governance re-runs wiring →
  migrate *policy/state references* through governance-approved operations (registry data
  export via views + re-import is designed as a Phase 4 consideration; MVP incidents remain
  on the original registry for auditability).
- Policy evolution (Phase 3): never requires redeploy — versioned data + rollback.
- Emergency stop for the system itself: governance can decline recovery (system stays paused)
  or roll back policy; there is deliberately **no** kill-switch that bypasses Tier 1 rules.

---

## 5. Environment Variables & Secrets

| Var | Purpose | Where |
|---|---|---|
| `ACCOUNT_PRIVATE_KEY_1/2…` | testnet-bradbury accounts | env only (gltest config reads `${...}`) |
| RPC endpoint keys (deploy scripts) | `env`-driven; never committed | `deploy/` reads process env |
| Studio accounts | local unlocked `genlayer_dev` — no key export needed | Studio |

**Never in the repo:** private keys, `.dev.vars`, funded mainnet material. `.gitignore`
covers `.env*`, caches, artifacts.

---

## 6. Deployment Status Log

| Date | Environment | Contracts | Tx hashes | Result |
|---|---|---|---|---|
| 2026-11-03 | **studionet** (61999) | `GenesisGuardian` → `0xE7815d35881a3DcC6c20C4656AE8ca49910eDAf5` | deploy `0xc8a02136daf757a158ce756938e58202d7c1ca869efec8562a1ad6e6950bd45e` · smoke write `0xb1de5de09c547890adf81a33c63d9589dfb28d69f5ebf7945d7c4eea922b12e3` | ✅ both FINALIZED + `tx_execution_succeeded` · views smoke OK · benign report visible with history |
| 2026-11-04 | **studionet** (61999) | `GenesisGuardian` (hardened) → `0x0a138C4F8d5E7F06f597a8203F1B9916a552D8B3` | deploy `0xa70c80629056764261adabe6e26d4a3f519cc28a3abd8197929312ed298d21e6` | ✅ FINALIZED + `MAJORITY_AGREE` (agree=3) · source 56 504 bytes · wallet `0x3958A649b41cd7C8561F4233cC0F5b0469Bc98E0` · happy-path suite **8/8** (fresh deploy) · adversarial suite **7/7** (fresh deploy `0x1536027e9bEf25A0Fa5d026b517CceF3308205B1`) · `EVIDENCE_VERIFIED` events observed on-chain |
| — | (localnet) | — | — | direct suite only (in-process VM, no chain deploy) |

**Definition of Done for a deployment:** lint clean → direct tests green → integration tests
green on the target network → all deploys FINALIZED + successful → wiring smoke checks pass →
one benign end-to-end dry run verified → addresses/hashes recorded above.
