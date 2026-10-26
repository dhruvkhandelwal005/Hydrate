from __future__ import annotations
from typing import Any
from app.models.exposure import SensitivityCard, CoverageMeter

class SensitivityAnalyzer:
    def generate_sensitivity_cards(
        self,
        country: str,
        sector: str,
        net_exposure: float,
        substitute_offset: float,
        rail_capacity_offset: float
    ) -> list[SensitivityCard]:
        cards: list[SensitivityCard] = []

        # Card 1: Rail capacity bound
        cards.append(SensitivityCard(
            parameter="Ravik Rail Link Capacity Limit",
            shift_description="If rail capacity is constrained by bottleneck to 50% of observed throughput",
            impact_usd_m=round(net_exposure * 0.12, 2),
            narrative=f"If rail links through Ravik face capacity bottlenecks, commercial exposure for {country} {sector} increases by ~12%."
        ))

        # Card 2: Alternate supplier volume (Vanir)
        cards.append(SensitivityCard(
            parameter="Alternative Supplier (Vanir) Volume",
            shift_description="If substitute shipments reach the upper bound (+25% volume)",
            impact_usd_m=-round(max(2.0, substitute_offset * 0.25), 2),
            narrative=f"If alternative exporters sustain higher substitution volumes, net exposure decreases by ~{round(max(2.0, substitute_offset * 0.25), 1)}M USD."
        ))

        # Card 3: Port recovery index
        cards.append(SensitivityCard(
            parameter="Orvan Port Berth Recovery",
            shift_description="If dock strike eases and berth loadings rise from 32 to 50 on the index",
            impact_usd_m=-round(net_exposure * 0.28, 2),
            narrative=f"A partial sea loading recovery to index 50 reduces direct import losses by ~28%."
        ))

        return cards

    def calculate_coverage(
        self,
        has_baseline: bool,
        has_disruption: bool,
        has_substitution: bool,
        has_current_admissible: bool,
        has_thor: bool,
        has_loki: bool,
        has_cross: bool,
        has_odin: bool
    ) -> CoverageMeter:
        checks = [
            has_baseline, has_disruption, has_substitution, has_current_admissible,
            has_thor, has_loki, has_cross, has_odin
        ]
        score = sum(1 for c in checks if c) / len(checks)
        return CoverageMeter(
            has_baseline_evidence=has_baseline,
            has_disruption_evidence=has_disruption,
            has_substitution_evidence=has_substitution,
            has_admissible_current_evidence=has_current_admissible,
            has_thor_estimate=has_thor,
            has_loki_estimate=has_loki,
            has_cross_examination=has_cross,
            has_odin_ruling=has_odin,
            coverage_score=round(score, 2)
        )
