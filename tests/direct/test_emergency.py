"""Area 3+4 — EMERGENCY AUTHORITY + PROTECTED STATE.

Scenarios:
- A  full lifecycle: initiate -> confirm -> recover -> reset (two-phase)
- B  weak reports never reach an emergency
- Gate matrix G1, G3, G5, G6, G7, G9, G10 exercised for real; G2, G4, G8,
  G11 are structurally unreachable in single-contract mode and are asserted
  as invariants instead of faked trips (documented limitation, not skipped).
"""

import json

CONTRACT = "contracts/GenesisGuardian.py"


def _addr(a) -> str:
    """Fixture addresses are raw 20-byte values; contract wants 0x-hex."""
    if isinstance(a, (bytes, bytearray)):
        return "0x" + bytes(a).hex()
    return str(a)


BOOTSTRAP = json.dumps(
    {
        "min_confidence": "MEDIUM",
        "min_corroborating_sources": 2,
        "allowed_threat_levels": ["HIGH", "CRITICAL"],
        "allowed_actions": ["PAUSE_TARGET"],
        "cooldown_seconds": 3600,
    }
)

URL_A = "https://site-a.example/report/1"
URL_B = "https://site-b.example/report/2"

GOOD = {
    "threat_category": "EXPLOIT",
    "threat_level": "HIGH",
    "recommended_action": "PAUSE_TARGET",
    "confidence_level": "HIGH",
    "reasoning_summary": "reentrancy drain pattern observed in tx history",
    "evidence_conflict": False,
    "unresolved_questions": "",
}


def _deploy(direct_deploy, direct_owner):
    return direct_deploy(CONTRACT, _addr(direct_owner), BOOTSTRAP)


def _mock_web_ok(direct_vm):
    direct_vm.mock_web("site-a.example", {"status": 200, "body": "report body ok"})
    direct_vm.mock_web("site-b.example", {"status": 200, "body": "report body ok"})


def _confirm_incident(direct_vm, c, iid="inc1", refs=None, response=None,
                      summary="drain observed"):
    """Run an existing contract's incident through to status CONFIRMED."""
    refs = refs or [URL_A, URL_B]
    evidence = [
        {"source_type": "EXTERNAL", "category": "onchain",
         "reference": r, "summary": summary}
        for r in refs
    ]
    c.submit_report(iid, "0xTargetContract", "studionet",
                    json.dumps(["0xtxhash1"]), json.dumps(["0xwallet1"]),
                    "reentrancy drain", json.dumps(evidence))
    c.startInvestigation(iid)
    for r in refs:
        host = r.split("//")[1].split("/")[0]
        direct_vm.mock_web(host, {"status": 200, "body": "ok"})
    direct_vm.mock_llm("UNTRUSTED DATA", json.dumps(response or GOOD))
    out = json.loads(c.assess(iid))
    assert out["seq"] == 1
    assert c.syncDecision(iid) == "CONFIRMED"
    return c


def _confirmed(direct_vm, direct_deploy, direct_owner, iid="inc1",
               refs=None, response=None, summary="drain observed"):
    """Fresh contract with an incident through the full path to CONFIRMED."""
    c = _deploy(direct_deploy, direct_owner)
    return _confirm_incident(direct_vm, c, iid=iid, refs=refs,
                             response=response, summary=summary)


def _state(c) -> dict:
    return json.loads(c.get_state())


# --- Scenario A: full lifecycle (two-phase finality) ----------------------

def test_scenario_a_full_lifecycle(direct_vm, direct_deploy, direct_owner, direct_alice):
    c = _confirmed(direct_vm, direct_deploy, direct_owner)
    st = _state(c)
    assert st["state"] == "NORMAL" and st["paused"] is False

    # Phase 1: initiate — emergency recorded but NOT applied yet
    # (the keeper waits for tx FINALIZED before calling confirm).
    assert c.initiateEmergency("inc1") == "EMERGENCY_PENDING"
    st = _state(c)
    assert st["state"] == "EMERGENCY_PENDING"
    assert st["active_incident"] == "inc1"
    assert st["paused"] is False, "pause must not apply before confirm"
    assert st["protocol_locked"] is False
    assert st["last_emergency_unix"] > 0

    # Phase 2: confirm applies the pause.
    assert c.confirmEmergency("inc1") == "EMERGENCY_ACTIVE"
    st = _state(c)
    assert st["paused"] is True and st["protocol_locked"] is True
    assert c.is_paused() is True

    # Recovery: governance requests, keeper confirms after FINALIZED.
    with direct_vm.expect_revert("only governance may request recovery"):
        with direct_vm.prank(direct_alice):
            c.requestRecovery("inc1", "threat contained")
    assert c.requestRecovery("inc1", "threat contained") == "RECOVERY_PENDING"
    assert c.confirmRecovery("inc1") == "RECOVERED"
    st = _state(c)
    assert st["paused"] is False and st["protocol_locked"] is False
    assert c.resetToNormal() == "NORMAL"
    st = _state(c)
    assert st["state"] == "NORMAL"
    assert st["active_incident"] == ""

    # Action log covers the whole cycle.
    tail = [json.loads(x)["type"] for x in st["history_tail"]]
    assert tail == ["INITIATE_EMERGENCY", "PAUSE_APPLIED",
                    "REQUEST_RECOVERY", "UNPAUSE_APPLIED", "RESET_NORMAL"]

    # Incident resolution: CONFIRMED is governance-only.
    with direct_vm.expect_revert("only governance resolves CONFIRMED incidents"):
        with direct_vm.prank(direct_alice):
            c.resolveIncident("inc1", "RESOLVED", "patched")
    assert c.resolveIncident("inc1", "RESOLVED", "patched") == "RESOLVED"


# --- state machine guards --------------------------------------------------

def test_state_machine_guard_messages(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)

    # confirm without pending
    with direct_vm.expect_revert("confirmEmergency requires EMERGENCY_PENDING, got NORMAL"):
        c.confirmEmergency("inc1")
    # confirmRecovery without pending
    with direct_vm.expect_revert("confirmRecovery requires RECOVERY_PENDING, got NORMAL"):
        c.confirmRecovery("inc1")
    # reset without recovered
    with direct_vm.expect_revert("resetToNormal requires RECOVERED, got NORMAL"):
        c.resetToNormal()
    # requestRecovery before active
    with direct_vm.expect_revert("requestRecovery requires EMERGENCY_ACTIVE, got NORMAL"):
        c.requestRecovery("inc1", "why")


def test_confirm_and_recover_incident_mismatch(direct_vm, direct_deploy, direct_owner):
    c = _confirmed(direct_vm, direct_deploy, direct_owner)
    c.initiateEmergency("inc1")
    with direct_vm.expect_revert("confirmEmergency incident mismatch"):
        c.confirmEmergency("other-incident")
    c.confirmEmergency("inc1")
    with direct_vm.expect_revert("requestRecovery incident mismatch"):
        c.requestRecovery("other-incident", "x")
    assert c.requestRecovery("inc1", "ok") == "RECOVERY_PENDING"
    with direct_vm.expect_revert("confirmRecovery incident mismatch"):
        c.confirmRecovery("other-incident")
    c.confirmRecovery("inc1")
    assert c.resetToNormal() == "NORMAL"


# --- gate matrix -----------------------------------------------------------

def test_g1_blocks_non_normal_state(direct_vm, direct_deploy, direct_owner):
    c = _confirmed(direct_vm, direct_deploy, direct_owner)
    c.initiateEmergency("inc1")           # -> EMERGENCY_PENDING
    with direct_vm.expect_revert("G1 gate: state EMERGENCY_PENDING != NORMAL"):
        c.initiateEmergency("inc1")
    # G1 also rejects an empty incident id while NORMAL.
    c.confirmEmergency("inc1")
    c.requestRecovery("inc1", "x")
    c.confirmRecovery("inc1")
    c.resetToNormal()
    with direct_vm.expect_revert("G1 gate: empty incident_id"):
        c.initiateEmergency("")


def test_g3_blocks_unconfirmed_decisions(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    # No investigation at all -> G3 (status SUBMITTED)
    c.submit_report("inc1", "0xT", "studionet", json.dumps([]), json.dumps([]),
                    "drain", json.dumps([{
                        "source_type": "EXTERNAL", "category": "c",
                        "reference": URL_A, "summary": "s"}]))
    with direct_vm.expect_revert("G3 gate: status SUBMITTED != CONFIRMED"):
        c.initiateEmergency("inc1")

    # Investigated but never assessed -> INCONCLUSIVE -> G3
    c.startInvestigation("inc1")
    c.syncDecision("inc1")
    with direct_vm.expect_revert("G3 gate: status INCONCLUSIVE != CONFIRMED"):
        c.initiateEmergency("inc1")
    assert c.is_paused() is False


def test_g5_threat_level_filter(direct_vm, direct_deploy, direct_owner):
    c = _confirmed(direct_vm, direct_deploy, direct_owner)
    # Governance tightens the allowlist to CRITICAL-only; assessment is HIGH.
    policy = json.loads(BOOTSTRAP)
    policy["allowed_threat_levels"] = ["CRITICAL"]
    c.set_policy(json.dumps(policy))
    with direct_vm.expect_revert("G5 gate: threat HIGH not in"):
        c.initiateEmergency("inc1")


def test_g6_confidence_threshold(direct_vm, direct_deploy, direct_owner):
    # MEDIUM confidence passes the bootstrap floor (MEDIUM) but not HIGH.
    c = _confirmed(direct_vm, direct_deploy, direct_owner,
                   response={**GOOD, "confidence_level": "MEDIUM"})
    policy = json.loads(BOOTSTRAP)
    policy["min_confidence"] = "HIGH"
    c.set_policy(json.dumps(policy))
    with direct_vm.expect_revert("G6 gate: confidence MEDIUM < HIGH"):
        c.initiateEmergency("inc1")


def test_g7_corroboration_threshold(direct_vm, direct_deploy, direct_owner):
    c = _confirmed(direct_vm, direct_deploy, direct_owner)
    policy = json.loads(BOOTSTRAP)
    policy["min_corroborating_sources"] = 3
    c.set_policy(json.dumps(policy))
    with direct_vm.expect_revert("G7 gate: corroborated 2 < 3"):
        c.initiateEmergency("inc1")


def test_g7_counts_distinct_references_only(direct_vm, direct_deploy, direct_owner):
    # Two evidence items pointing at the SAME url: both verified, but only
    # one distinct corroborating source.
    c = _confirmed(direct_vm, direct_deploy, direct_owner, refs=[URL_A, URL_A])
    with direct_vm.expect_revert("G7 gate: corroborated 1 < 2"):
        c.initiateEmergency("inc1")


def test_g7_blocks_unverified_evidence(direct_vm, direct_deploy, direct_owner):
    # One source 404s -> FAILED, not corroborated -> only 1 < 2.
    c = _deploy(direct_deploy, direct_owner)
    c.submit_report("inc1", "0xT", "studionet", json.dumps(["0xtx"]),
                    json.dumps(["0xw"]), "drain", json.dumps([
                        {"source_type": "EXTERNAL", "category": "c",
                         "reference": URL_A, "summary": "s"},
                        {"source_type": "EXTERNAL", "category": "c",
                         "reference": URL_B, "summary": "s"},
                    ]))
    c.startInvestigation("inc1")
    direct_vm.mock_web("site-a.example", {"status": 200, "body": "ok"})
    direct_vm.mock_web("site-b.example", {"status": 404, "body": "gone"})
    direct_vm.mock_llm("UNTRUSTED DATA", json.dumps(GOOD))
    json.loads(c.assess("inc1"))
    assert c.syncDecision("inc1") == "CONFIRMED"   # decision rules don't gate on web
    with direct_vm.expect_revert("G7 gate: corroborated 1 < 2"):
        c.initiateEmergency("inc1")


def test_g9_cooldown(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    _confirm_incident(direct_vm, c, iid="incA")
    c.initiateEmergency("incA")
    c.confirmEmergency("incA")
    c.requestRecovery("incA", "done")
    c.confirmRecovery("incA")
    c.resetToNormal()
    assert _state(c)["last_emergency_unix"] > 0

    # Second incident on the SAME contract, still inside the 3600s cooldown.
    _confirm_incident(direct_vm, c, iid="incB")
    with direct_vm.expect_revert("G9 gate: cooldown active until"):
        c.initiateEmergency("incB")

    # Cooldown is policy-driven: set to 0 -> gate opens.
    policy = json.loads(BOOTSTRAP)
    policy["cooldown_seconds"] = 0
    c.set_policy(json.dumps(policy))
    assert c.initiateEmergency("incB") == "EMERGENCY_PENDING"


def test_g10_action_must_authorize_pause(direct_vm, direct_deploy, direct_owner):
    c = _confirmed(direct_vm, direct_deploy, direct_owner,
                   response={**GOOD, "recommended_action": "INVESTIGATE"})
    with direct_vm.expect_revert("G10 gate: action INVESTIGATE not in"):
        c.initiateEmergency("inc1")
    assert c.is_paused() is False


# --- structural gates (G2, G4, G8, G11): invariants, not fake trips -------

def test_structural_gates_are_invariants(direct_vm, direct_deploy, direct_owner):
    """G2/G4/G8/G11 cannot be tripped in single-contract mode.

    - G2/G4: CONFIRMED status requires an assessment record (seq >= 1), and
      every persisted assessment carries generated_at -> gates always pass
      when reachable.
    - G8: fixed decision rules map evidence_conflict -> INCONCLUSIVE, so a
      CONFIRMED assessment always has conflict False (proven in test_assess
      Scenario D).
    - G11: pause_capability has no setter; it is True from genesis.
    """
    c = _confirmed(direct_vm, direct_deploy, direct_owner)
    a = json.loads(c.get_assessment("inc1"))
    assert a["seq"] >= 1                      # G2 input always present
    assert a["generated_at"] != ""            # G4 input always present
    assert a["evidence_conflict"] is False    # G8 input forced by rules
    assert c.pause_supported() is True        # G11 always on

    # Reaching initiate at all proves these inputs survive the G1-G7 path:
    assert c.initiateEmergency("inc1") == "EMERGENCY_PENDING"


# --- Scenario B: weak reports never pause ---------------------------------

def test_scenario_b_weak_reports_never_pause(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)

    # (i) no evidence -> investigation refused outright
    c.submit_report("weak1", "0xT", "studionet", json.dumps([]), json.dumps([]),
                    "maybe nothing", json.dumps([]))
    with direct_vm.expect_revert("cannot investigate without evidence"):
        c.startInvestigation("weak1")

    # (ii) low-threat assessment -> REJECTED -> G3 blocks any emergency
    c.submit_report("weak2", "0xT", "studionet", json.dumps(["0xtx"]),
                    json.dumps(["0xw"]), "benign alert", json.dumps([
                        {"source_type": "EXTERNAL", "category": "c",
                         "reference": URL_A, "summary": "s"}]))
    c.startInvestigation("weak2")
    direct_vm.mock_web("site-a.example", {"status": 200, "body": "ok"})
    direct_vm.mock_llm("UNTRUSTED DATA",
                       json.dumps({**GOOD, "threat_level": "LOW"}))
    json.loads(c.assess("weak2"))
    assert c.syncDecision("weak2") == "REJECTED"
    with direct_vm.expect_revert("G3 gate: status REJECTED != CONFIRMED"):
        c.initiateEmergency("weak2")

    st = _state(c)
    assert st["state"] == "NORMAL"
    assert st["paused"] is False
