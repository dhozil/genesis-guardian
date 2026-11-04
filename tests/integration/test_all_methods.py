"""Integration: ALL 28 public methods of GenesisGuardian on studionet.

Real consensus, real web fetches, real LLM (gl.nondet.exec_prompt). Uses the
wallet configured in gltest.config.yaml (${GENLAYER_DEV_KEY} in
D:\\Genlayer-project\\wallet\\.env). Every write waits for FINALIZED and
asserts tx_execution_succeeded before the next step.

Coverage (14 views + 14 writes):
  views   get_version, get_policy, get_policy_at, get_policy_record, get_state,
          get_assessment, get_evidence, get_evidence_for_incident, get_history,
          get_incident, get_incident_ids, get_protocol_hint, is_paused,
          pause_supported
  writes  submit_report, append_evidence, startInvestigation, assess, reassess,
          syncDecision, initiateEmergency, confirmEmergency, requestRecovery,
          confirmRecovery, resetToNormal, resolveIncident, set_policy, rollback

Notes:
  * assess runs the LLM for real — output is nondeterministic. The suite
    retries (reassess -> extra evidence -> assess) a bounded number of times
    to drive the incident to CONFIRMED; if it never gets there the emergency
    test fails honestly with the recorded diagnostics.
  * Emergency gates G5/G7/G10 need an allowed threat level, >=2
    consensus-verified distinct references and recommended_action
    PAUSE_TARGET, so a lenient policy (v2) is activated before
    initiateEmergency and rolled back afterwards.

Run:  gltest tests/integration/test_all_methods.py -v -s --network studionet
"""

import json
import time
from pathlib import Path

import pytest
from genlayer_py.types import TransactionStatus
from gltest.assertions import tx_execution_succeeded
from gltest.utils import extract_contract_address

CONTRACT_PATH = Path("contracts/GenesisGuardian.py")

# Exact 5-key bootstrap policy (same as direct suite / smoke).
BOOTSTRAP = json.dumps(
    {
        "min_confidence": "MEDIUM",
        "min_corroborating_sources": 2,
        "allowed_threat_levels": ["HIGH", "CRITICAL"],
        "allowed_actions": ["PAUSE_TARGET"],
        "cooldown_seconds": 3600,
    }
)

# Lenient v2 policy: widen G5 so a MEDIUM threat can still pass the gate.
# G10 still requires recommended_action == PAUSE_TARGET (contract-enforced).
LENIENT = json.dumps(
    {
        "min_confidence": "MEDIUM",
        "min_corroborating_sources": 2,
        "allowed_threat_levels": ["MEDIUM", "HIGH", "CRITICAL"],
        "allowed_actions": ["PAUSE_TARGET"],
        "cooldown_seconds": 3600,
    }
)

# Real, stable 2xx URLs — validators fetch these too (G7 needs >=2 distinct
# refs that reach VERIFIED under consensus).
REF_A = "https://example.com/"
REF_B = "https://docs.genlayer.com/"
REF_C = "https://github.com/"
REF_D = "https://developer.mozilla.org/"
REF_E = "https://www.w3.org/"

THREAT_LEVELS = {"NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"}
CONFIDENCE_LEVELS = {"LOW", "MEDIUM", "HIGH"}

WAIT = {"interval": 3000, "retries": 100}
ASSESS_MAX_ATTEMPTS = 3
# An assess tx that fails to reach consensus wastes a whole tx, so give the
# (stochastic) LLM agreement a wider retry budget.
ASSESS_TX_ATTEMPTS = 5

# Module state shared across the ordered tests.
S: dict = {}


def _consensus_votes(receipt):
    """Return (agree, disagree) from the consensus data of a receipt."""
    votes = (receipt.get("consensus_data") or {}).get("votes") or {}
    agree = sum(1 for v in votes.values() if str(v).lower() == "agree")
    disagree = sum(1 for v in votes.values() if str(v).lower() == "disagree")
    return agree, disagree


def _consensus_ok(receipt):
    """True only when the network committed the leader result.

    A FINALIZED tx can still carry result MAJORITY_DISAGREE: validators
    disagreed on the (nondeterministic) result, so all state writes are
    discarded. Committed state requires a majority of AGREE votes.
    """
    if receipt.get("result_name") == "MAJORITY_DISAGREE":
        return False
    agree, disagree = _consensus_votes(receipt)
    if agree == 0 and disagree == 0:  # votes unavailable -> trust result_name
        return receipt.get("result_name") == "MAJORITY_AGREE"
    return agree > disagree


def _finalize(gl_client, tx_hash, label, **wait):
    receipt = gl_client.wait_for_transaction_receipt(
        transaction_hash=tx_hash,
        status=TransactionStatus.FINALIZED,
        **(wait or WAIT),
    )
    agree, disagree = _consensus_votes(receipt)
    ok = (
        receipt.get("status_name") == "FINALIZED"
        and tx_execution_succeeded(receipt)
        and _consensus_ok(receipt)
    )
    print(
        f"  [{label}] tx={tx_hash} status={receipt.get('status_name')} "
        f"result={receipt.get('result_name')} exec_ok={tx_execution_succeeded(receipt)} "
        f"votes(agree={agree}, disagree={disagree})",
        flush=True,
    )
    assert receipt.get("status_name") == "FINALIZED", f"{label}: not FINALIZED"
    assert tx_execution_succeeded(receipt), f"{label}: leader execution not SUCCESS"
    assert _consensus_ok(receipt), f"{label}: consensus not reached (state discarded)"
    return receipt


def _rd(gl_client, account, address, method, args=None):
    return gl_client.read_contract(
        address=address,
        function_name=method,
        account=account,
        args=args or [],
    )


def _wr(gl_client, account, address, method, args=None, label=None, rotations=3):
    tx_hash = gl_client.write_contract(
        address=address,
        function_name=method,
        account=account,
        consensus_max_rotations=rotations,
        leader_only=False,
        args=args or [],
    )
    return _finalize(gl_client, tx_hash, label or method)


def _assess(gl_client, account, address, incident_id, label):
    """One assess attempt. Returns the receipt on FINALIZED+SUCCESS+CONSENSUS.

    LLM output is nondeterministic across leader/validators; rotation=5 gives
    consensus more chances to agree. UNDETERMINED, failed or MAJORITY_DISAGREE
    txs return None (nothing was persisted) so the caller can retry safely.
    """
    tx_hash = gl_client.write_contract(
        address=address,
        function_name="assess",
        account=account,
        consensus_max_rotations=5,
        leader_only=False,
        args=[incident_id],
    )
    print(f"  [{label}] assess tx={tx_hash}", flush=True)
    try:
        receipt = gl_client.wait_for_transaction_receipt(
            transaction_hash=tx_hash,
            status=TransactionStatus.FINALIZED,
            **WAIT,
        )
    except Exception as exc:  # timeout or terminal UNDETERMINED
        print(f"  [{label}] assess not FINALIZED: {exc}", flush=True)
        return None
    agree, disagree = _consensus_votes(receipt)
    success = (
        receipt.get("status_name") == "FINALIZED"
        and tx_execution_succeeded(receipt)
        and _consensus_ok(receipt)
    )
    print(
        f"  [{label}] assess status={receipt.get('status_name')} "
        f"result={receipt.get('result_name')} exec_ok={tx_execution_succeeded(receipt)} "
        f"votes(agree={agree}, disagree={disagree})",
        flush=True,
    )
    return receipt if success else None


@pytest.fixture(scope="module")
def guardian(gl_client, default_account):
    """Fresh deploy; tx must reach FINALIZED + SUCCESS."""
    code = CONTRACT_PATH.read_text(encoding="utf-8")
    tx_hash = gl_client.deploy_contract(
        code=code,
        args=[default_account.address, BOOTSTRAP],
        consensus_max_rotations=3,
        leader_only=False,
    )
    receipt = _finalize(gl_client, tx_hash, "deploy")
    address = extract_contract_address(receipt)
    assert address, "deploy receipt must yield a contract address"
    S["address"] = address
    return address


# --------------------------------------------------------------------------- #
# T01 — baseline: all read-side state before any write
# --------------------------------------------------------------------------- #

def test_01_views_baseline(guardian, gl_client, default_account):
    a, acct = guardian, default_account
    assert int(_rd(gl_client, acct, a, "get_version")) == 1
    assert json.loads(_rd(gl_client, acct, a, "get_policy")) == json.loads(BOOTSTRAP)
    assert json.loads(_rd(gl_client, acct, a, "get_policy_at", [1])) == json.loads(
        BOOTSTRAP
    )

    rec = json.loads(_rd(gl_client, acct, a, "get_policy_record", [1]))
    assert rec["version"] == 1
    assert rec["activated_by"].lower() == acct.address.lower()
    assert json.loads(rec["payload"]) == json.loads(BOOTSTRAP)

    with pytest.raises(Exception, match="execution failed"):
        _rd(gl_client, acct, a, "get_policy_at", [999])
    with pytest.raises(Exception, match="execution failed"):
        _rd(gl_client, acct, a, "get_policy_record", [999])

    state = json.loads(_rd(gl_client, acct, a, "get_state"))
    assert state["state"] == "NORMAL"
    assert state["paused"] is False
    assert state["protocol_locked"] is False
    assert state["active_incident"] == ""
    assert state["last_emergency_unix"] == 0
    assert state["governance"].lower() == acct.address.lower()
    assert state["policy_version"] == 1

    hint = json.loads(_rd(gl_client, acct, a, "get_protocol_hint"))
    assert hint["total"] == 0
    assert hint["by_status"] == {}

    assert _rd(gl_client, acct, a, "is_paused") is False
    assert _rd(gl_client, acct, a, "pause_supported") is True

    assert json.loads(_rd(gl_client, acct, a, "get_incident_ids")) == []
    assert _rd(gl_client, acct, a, "get_assessment", ["ghost"]) == "null"
    assert json.loads(_rd(gl_client, acct, a, "get_history", ["ghost"])) == []

    for method in ("get_incident", "get_evidence", "get_evidence_for_incident"):
        with pytest.raises(Exception, match="execution failed"):
            _rd(gl_client, acct, a, method, ["ghost"])


# --------------------------------------------------------------------------- #
# T02 — intake: submit_report -> views -> append_evidence -> startInvestigation
# --------------------------------------------------------------------------- #

def test_02_intake_and_registry_views(guardian, gl_client, default_account):
    a, acct = guardian, default_account
    iid = f"full-{int(time.time())}"
    S["iid"] = iid

    evidence = [
        {
            "source_type": "EXTERNAL",
            "category": "onchain",
            "reference": REF_A,
            "summary": (
                "Explorer shows repeated treasury outflow from target contract "
                "via reentrancy call pattern (tx trace attached)."
            ),
        },
        {
            "source_type": "EXTERNAL",
            "category": "external",
            "reference": REF_B,
            "summary": (
                "Independent report matches known reentrancy drain: attacker "
                "contract recursively withdrew funds from the protocol."
            ),
        },
    ]
    _wr(
        gl_client,
        acct,
        a,
        "submit_report",
        [
            iid,
            "0xTargetContract",
            "studionet",
            json.dumps(["0xtxhash1", "0xtxhash2"]),
            json.dumps(["0xwallet1"]),
            (
                "CRITICAL active exploit: reentrancy drain in progress on the "
                "target contract; treasury outflows confirmed by multiple "
                "sources. Immediate pause required to stop ongoing loss of funds."
            ),
            json.dumps(evidence),
        ],
        label="submit_report",
    )

    inc = json.loads(_rd(gl_client, acct, a, "get_incident", [iid]))
    assert inc["status"] == "SUBMITTED"
    assert inc["reporter"].lower() == acct.address.lower()
    assert inc["evidence_ids"] == [f"{iid}:e0", f"{iid}:e1"]
    assert inc["network"] == "studionet"

    hist = json.loads(_rd(gl_client, acct, a, "get_history", [iid]))
    assert hist[0]["type"] == "REPORT_SUBMITTED"

    ev = json.loads(_rd(gl_client, acct, a, "get_evidence", [f"{iid}:e0"]))
    assert ev["reference"] == REF_A
    assert ev["collection_status"] == "PENDING"
    assert ev["corroborated"] is False

    evs = json.loads(_rd(gl_client, acct, a, "get_evidence_for_incident", [iid]))
    assert len(evs) == 2

    ids = json.loads(_rd(gl_client, acct, a, "get_incident_ids"))
    assert iid in ids

    # Third evidence via append_evidence (distinct ref, ONCHAIN_VERIFIED type).
    _wr(
        gl_client,
        acct,
        a,
        "append_evidence",
        [f"{iid}:ext", iid, "ONCHAIN_VERIFIED", "onchain", REF_C,
         "Post-mortem confirms identical reentrancy drain; funds still moving."],
        label="append_evidence",
    )
    evs = json.loads(_rd(gl_client, acct, a, "get_evidence_for_incident", [iid]))
    assert len(evs) == 3
    assert evs[2]["evidence_id"] == f"{iid}:ext"
    assert evs[2]["collection_status"] == "PENDING"
    hist = json.loads(_rd(gl_client, acct, a, "get_history", [iid]))
    assert hist[-1]["type"] == "EVIDENCE_APPENDED"

    _wr(gl_client, acct, a, "startInvestigation", [iid], label="startInvestigation")
    inc = json.loads(_rd(gl_client, acct, a, "get_incident", [iid]))
    assert inc["status"] == "UNDER_INVESTIGATION"
    hist = json.loads(_rd(gl_client, acct, a, "get_history", [iid]))
    assert hist[-1]["type"] == "INVESTIGATION_STARTED"


# --------------------------------------------------------------------------- #
# T03 — assess (real LLM + real web fetch) and syncDecision
# --------------------------------------------------------------------------- #

def test_03_assess_and_sync_decision(guardian, gl_client, default_account):
    a, acct = guardian, default_account
    iid = S["iid"]

    receipt = None
    for attempt in range(1, ASSESS_TX_ATTEMPTS + 1):
        receipt = _assess(gl_client, acct, a, iid, f"assess#{attempt}")
        if receipt is not None:
            break
    assert receipt is not None, (
        f"assess did not reach FINALIZED+CONSENSUS after {ASSESS_TX_ATTEMPTS} "
        "attempts (LLM nondeterminism across validators)"
    )

    assessment = json.loads(_rd(gl_client, acct, a, "get_assessment", [iid]))
    assert assessment["seq"] >= 1
    assert assessment["threat_level"] in THREAT_LEVELS
    assert assessment["confidence_level"] in CONFIDENCE_LEVELS
    S["assessment"] = assessment
    print(
        f"  [assessment] seq={assessment['seq']} "
        f"threat={assessment['threat_level']} "
        f"confidence={assessment['confidence_level']} "
        f"action={assessment['recommended_action']} "
        f"conflict={assessment['evidence_conflict']}",
        flush=True,
    )

    # Evidence verification outcome (feeds gate G7 later).
    evs = json.loads(_rd(gl_client, acct, a, "get_evidence_for_incident", [iid]))
    verified = [
        e for e in evs
        if e.get("corroborated") is True and e.get("collection_status") == "VERIFIED"
    ]
    S["verified_refs"] = sorted({e["reference"] for e in verified})
    print(
        f"  [verification] {len(verified)}/{len(evs)} verified, "
        f"distinct refs={S['verified_refs']}",
        flush=True,
    )

    # Note: write receipts carry the receipt dict, not the method's return
    # value — assert decisions through the incident view (actual state).
    _wr(gl_client, acct, a, "syncDecision", [iid], label="syncDecision")
    inc = json.loads(_rd(gl_client, acct, a, "get_incident", [iid]))
    decision = inc["status"]
    assert decision in ("CONFIRMED", "REJECTED", "INCONCLUSIVE"), decision
    S["status"] = decision

    hist = json.loads(_rd(gl_client, acct, a, "get_history", [iid]))
    decisions_before = sum(1 for h in hist if h["type"] == "DECISION_RECORDED")
    assert decisions_before == 1

    # Idempotent branch: already decided -> status unchanged, no new event.
    _wr(
        gl_client, acct, a, "syncDecision", [iid], label="syncDecision(idempotent)"
    )
    inc = json.loads(_rd(gl_client, acct, a, "get_incident", [iid]))
    assert inc["status"] == decision
    hist = json.loads(_rd(gl_client, acct, a, "get_history", [iid]))
    decisions_after = sum(1 for h in hist if h["type"] == "DECISION_RECORDED")
    assert decisions_after == decisions_before
    print(f"  [decision] {decision}", flush=True)


# --------------------------------------------------------------------------- #
# T04 — reassess + bounded retries to reach CONFIRMED
# --------------------------------------------------------------------------- #

def test_04_reassess_to_confirmed(guardian, gl_client, default_account):
    a, acct = guardian, default_account
    iid = S["iid"]

    # reassess from a decided status reopens the incident.
    _wr(gl_client, acct, a, "reassess", [iid], label="reassess")
    inc = json.loads(_rd(gl_client, acct, a, "get_incident", [iid]))
    assert inc["status"] == "UNDER_INVESTIGATION"

    # Re-decide from the existing assessment first (cheap path).
    _wr(gl_client, acct, a, "syncDecision", [iid], label="syncDecision(re-decide)")
    decision = json.loads(
        _rd(gl_client, acct, a, "get_incident", [iid])
    )["status"]
    extra_refs = [REF_D, REF_E]
    attempt = 0
    while decision != "CONFIRMED" and attempt < ASSESS_MAX_ATTEMPTS:
        attempt += 1
        ref = extra_refs[(attempt - 1) % len(extra_refs)]
        _wr(
            gl_client,
            acct,
            a,
            "append_evidence",
            [f"{iid}:retry{attempt}", iid, "EXTERNAL", "external", ref,
             (f"Corroborating source {attempt}: active exploit ongoing, "
              "funds at risk, pause target immediately to stop losses.")],
            label=f"append_evidence(retry{attempt})",
        )
        receipt = None
        for sub in range(1, ASSESS_TX_ATTEMPTS + 1):
            receipt = _assess(
                gl_client, acct, a, iid, f"assess(retry{attempt}.{sub})"
            )
            if receipt is not None:
                break
        if receipt is None:
            print(
                f"  [retry{attempt}] assess never reached consensus; "
                "re-deciding from the last persisted assessment",
                flush=True,
            )
        _wr(
            gl_client, acct, a, "syncDecision", [iid],
            label=f"syncDecision(retry{attempt})",
        )
        decision = json.loads(
            _rd(gl_client, acct, a, "get_incident", [iid])
        )["status"]
        assessment = json.loads(_rd(gl_client, acct, a, "get_assessment", [iid]))
        S["assessment"] = assessment
        evs = json.loads(_rd(gl_client, acct, a, "get_evidence_for_incident", [iid]))
        verified = [
            e for e in evs
            if e.get("corroborated") is True
            and e.get("collection_status") == "VERIFIED"
        ]
        S["verified_refs"] = sorted({e["reference"] for e in verified})
        print(
            f"  [retry{attempt}] decision={decision} "
            f"threat={assessment['threat_level']} "
            f"confidence={assessment['confidence_level']} "
            f"verified={len(S['verified_refs'])}",
            flush=True,
        )

    S["status"] = decision
    if decision != "CONFIRMED":
        assessment = S.get("assessment", {})
        pytest.fail(
            "incident never reached CONFIRMED — emergency methods cannot be "
            f"exercised. last decision={decision}, "
            f"threat={assessment.get('threat_level')}, "
            f"confidence={assessment.get('confidence_level')}, "
            f"conflict={assessment.get('evidence_conflict')}, "
            f"verified_refs={S.get('verified_refs')}"
        )


# --------------------------------------------------------------------------- #
# T05 — governance: set_policy (v2) before the emergency gates
# --------------------------------------------------------------------------- #

def test_05_set_policy(guardian, gl_client, default_account):
    a, acct = guardian, default_account
    _wr(gl_client, acct, a, "set_policy", [LENIENT], label="set_policy")

    assert int(_rd(gl_client, acct, a, "get_version")) == 2
    assert json.loads(_rd(gl_client, acct, a, "get_policy")) == json.loads(LENIENT)
    # v1 remains queryable.
    assert json.loads(_rd(gl_client, acct, a, "get_policy_at", [1])) == json.loads(
        BOOTSTRAP
    )
    rec = json.loads(_rd(gl_client, acct, a, "get_policy_record", [2]))
    assert rec["version"] == 2
    assert rec["activated_by"].lower() == acct.address.lower()
    assert json.loads(rec["payload"]) == json.loads(LENIENT)


# --------------------------------------------------------------------------- #
# T06 — emergency lifecycle: initiate -> confirm -> recover -> reset -> resolve
# --------------------------------------------------------------------------- #

def test_06_emergency_lifecycle(guardian, gl_client, default_account):
    a, acct = guardian, default_account
    iid = S["iid"]

    # Preconditions with full diagnostics (honest failure if gates can't pass).
    inc = json.loads(_rd(gl_client, acct, a, "get_incident", [iid]))
    if inc["status"] != "CONFIRMED":
        pytest.fail(f"G3 precondition failed: status={inc['status']}")
    if len(S.get("verified_refs", [])) < 2:
        pytest.fail(
            "G7 precondition failed: fewer than 2 distinct consensus-verified "
            f"references (have {S.get('verified_refs')})"
        )

    _wr(gl_client, acct, a, "initiateEmergency", [iid], label="initiateEmergency")
    state = json.loads(_rd(gl_client, acct, a, "get_state"))
    assert state["state"] == "EMERGENCY_PENDING"
    assert state["active_incident"] == iid
    assert state["paused"] is False  # phase 1: not yet applied
    assert state["last_emergency_unix"] > 0
    assert _rd(gl_client, acct, a, "is_paused") is False

    # Keeper discipline: only after the initiate tx is FINALIZED.
    _wr(gl_client, acct, a, "confirmEmergency", [iid], label="confirmEmergency")
    assert json.loads(_rd(gl_client, acct, a, "get_state"))["state"] == (
        "EMERGENCY_ACTIVE"
    )
    assert _rd(gl_client, acct, a, "is_paused") is True

    _wr(
        gl_client, acct, a, "requestRecovery", [iid, "exploit contained"],
        label="requestRecovery",
    )
    assert json.loads(_rd(gl_client, acct, a, "get_state"))["state"] == (
        "RECOVERY_PENDING"
    )

    _wr(gl_client, acct, a, "confirmRecovery", [iid], label="confirmRecovery")
    state = json.loads(_rd(gl_client, acct, a, "get_state"))
    assert state["state"] == "RECOVERED"
    assert state["paused"] is False
    assert _rd(gl_client, acct, a, "is_paused") is False

    _wr(gl_client, acct, a, "resetToNormal", [], label="resetToNormal")
    state = json.loads(_rd(gl_client, acct, a, "get_state"))
    assert state["state"] == "NORMAL"
    assert state["active_incident"] == ""

    _wr(
        gl_client, acct, a, "resolveIncident",
        [iid, "RESOLVED", "incident handled via two-phase pause lifecycle"],
        label="resolveIncident",
    )
    inc = json.loads(_rd(gl_client, acct, a, "get_incident", [iid]))
    assert inc["status"] == "RESOLVED"
    S["resolved"] = True

    # Idempotent re-resolve: second call is a no-op returning RESOLVED.
    _wr(
        gl_client, acct, a, "resolveIncident", [iid, "RESOLVED", "dup"],
        label="resolveIncident(idempotent)",
    )
    inc = json.loads(_rd(gl_client, acct, a, "get_incident", [iid]))
    assert inc["status"] == "RESOLVED"


# --------------------------------------------------------------------------- #
# T07 — governance: rollback restores the bootstrap payload (v3)
# --------------------------------------------------------------------------- #

def test_07_policy_rollback(guardian, gl_client, default_account):
    a, acct = guardian, default_account
    _wr(gl_client, acct, a, "rollback", [1], label="rollback(1)")

    assert int(_rd(gl_client, acct, a, "get_version")) == 3
    assert json.loads(_rd(gl_client, acct, a, "get_policy")) == json.loads(BOOTSTRAP)
    # Rolled-back-over policy still queryable at its version.
    assert json.loads(_rd(gl_client, acct, a, "get_policy_at", [2])) == json.loads(
        LENIENT
    )
    assert json.loads(_rd(gl_client, acct, a, "get_policy_record", [3]))[
        "version"
    ] == 3


# --------------------------------------------------------------------------- #
# T08 — final read-side sweep across all view methods
# --------------------------------------------------------------------------- #

def test_08_final_views(guardian, gl_client, default_account):
    a, acct = guardian, default_account
    iid = S["iid"]

    state = json.loads(_rd(gl_client, acct, a, "get_state"))
    assert state["state"] == "NORMAL"
    assert state["paused"] is False
    assert state["protocol_locked"] is False
    assert state["policy_version"] == 3

    inc = json.loads(_rd(gl_client, acct, a, "get_incident", [iid]))
    expected = "RESOLVED" if S.get("resolved") else inc["status"]
    assert inc["status"] == expected
    S["final_status"] = inc["status"]

    hist = json.loads(_rd(gl_client, acct, a, "get_history", [iid]))
    types = [h["type"] for h in hist]
    for required in (
        "REPORT_SUBMITTED",
        "INVESTIGATION_STARTED",
        "ASSESSMENT_RECORDED",
        "DECISION_RECORDED",
        "REASSESS_REQUESTED",
    ):
        assert required in types, f"missing history event {required} in {types}"
    if S.get("resolved"):
        assert "INCIDENT_RESOLVED" in types
    print(f"  [history] {types}", flush=True)

    hint = json.loads(_rd(gl_client, acct, a, "get_protocol_hint"))
    assert hint["total"] == len(json.loads(_rd(gl_client, acct, a, "get_incident_ids")))
    assert hint["by_status"].get(inc["status"]) == 1
    assert hint["governance"].lower() == acct.address.lower()

    # Assessment + evidence still readable after resolution.
    assessment = json.loads(_rd(gl_client, acct, a, "get_assessment", [iid]))
    assert assessment["seq"] >= 1
    evs = json.loads(_rd(gl_client, acct, a, "get_evidence_for_incident", [iid]))
    assert len(evs) >= 3

    assert _rd(gl_client, acct, a, "is_paused") is False
    assert _rd(gl_client, acct, a, "pause_supported") is True

    print(
        f"  [final] incident={inc['status']} policy_version=3 "
        f"evidence={len(evs)} assessment_seq={assessment['seq']}",
        flush=True,
    )
