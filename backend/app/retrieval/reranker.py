from __future__ import annotations
from typing import Any
from app.models.document import ReliabilityTier

RELIABILITY_WEIGHTS = {
    ReliabilityTier.TIER_1: 1.0,
    ReliabilityTier.TIER_2: 0.82,
    ReliabilityTier.TIER_3: 0.58,
    ReliabilityTier.TIER_4: 0.25,
    ReliabilityTier.UNKNOWN: 0.35,
}

def get_reliability_weight(tier: ReliabilityTier | str) -> float:
    if isinstance(tier, str):
        t_clean = tier.strip().upper().replace(" ", "_").replace("TIER", "TIER_").replace("TIER__", "TIER_")
        if t_clean in ("1", "TIER_1"):
            tier = ReliabilityTier.TIER_1
        elif t_clean in ("2", "TIER_2"):
            tier = ReliabilityTier.TIER_2
        elif t_clean in ("3", "TIER_3"):
            tier = ReliabilityTier.TIER_3
        elif t_clean in ("4", "TIER_4"):
            tier = ReliabilityTier.TIER_4
        else:
            tier = ReliabilityTier.UNKNOWN
    return RELIABILITY_WEIGHTS.get(tier, 0.35)

def score_candidate(
    semantic_score: float,
    lexical_score: float,
    reliability_tier: ReliabilityTier,
    exact_entity_matches: int = 0,
    is_corrected: bool = False
) -> float:
    rel_weight = get_reliability_weight(reliability_tier)
    exact_bonus = min(0.24, exact_entity_matches * 0.08)

    # Base weighted sum
    score = 0.42 * semantic_score + 0.36 * lexical_score + 0.14 * rel_weight + exact_bonus

    # If this report was formally corrected/retracted, downgrade its evidentiary weight
    if is_corrected:
        score *= 0.4

    return score
