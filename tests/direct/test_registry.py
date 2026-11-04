"""Area 2 — INCIDENT INTELLIGENCE: reports, evidence, decisions, resolution.

Covers the registry half of Area 2 (report intake, evidence bounds,
lifecycle guards, fixed decision rules without an assessment, resolution
authority). LLM assessment paths live in test_assess.py.
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


def _deploy(direct_deploy, direct_owner):
    return direct_deploy(CONTRACT, _addr(direct_owner), BOOTSTRAP)


def _ev(reference="https://a.example/report", source_type="EXTERNAL", summary="drain observed"):
    return {
        "source_type": source_type,
        "category": "onchain",
        "reference": reference,
        "summary": summary,
    }


def _submit(c, incident_id="inc1", evidence=None, description="reentrancy drain"):
    if evidence is None:
        evidence = [_ev()]
    return c.submit_report(
        incident_id,
        "0xTargetContract",
        "studionet",
        json.dumps(["0xtxhash1"]),
        json.dumps(["0xwallet1"]),
        description,
        json.dumps(evidence),
    )


# --- report intake --------------------------------------------------------

def test_submit_report_records_reporter_and_history(direct_vm, direct_deploy, direct_owner, direct_alice):
    c = _deploy(direct_deploy, direct_owner)
    with direct_vm.prank(direct_alice):
        out = json.loads(_submit(c))
    assert out == {"incident_id": "inc1", "status": "SUBMITTED", "evidence_count": 1}

    inc = json.loads(c.get_incident("inc1"))
    assert inc["status"] == "SUBMITTED"
    assert inc["reporter"].lower() == _addr(direct_alice)
    assert inc["contract_address"] == "0xTargetContract"
    assert inc["network"] == "studionet"
    assert inc["tx_hashes"] == ["0xtxhash1"]
    assert inc["suspicious_wallets"] == ["0xwallet1"]
    assert inc["evidence_ids"] == ["inc1:e0"]

    ev = json.loads(c.get_evidence("inc1:e0"))
    assert ev["collection_status"] == "PENDING"
    assert ev["corroborated"] is False
    assert ev["reference"] == "https://a.example/report"

    hist = json.loads(c.get_history("inc1"))
    assert hist[0]["type"] == "REPORT_SUBMITTED"
    assert hist[0]["evidence_count"] == 1

    assert json.loads(c.get_incident_ids()) == ["inc1"]
    hint = json.loads(c.get_protocol_hint())
    assert hint["total"] == 1
    assert hint["by_status"] == {"SUBMITTED": 1}
    assert hint["governance"].lower() == _addr(direct_owner)


def test_submit_report_validation(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    ok = dict(incident_id="incX", contract_address="0xC", network="studionet",
              tx_hashes=json.dumps(["0xt"]), wallets=json.dumps(["0xw"]),
              description="d", evidence_json=json.dumps([_ev()]))

    cases = [
        ("empty-id", {**ok, "incident_id": ""}, "incident_id must be 1..128"),
        ("long-id", {**ok, "incident_id": "x" * 129}, "incident_id must be 1..128"),
        ("empty-contract", {**ok, "contract_address": ""}, "contract_address must be 1..128"),
        ("empty-network", {**ok, "network": ""}, "network must be 1..32"),
        ("long-description", {**ok, "description": "x" * 4097}, "description must be 1..4096"),
        ("bad-tx-json", {**ok, "tx_hashes": "{}"}, "tx_hashes_json must be a JSON array"),
        ("bad-wallet-json", {**ok, "wallets": "not json"}, "wallets_json is not valid JSON"),
        ("bad-source-type", {**ok, "evidence_json": json.dumps([{**_ev(), "source_type": "RUMOR"}])},
         "bad source_type: RUMOR"),
        ("evidence-not-object", {**ok, "evidence_json": json.dumps(["plain-string"])},
         "each evidence entry must be an object"),
        ("evidence-empty-summary", {**ok, "evidence_json": json.dumps([{**_ev(), "summary": ""}])},
         "evidence summary must be 1..1024"),
    ]
    for name, kw, needle in cases:
        with direct_vm.expect_revert(needle):
            c.submit_report(kw["incident_id"], kw["contract_address"], kw["network"],
                            kw["tx_hashes"], kw["wallets"], kw["description"],
                            kw["evidence_json"])
    assert json.loads(c.get_incident_ids()) == []


def test_submit_report_caps(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    # tx hashes: 17 rejected; wallets: 17 rejected; inline evidence: 9 rejected
    with direct_vm.expect_revert("tx_hashes_json max 16 entries"):
        c.submit_report("incTx2", "0xC", "studionet",
                         json.dumps([f"0xtx{i}" for i in range(17)]),
                         json.dumps(["0xw"]), "d", json.dumps([_ev()]))
    with direct_vm.expect_revert("wallets_json max 16 entries"):
        c.submit_report("incTx3", "0xC", "studionet",
                        json.dumps(["0xtx"]),
                        json.dumps([f"0xw{i}" for i in range(17)]),
                        "d", json.dumps([_ev()]))
    with direct_vm.expect_revert("inline evidence max 8 entries"):
        c.submit_report("incTx4", "0xC", "studionet",
                        json.dumps(["0xtx"]), json.dumps(["0xw"]), "d",
                        json.dumps([_ev(f"https://s{i}.example/r") for i in range(9)]))


def test_duplicate_incident_id(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    _submit(c, "inc1")
    with direct_vm.expect_revert("duplicate incident_id: inc1"):
        _submit(c, "inc1")


# --- evidence -------------------------------------------------------------

def test_append_evidence(direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    _submit(c, "inc1")
    out = json.loads(c.append_evidence("inc1:e1", "inc1", "ONCHAIN_VERIFIED",
                                       "onchain", "0xdeadbeef", "flagged wallet"))
    assert out["evidence_id"] == "inc1:e1"
    assert out["collection_status"] == "PENDING"

    evs = json.loads(c.get_evidence_for_incident("inc1"))
    assert len(evs) == 2
    assert evs[1]["source_type"] == "ONCHAIN_VERIFIED"

    hist = json.loads(c.get_history("inc1"))
    assert hist[-1]["type"] == "EVIDENCE_APPENDED"


def test_append_evidence_guards(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    _submit(c, "inc1")
    with direct_vm.expect_revert("unknown incident: nope"):
        c.append_evidence("e:1", "nope", "EXTERNAL", "c", "r", "s")
    c.append_evidence("dup", "inc1", "EXTERNAL", "c", "r", "s")
    with direct_vm.expect_revert("duplicate evidence_id: dup"):
        c.append_evidence("dup", "inc1", "EXTERNAL", "c", "r", "s")
    with direct_vm.expect_revert("bad source_type: VIBES"):
        c.append_evidence("e:2", "inc1", "VIBES", "c", "r", "s")


def test_evidence_cap_64(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    _submit(c, "incCap", evidence=[_ev(f"https://s{i}.example/r") for i in range(8)])
    # 8 inline + 56 appended = 64 (cap), 65th rejected
    for i in range(56):
        c.append_evidence(f"cap:e{i}", "incCap", "EXTERNAL", "c",
                          f"https://x{i}.example/r", "s")
    assert len(json.loads(c.get_evidence_for_incident("incCap"))) == 64
    with direct_vm.expect_revert("evidence cap reached: 64"):
        c.append_evidence("cap:overflow", "incCap", "EXTERNAL", "c", "r", "s")


# --- lifecycle ------------------------------------------------------------

def test_start_investigation(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    _submit(c, "noev", evidence=[])
    with direct_vm.expect_revert("cannot investigate without evidence"):
        c.startInvestigation("noev")

    _submit(c, "inc1")
    assert c.startInvestigation("inc1") == "UNDER_INVESTIGATION"
    with direct_vm.expect_revert("startInvestigation requires SUBMITTED, got UNDER_INVESTIGATION"):
        c.startInvestigation("inc1")
    hist = json.loads(c.get_history("inc1"))
    assert hist[-1]["type"] == "INVESTIGATION_STARTED"


def test_sync_decision_requires_investigation(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    _submit(c, "inc1")
    with direct_vm.expect_revert("start investigation before decision"):
        c.syncDecision("inc1")


def test_sync_decision_without_assessment_is_inconclusive(direct_deploy, direct_owner):
    """Fixed rule: no assessment (seq 0) -> INCONCLUSIVE, never CONFIRMED."""
    c = _deploy(direct_deploy, direct_owner)
    _submit(c, "inc1")
    c.startInvestigation("inc1")
    assert c.syncDecision("inc1") == "INCONCLUSIVE"

    # Idempotent: no double-record of the decision.
    assert c.syncDecision("inc1") == "INCONCLUSIVE"
    hist = json.loads(c.get_history("inc1"))
    decisions = [h for h in hist if h["type"] == "DECISION_RECORDED"]
    assert len(decisions) == 1
    assert decisions[0]["assessment_seq"] == 0


def test_reassess_guards(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    _submit(c, "inc1")
    with direct_vm.expect_revert("reassess not allowed from status SUBMITTED"):
        c.reassess("inc1")

    c.startInvestigation("inc1")
    c.syncDecision("inc1")            # -> INCONCLUSIVE (no assessment)
    assert c.reassess("inc1") == "UNDER_INVESTIGATION"
    assert c.reassess("inc1") == "UNDER_INVESTIGATION"  # idempotent


def test_resolve_incident_permissionless_for_decided_non_confirmed(direct_vm, direct_deploy, direct_owner, direct_alice):
    c = _deploy(direct_deploy, direct_owner)
    _submit(c, "inc1")
    c.startInvestigation("inc1")
    c.syncDecision("inc1")            # INCONCLUSIVE

    # Permissionless keeper may resolve a non-CONFIRMED decision.
    with direct_vm.prank(direct_alice):
        assert c.resolveIncident("inc1", "FALSE_POSITIVE", "weak evidence") == "RESOLVED"
    # Idempotent
    assert c.resolveIncident("inc1", "FALSE_POSITIVE", "again") == "RESOLVED"
    hist = json.loads(c.get_history("inc1"))
    assert hist[-1]["type"] == "INCIDENT_RESOLVED"
    assert hist[-1]["actor"].lower() == _addr(direct_alice)


def test_resolve_guards(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    _submit(c, "inc1")
    with direct_vm.expect_revert("resolve requires a decided status, got SUBMITTED"):
        c.resolveIncident("inc1", "RESOLVED", "n")

    c.startInvestigation("inc1")
    with direct_vm.expect_revert("resolve requires a decided status, got UNDER_INVESTIGATION"):
        c.resolveIncident("inc1", "RESOLVED", "n")

    c.syncDecision("inc1")            # INCONCLUSIVE
    with direct_vm.expect_revert("bad outcome: NUKED"):
        c.resolveIncident("inc1", "NUKED", "n")
    with direct_vm.expect_revert("note max 1024 chars"):
        c.resolveIncident("inc1", "RESOLVED", "x" * 1025)


def test_unknown_incident_views(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    with direct_vm.expect_revert("unknown incident: ghost"):
        c.get_incident("ghost")
    with direct_vm.expect_revert("unknown incident: ghost"):
        c.get_evidence_for_incident("ghost")
    with direct_vm.expect_revert("unknown evidence: ghost-e"):
        c.get_evidence("ghost-e")
    # get_history for unknown id returns empty list (bounded default)
    assert json.loads(c.get_history("ghost")) == []
    # resolve/start on unknown id
    with direct_vm.expect_revert("unknown incident: ghost"):
        c.startInvestigation("ghost")
