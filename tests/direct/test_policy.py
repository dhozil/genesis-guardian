"""Area 1 — POLICY: bootstrap, governance auth, strict validation, versioning.

Every security-relevant policy operation is exercised: only-governance
writes, fail-closed structural validation (including Tier-1 key smuggling),
version history and rollback.
"""

import json
import pytest

CONTRACT = "contracts/GenesisGuardian.py"


def _addr(a) -> str:
    """Fixture addresses are raw 20-byte values; contract wants 0x-hex."""
    if isinstance(a, (bytes, bytearray)):
        return "0x" + bytes(a).hex()
    return str(a)


def _base() -> dict:
    return {
        "min_confidence": "MEDIUM",
        "min_corroborating_sources": 2,
        "allowed_threat_levels": ["HIGH", "CRITICAL"],
        "allowed_actions": ["PAUSE_TARGET"],
        "cooldown_seconds": 3600,
    }


BOOTSTRAP = json.dumps(_base())

ALT = json.dumps(
    {
        "min_confidence": "HIGH",
        "min_corroborating_sources": 3,
        "allowed_threat_levels": ["CRITICAL"],
        "allowed_actions": ["PAUSE_TARGET", "INVESTIGATE"],
        "cooldown_seconds": 60,
    }
)


def _deploy(direct_deploy, direct_owner):
    return direct_deploy(CONTRACT, _addr(direct_owner), BOOTSTRAP)


def test_bootstrap_sets_version_policy_and_state(direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    assert int(c.get_version()) == 1
    assert json.loads(c.get_policy()) == json.loads(BOOTSTRAP)

    state = json.loads(c.get_state())
    assert state["state"] == "NORMAL"
    assert state["paused"] is False
    assert state["protocol_locked"] is False
    assert state["policy_version"] == 1
    assert state["governance"].lower() == _addr(direct_owner)
    assert state["active_incident"] == ""
    assert state["last_emergency_unix"] == 0

    # Area 4 capability flag is on from genesis.
    assert c.pause_supported() is True
    assert c.is_paused() is False


def test_constructor_rejects_bad_bootstrap(direct_deploy, direct_owner):
    with pytest.raises(Exception):
        direct_deploy(CONTRACT, _addr(direct_owner), "definitely not json")


def test_set_policy_requires_governance(direct_vm, direct_deploy, direct_owner, direct_alice):
    c = _deploy(direct_deploy, direct_owner)
    with direct_vm.expect_revert("only governance may set policy"):
        with direct_vm.prank(direct_alice):
            c.set_policy(ALT)


def test_rollback_requires_governance(direct_vm, direct_deploy, direct_owner, direct_alice):
    c = _deploy(direct_deploy, direct_owner)
    with direct_vm.expect_revert("only governance may rollback policy"):
        with direct_vm.prank(direct_alice):
            c.rollback(1)


def test_set_policy_by_governance_bumps_version(direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    c.set_policy(ALT)
    assert int(c.get_version()) == 2
    assert json.loads(c.get_policy()) == json.loads(ALT)

    # History preserved: v1 still readable.
    assert json.loads(c.get_policy_at(1)) == json.loads(BOOTSTRAP)

    rec = json.loads(c.get_policy_record(2))
    assert rec["version"] == 2
    assert rec["activated_by"].lower() == _addr(direct_owner)
    assert json.loads(rec["payload"]) == json.loads(ALT)


def test_rollback_restores_previous_payload(direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    c.set_policy(ALT)          # v2
    c.rollback(1)              # v3 <- payload of v1
    assert int(c.get_version()) == 3
    assert json.loads(c.get_policy()) == json.loads(BOOTSTRAP)
    assert json.loads(c.get_policy_at(3)) == json.loads(BOOTSTRAP)
    # The rolled-back-over policy is still queryable at its version.
    assert json.loads(c.get_policy_at(2)) == json.loads(ALT)


def test_unknown_policy_version(direct_vm, direct_deploy, direct_owner):
    c = _deploy(direct_deploy, direct_owner)
    with direct_vm.expect_revert("unknown policy version"):
        c.get_policy_at(99)


def _with_extra(key: str, value) -> str:
    d = _base()
    d[key] = value
    return json.dumps(d)


# --- fail-closed validation matrix ---------------------------------------

BAD_POLICIES = [
    ("not-json", "definitely not json", "policy is not valid JSON"),
    ("not-object", "[1, 2, 3]", "policy must be a JSON object"),
    ("missing-keys", json.dumps({"min_confidence": "MEDIUM"}), "policy keys invalid"),
    # Tier-1 recovery flag smuggled into Tier-2 policy must be rejected.
    (
        "tier1-smuggle",
        _with_extra("recovery_requires_governance", False),
        "extra=['recovery_requires_governance']",
    ),
    ("bad-min-confidence", json.dumps({**_base(), "min_confidence": "CRITICAL"}), "min_confidence invalid"),
    ("sources-zero", json.dumps({**_base(), "min_corroborating_sources": 0}), "out of range 1..10"),
    ("sources-bool", json.dumps({**_base(), "min_corroborating_sources": True}), "must be int"),
    ("sources-11", json.dumps({**_base(), "min_corroborating_sources": 11}), "out of range 1..10"),
    ("threat-enum", json.dumps({**_base(), "allowed_threat_levels": ["EXTINCTION"]}), "invalid entry: EXTINCTION"),
    ("threat-empty", json.dumps({**_base(), "allowed_threat_levels": []}), "non-empty list"),
    ("threat-dup", json.dumps({**_base(), "allowed_threat_levels": ["HIGH", "HIGH"]}), "duplicates"),
    ("action-enum", json.dumps({**_base(), "allowed_actions": ["SELF_DESTRUCT"]}), "invalid entry: SELF_DESTRUCT"),
    ("cooldown-neg", json.dumps({**_base(), "cooldown_seconds": -1}), "out of range 0..604800"),
    ("cooldown-big", json.dumps({**_base(), "cooldown_seconds": 604801}), "out of range 0..604800"),
    ("cooldown-bool", json.dumps({**_base(), "cooldown_seconds": False}), "must be int"),
]


@pytest.mark.parametrize("name,payload,needle", BAD_POLICIES, ids=[b[0] for b in BAD_POLICIES])
def test_set_policy_rejects_invalid(direct_vm, direct_deploy, direct_owner, name, payload, needle):
    c = _deploy(direct_deploy, direct_owner)
    with direct_vm.expect_revert(needle):
        c.set_policy(payload)
    # Fail closed: version unchanged, active payload untouched.
    assert int(c.get_version()) == 1
    assert json.loads(c.get_policy()) == json.loads(BOOTSTRAP)
