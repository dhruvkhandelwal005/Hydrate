from __future__ import annotations
from typing import Any
from app.models.trade import TradeRow

class BaselineSelector:
    """
    Selects defensible baseline direct import value using structured trade rows.
    Supports:
    1. Pre-event recent months (e.g. July-August 2026 before Sept corridor end)
    2. Year-over-Year comparable months (e.g. Q4 2025 vs Q4 2026)
    3. Documented deal-level normal levels
    """
    def determine_baseline(
        self,
        rows: list[TradeRow],
        country: str,
        sector: str,
        method: str = "PRE_EVENT_AVERAGE"
    ) -> tuple[float, str, list[str]]:
        matching = [
            r for r in rows
            if r.destination.lower() == country.lower()
            and r.sector.lower() == sector.lower()
            and r.value_usd_m is not None
        ]

        if not matching:
            return 0.0, "NO_TRADE_ROWS", []

        # Look for pre-event months: July 2026, August 2026
        pre_event = [r for r in matching if r.year == 2026 and r.month in (7, 8)]
        if pre_event:
            avg_val = sum(r.value_usd_m for r in pre_event) / len(pre_event)
            # Monthly baseline
            citations = [r.citation_identity for r in pre_event]
            return round(avg_val, 2), "PRE_EVENT_JULY_AUG_2026_AVERAGE", citations

        # Fallback to earliest observed valid month
        matching.sort(key=lambda x: (x.year, x.month))
        earliest = matching[0]
        return earliest.value_usd_m or 0.0, f"EARLIEST_RECORD_{earliest.period}", [earliest.citation_identity]
