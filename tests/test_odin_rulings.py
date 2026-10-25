import pytest
from app.models.ruling import ClaimRuling, RulingVerdict, SufficiencyVerdict
from app.models.claim import Claim, ClaimNature, ClaimStatus

def test_claim_ruling_verdicts():
    r1 = ClaimRuling(
        ruling_id="RUL-1",
        claim_id="THOR-C1",
        country="Midgard",
        sector="Wheat",
        advocate="thor",
        original_claim="Orvan sea shipments dropped 62% in October 2026",
        nature=ClaimNature.SOURCED_FACT,
        verdict=RulingVerdict.ESTABLISHED,
        justification="Corvan Grain filing ORV-0021 directly corroborates 62% drop",
        citations_valid=True
    )
    assert r1.verdict == RulingVerdict.ESTABLISHED
    assert r1.nature == ClaimNature.SOURCED_FACT

def test_unsupported_claim_rejection():
    r2 = ClaimRuling(
        ruling_id="RUL-2",
        claim_id="THOR-C2",
        country="Midgard",
        sector="Wheat",
        advocate="thor",
        original_claim="Famine will empty supermarket shelves within days",
        nature=ClaimNature.INFERENCE,
        verdict=RulingVerdict.REJECTED,
        justification="Sourced from Daily Roar (Tier 4 tabloid) without official corroboration; rejected per Section 26",
        citations_valid=False
    )
    assert r2.verdict == RulingVerdict.REJECTED
