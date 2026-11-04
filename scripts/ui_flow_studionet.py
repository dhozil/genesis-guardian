"""Drive the full console flow on the redeployed Guardian, headlessly.

Mirrors what the UI does, signing with the wallet in D:\\Genlayer-project\\wallet\\.env
(the extension popup itself needs a human click, so the CLI does the signing):

    submit_report -> startInvestigation -> assess (retry on MAJORITY_DISAGREE)
    -> syncDecision -> read back incident / assessment / evidence / history

Usage:
    set -a && source "D:/Genlayer-project/wallet/.env" && set +a
    python scripts/ui_flow_studionet.py
"""

import json
import os
import time

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionStatus
from gltest.assertions import tx_execution_succeeded

ADDRESS = "0x0a138C4F8d5E7F06f597a8203F1B9916a552D8B3"
WAIT = {"interval": 3000, "retries": 100}

EVIDENCE = [
    {
        "source_type": "EXTERNAL",
        "category": "onchain",
        "reference": "https://example.com/",
        "summary": (
            "Independent write-up describes ongoing drain of the target treasury "
            "through a reentrancy call pattern."
        ),
    },
    {
        "source_type": "EXTERNAL",
        "category": "external",
        "reference": "https://docs.genlayer.com/",
        "summary": (
            "Reference documentation reachable for corroboration during assessment."
        ),
    },
]

DESCRIPTION = (
    "CRITICAL active exploit: reentrancy drain in progress on the target contract; "
    "treasury outflows confirmed by multiple sources. Immediate pause required to "
    "stop ongoing loss of funds."
)


def votes(receipt):
    v = (receipt.get("consensus_data") or {}).get("votes") or {}
    agree = sum(1 for x in v.values() if str(x).lower() == "agree")
    disagree = sum(1 for x in v.values() if str(x).lower() == "disagree")
    return agree, disagree


def ok(receipt):
    if receipt.get("result_name") == "MAJORITY_DISAGREE":
        return False
    agree, disagree = votes(receipt)
    if agree == 0 and disagree == 0:
        return receipt.get("result_name") == "MAJORITY_AGREE"
    return agree > disagree


def main() -> int:
    key = os.environ.get("GENLAYER_DEV_KEY", "").strip()
    if not key:
        raise SystemExit("GENLAYER_DEV_KEY missing")
    account = Account.from_key(key)
    client = create_client(chain=studionet, account=account)
    print(f"wallet={account.address} target={ADDRESS}", flush=True)

    def read(method, args=None):
        return client.read_contract(
            address=ADDRESS, function_name=method, account=account, args=args or []
        )

    def write(method, args, label, rotations=3):
        tx = client.write_contract(
            address=ADDRESS,
            function_name=method,
            account=account,
            consensus_max_rotations=rotations,
            leader_only=False,
            args=args,
        )
        receipt = client.wait_for_transaction_receipt(
            transaction_hash=tx, status=TransactionStatus.FINALIZED, **WAIT
        )
        executed = tx_execution_succeeded(receipt)
        agree, disagree = votes(receipt)
        print(
            f"[{label}] tx={tx} status={receipt.get('status_name')} "
            f"result={receipt.get('result_name')} exec_ok={executed} "
            f"votes(agree={agree}, disagree={disagree})",
            flush=True,
        )
        assert executed, f"{label}: execution failed"
        return receipt

    incident_id = f"ui-flow-{int(time.time())}"
    write(
        "submit_report",
        [
            incident_id,
            "0xTargetContract",
            "studionet",
            json.dumps(["0xtxhash1", "0xtxhash2"]),
            json.dumps(["0xwallet1"]),
            DESCRIPTION,
            json.dumps(EVIDENCE),
        ],
        "submit_report",
    )
    print(
        "status_after_submit="
        + json.loads(read("get_incident", [incident_id]))["status"],
        flush=True,
    )

    write("startInvestigation", [incident_id], "startInvestigation")

    receipt = None
    for attempt in range(1, 6):
        tx = client.write_contract(
            address=ADDRESS,
            function_name="assess",
            account=account,
            consensus_max_rotations=8,
            leader_only=False,
            args=[incident_id],
        )
        print(f"[assess#{attempt}] tx={tx}", flush=True)
        try:
            r = client.wait_for_transaction_receipt(
                transaction_hash=tx, status=TransactionStatus.FINALIZED, **WAIT
            )
        except Exception as exc:
            print(f"[assess#{attempt}] not FINALIZED: {exc}", flush=True)
            continue
        agree, disagree = votes(r)
        print(
            f"[assess#{attempt}] status={r.get('status_name')} result={r.get('result_name')} "
            f"exec_ok={tx_execution_succeeded(r)} votes(agree={agree}, disagree={disagree})",
            flush=True,
        )
        if tx_execution_succeeded(r) and ok(r):
            receipt = r
            break
    if receipt is None:
        print("assess never reached consensus", flush=True)
        return 2

    write("syncDecision", [incident_id], "syncDecision")

    incident = json.loads(read("get_incident", [incident_id]))
    assessment = json.loads(read("get_assessment", [incident_id]))
    evidence = json.loads(read("get_evidence_for_incident", [incident_id]))
    history = json.loads(read("get_history", [incident_id]))
    state = json.loads(read("get_state"))
    print("INCIDENT " + json.dumps(incident), flush=True)
    print("ASSESSMENT " + json.dumps(assessment), flush=True)
    print("EVIDENCE " + json.dumps(evidence), flush=True)
    print("HISTORY " + json.dumps([h["type"] for h in history]), flush=True)
    print(
        "STATE "
        + json.dumps(
            {
                "state": state["state"],
                "policy_version": state["policy_version"],
                "paused": state["paused"],
                "incidents": len(json.loads(read("get_incident_ids"))),
            }
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
