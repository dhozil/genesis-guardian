"""Area 2 hardening: content binding, verification consensus, provenance.

Review asks covered here:
- a reachable page that never references the incident is not corroboration
  (opt-in through policy `require_content_match`);
- validators must agree on the derived status and on the content-match signal,
  not only on a collapsed boolean;
- the bytes each verdict rested on leave a fingerprint, per assessment.
"""

import json

CONTRACT = "contracts/GenesisGuardian.py"


def _addr(a) -> str:
    """Fixture addresses are raw 20-byte values; the contract wants 0x-hex."""
    if isinstance(a, (bytes, bytearray)):
        return "0x" + bytes(a).hex()
    return str(a)


BASE = {
    "min_confidence": "MEDIUM",
    "min_corroborating_sources": 2,
    "allowed_threat_levels": ["HIGH", "CRITICAL"],
    "allowed_actions": ["PAUSE_TARGET"],
    "cooldown_seconds": 3600,
}
STRICT = dict(BASE, require_content_match=True)
BOOTSTRAP = json.dumps(BASE)

URL_A = "https://site-a.example/report/1"
URL_B = "https://site-b.example/report/2"

GOOD = {
    "threat_category": "EXPLOIT",
    "threat_level": "HIGH",
    "recommended_action": "PAUSE_TARGET",
    "confidence_level": "HIGH",
    "reasoning_summary": "reentrancy drain confirmed by two independent sources",
    "evidence_conflict": False,
    "unresolved_questions": "",
}


def _deploy(direct_deploy, direct_owner):
    return direct_deploy(CONTRACT, _addr(direct_owner), BOOTSTRAP)


def _submit(c):
    evidence = [
        {
            "source_type": "EXTERNAL",
            "category": "onchain",
            "reference": url,
            "summary": "treasury drain observed",
        }
        for url in (URL_A, URL_B)
    ]
    c.submit_report(
        "inc1",
        "0xTargetContract",
        "studionet",
        json.dumps(["0xtxhash1"]),
        json.dumps([]),
        "reentrancy drain in progress",
        json.dumps(evidence),
    )
    c.startInvestigation("inc1")


def _llm(direct_vm):
    direct_vm.mock_llm("UNTRUSTED DATA", json.dumps(GOOD))


def test_reachable_but_unrelated_page_is_not_corroboration(
    direct_vm, direct_deploy, direct_owner
):
    """HTTP 200 alone must not satisfy the corroboration gate in strict mode."""
    c = _deploy(direct_deploy, direct_owner)
    c.set_policy(json.dumps(STRICT))
    _submit(c)

    direct_vm.mock_web("site-a.example", {"status": 200, "body": "welcome to our site"})
    direct_vm.mock_web("site-b.example", {"status": 200, "body": "unrelated news"})
    _llm(direct_vm)

    json.loads(c.assess("inc1"))

    for eid in ("inc1:e0", "inc1:e1"):
        ev = json.loads(c.get_evidence(eid))
        assert ev["collection_status"] == "FAILED"
        assert ev["corroborated"] is False
        assert ev["content_match"] is False
        assert len(ev["content_hash"]) == 16
        assert ev["fetched_at"] != ""

    # The verdict itself is still CONFIRMED (evidence_conflict False), but the
    # pause is impossible because nothing corroborated.
    assert c.syncDecision("inc1") == "CONFIRMED"
    with direct_vm.expect_revert("G7 gate: corroborated 0 < 2"):
        c.initiateEmergency("inc1")


def test_referencing_page_verifies_and_leaves_provenance(
    direct_vm, direct_deploy, direct_owner
):
    c = _deploy(direct_deploy, direct_owner)
    c.set_policy(json.dumps(STRICT))
    _submit(c)

    direct_vm.mock_web(
        "site-a.example",
        {"status": 200, "body": "exploit draining 0xTargetContract right now"},
    )
    direct_vm.mock_web(
        "site-b.example",
        {"status": 200, "body": "tx 0xtxhash1 confirms the treasury drain"},
    )
    _llm(direct_vm)

    json.loads(c.assess("inc1"))

    e0 = json.loads(c.get_evidence("inc1:e0"))
    e1 = json.loads(c.get_evidence("inc1:e1"))
    assert (e0["collection_status"], e0["corroborated"]) == ("VERIFIED", True)
    assert (e1["collection_status"], e1["corroborated"]) == ("VERIFIED", True)
    assert e0["content_match"] is True and e1["content_match"] is True
    assert e0["content_hash"] != "" and e0["content_hash"] != e1["content_hash"]

    # Provenance survives in the audit trail, tagged with the assessment seq.
    hist = json.loads(c.get_history("inc1"))
    verified = [h for h in hist if h["type"] == "EVIDENCE_VERIFIED"]
    assert len(verified) == 2
    assert {h["evidence_id"] for h in verified} == {"inc1:e0", "inc1:e1"}
    assert all(h["seq"] == 1 and h["status"] == "VERIFIED" for h in verified)


def test_validators_must_agree_on_status_not_only_boolean(
    direct_vm, direct_deploy, direct_owner
):
    """FAILED (404) and UNAVAILABLE (5xx) share `verified == False`; they must
    still not pass as the same observation."""
    c = _deploy(direct_deploy, direct_owner)
    _submit(c)

    direct_vm.mock_web("site-a.example", {"status": 200, "body": "ok"})
    direct_vm.mock_web("site-b.example", {"status": 404, "body": "missing"})
    _llm(direct_vm)
    json.loads(c.assess("inc1"))

    leader = json.loads(c.get_evidence("inc1:e1"))
    assert leader["collection_status"] == "FAILED"

    direct_vm.clear_mocks()
    direct_vm.mock_web("site-a.example", {"status": 200, "body": "ok"})
    direct_vm.mock_web("site-b.example", {"status": 500, "body": "upstream boom"})
    _llm(direct_vm)

    assert direct_vm.run_validator() is False

    # Same status again -> agreement.
    direct_vm.clear_mocks()
    direct_vm.mock_web("site-a.example", {"status": 200, "body": "ok"})
    direct_vm.mock_web("site-b.example", {"status": 404, "body": "missing"})
    _llm(direct_vm)
    assert direct_vm.run_validator() is True


def test_validators_must_agree_on_content_match(
    direct_vm, direct_deploy, direct_owner
):
    """Two 200 pages, identical verdict, different content relevance: disagree."""
    c = _deploy(direct_deploy, direct_owner)
    _submit(c)

    direct_vm.mock_web(
        "site-a.example", {"status": 200, "body": "incident on 0xTargetContract"}
    )
    direct_vm.mock_web("site-b.example", {"status": 200, "body": "report body ok"})
    _llm(direct_vm)
    json.loads(c.assess("inc1"))
    assert json.loads(c.get_evidence("inc1:e0"))["content_match"] is True

    direct_vm.clear_mocks()
    direct_vm.mock_web("site-a.example", {"status": 200, "body": "report body ok"})
    direct_vm.mock_web("site-b.example", {"status": 200, "body": "report body ok"})
    _llm(direct_vm)

    assert direct_vm.run_validator() is False
