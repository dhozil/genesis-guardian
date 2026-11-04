"""Redeploy the hardened GenesisGuardian to studionet and record the address.

Uses the wallet in D:\\Genlayer-project\\wallet\\.env (GENLAYER_DEV_KEY), which is
also what gltest.config.yaml wires for the integration suites. The key is never
printed; only the derived public address is.

Usage:
    set -a && source "D:/Genlayer-project/wallet/.env" && set +a
    python scripts/redeploy_studionet.py
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus
from gltest.assertions import tx_execution_succeeded
from gltest.utils import extract_contract_address

ROOT = Path(__file__).resolve().parents[1]

BOOTSTRAP = {
    "min_confidence": "MEDIUM",
    "min_corroborating_sources": 2,
    "allowed_threat_levels": ["HIGH", "CRITICAL"],
    "allowed_actions": ["PAUSE_TARGET"],
    "cooldown_seconds": 3600,
}


def main() -> int:
    key = os.environ.get("GENLAYER_DEV_KEY", "").strip()
    if not key:
        raise SystemExit(
            "GENLAYER_DEV_KEY missing — source D:\\Genlayer-project\\wallet\\.env first"
        )

    account = Account.from_key(key)
    print(f"wallet={account.address}", flush=True)

    client = create_client(chain=studionet, account=account)
    code = (ROOT / "contracts" / "GenesisGuardian.py").read_text(encoding="utf-8")
    print(f"source_bytes={len(code)}", flush=True)

    tx_hash = client.deploy_contract(
        code=code,
        args=[account.address, json.dumps(BOOTSTRAP)],
        consensus_max_rotations=3,
        leader_only=False,
    )
    print(f"deploy_tx={tx_hash}", flush=True)

    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.FINALIZED,
        interval=3000,
        retries=100,
    )
    address = extract_contract_address(receipt)
    executed = tx_execution_succeeded(receipt)
    print(
        f"status={receipt.get('status_name')} result={receipt.get('result_name')} "
        f"exec_ok={executed} address={address}",
        flush=True,
    )
    if not executed or not address:
        print("deploy did not succeed; nothing recorded", flush=True)
        return 1

    out = ROOT / "deployments"
    out.mkdir(exist_ok=True)
    record = {
        "network": "studionet",
        "chain_id": 61999,
        "address": address,
        "deploy_tx": str(tx_hash),
        "status": receipt.get("status_name"),
        "result": receipt.get("result_name"),
        "exec_ok": executed,
        "governance": account.address,
        "bootstrap_policy": BOOTSTRAP,
        "deployed_at": datetime.now(timezone.utc).isoformat(),
        "source_bytes": len(code),
    }
    (out / "studionet.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(f"recorded={out / 'studionet.json'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
