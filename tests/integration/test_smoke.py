"""Integration smoke — studionet (real consensus, no mocks).

Deploy GenesisGuardian, assert FINALIZED + tx_execution_succeeded on every
write, verify the read path (views, clean [EXPECTED] failure) and one benign
end-to-end write (dry-run report).  Never triggers an emergency.

Run:  gltest tests/integration/ -v -s --network studionet
"""

import json
import time
from pathlib import Path

import pytest
from genlayer_py.types import TransactionStatus
from gltest.assertions import tx_execution_succeeded
from gltest.utils import extract_contract_address

CONTRACT_PATH = Path("contracts/GenesisGuardian.py")

# Exact 5-key bootstrap policy (same as direct suite).
BOOTSTRAP = json.dumps(
    {
        "min_confidence": "MEDIUM",
        "min_corroborating_sources": 2,
        "allowed_threat_levels": ["HIGH", "CRITICAL"],
        "allowed_actions": ["PAUSE_TARGET"],
        "cooldown_seconds": 3600,
    }
)

WAIT = {"interval": 3000, "retries": 60}


def _finalize(gl_client, tx_hash):
    receipt = gl_client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.FINALIZED,
        **WAIT,
    )
    assert receipt["status_name"] == "FINALIZED", receipt.get("status_name")
    assert tx_execution_succeeded(receipt), "leader receipt must be SUCCESS"
    return receipt


@pytest.fixture(scope="module")
def guardian(gl_client, default_account):
    """Deploys GenesisGuardian; deploy tx must reach FINALIZED + SUCCESS."""
    code = CONTRACT_PATH.read_text(encoding="utf-8")
    tx_hash = gl_client.deploy_contract(
        code=code,
        args=[default_account.address, BOOTSTRAP],
        consensus_max_rotations=3,
        leader_only=False,
    )
    receipt = _finalize(gl_client, tx_hash)
    address = extract_contract_address(receipt)
    assert address, "deploy receipt must yield a contract address"
    return address


def _call(gl_client, account, address, method, args=None):
    return gl_client.read_contract(
        address=address,
        function_name=method,
        account=account,
        args=args or [],
    )


def test_deploy_finalized_and_views(guardian, gl_client, default_account):
    assert int(_call(gl_client, default_account, guardian, "get_version")) == 1

    policy = json.loads(_call(gl_client, default_account, guardian, "get_policy"))
    assert policy == json.loads(BOOTSTRAP)

    state = json.loads(_call(gl_client, default_account, guardian, "get_state"))
    assert state["state"] == "NORMAL"
    assert state["paused"] is False
    assert state["protocol_locked"] is False
    assert state["governance"].lower() == default_account.address.lower()
    assert state["policy_version"] == 1

    assert _call(gl_client, default_account, guardian, "is_paused") is False
    assert _call(gl_client, default_account, guardian, "pause_supported") is True

    # No assessment yet -> clean "null" (not an error).
    assert _call(gl_client, default_account, guardian, "get_assessment", ["nope"]) == "null"

    # Unknown incident -> clean [EXPECTED] failure surfaced by the RPC.
    with pytest.raises(Exception, match="execution failed"):
        _call(gl_client, default_account, guardian, "get_incident", ["nope"])


def test_benign_report_write_finalized(guardian, gl_client, default_account):
    """Dry-run incident: report -> FINALIZED -> state visible. No emergency."""
    incident_id = f"smoke-{int(time.time())}"
    evidence = json.dumps(
        [
            {
                "source_type": "EXTERNAL",
                "category": "onchain",
                "reference": "https://site-a.example/smoke",
                "summary": "integration smoke dry run",
            }
        ]
    )
    tx_hash = gl_client.write_contract(
        address=guardian,
        function_name="submit_report",
        account=default_account,
        consensus_max_rotations=3,
        leader_only=False,
        args=[
            incident_id,
            "0xTargetContract",
            "studionet",
            json.dumps(["0xtxdry"]),
            json.dumps(["0xwal1"]),
            "integration smoke benign report",
            evidence,
        ],
    )
    receipt = _finalize(gl_client, tx_hash)

    incident = json.loads(
        _call(gl_client, default_account, guardian, "get_incident", [incident_id])
    )
    assert incident["incident_id"] == incident_id
    assert incident["status"] == "SUBMITTED"
    assert incident["evidence_ids"] == [f"{incident_id}:e0"]
    assert incident["reporter"].lower() == default_account.address.lower()

    history = json.loads(
        _call(gl_client, default_account, guardian, "get_history", [incident_id])
    )
    assert history[0]["type"] == "REPORT_SUBMITTED"
    assert history[0]["evidence_count"] == 1

    # Emergency area untouched by a benign report.
    state = json.loads(_call(gl_client, default_account, guardian, "get_state"))
    assert state["state"] == "NORMAL"
    assert state["paused"] is False
    assert receipt["status_name"] == "FINALIZED"
