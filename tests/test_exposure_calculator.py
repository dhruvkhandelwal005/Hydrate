import pytest
from app.exposure.calculator import CommercialExposureEngine
from app.models.trade import TradeRow, TradeRowStatus

def test_commercial_exposure_calculation():
    engine = CommercialExposureEngine()

    # Pre-event rows (July & August 2026: avg = 93.05M USD)
    rows = [
        TradeRow(
            row_id="R1", table_id="ORV-0009", source_id="ORV-0009",
            origin="Orvan", destination="Midgard", sector="Wheat",
            period="July 2026", year=2026, month=7, value_usd_m=90.0, volume_tonnes=250000.0,
            status=TradeRowStatus.VALID
        ),
        TradeRow(
            row_id="R2", table_id="ORV-0009", source_id="ORV-0009",
            origin="Orvan", destination="Midgard", sector="Wheat",
            period="August 2026", year=2026, month=8, value_usd_m=96.1, volume_tonnes=267000.0,
            status=TradeRowStatus.VALID
        ),
        # Post-event rows (Oct, Nov, Dec 2026: avg = 33.0M USD)
        TradeRow(
            row_id="R3", table_id="ORV-0009", source_id="ORV-0009",
            origin="Orvan", destination="Midgard", sector="Wheat",
            period="October 2026", year=2026, month=10, value_usd_m=36.0, volume_tonnes=100000.0,
            status=TradeRowStatus.VALID
        ),
        TradeRow(
            row_id="R4", table_id="ORV-0009", source_id="ORV-0009",
            origin="Orvan", destination="Midgard", sector="Wheat",
            period="November 2026", year=2026, month=11, value_usd_m=32.4, volume_tonnes=90000.0,
            status=TradeRowStatus.VALID
        ),
        TradeRow(
            row_id="R5", table_id="ORV-0009", source_id="ORV-0009",
            origin="Orvan", destination="Midgard", sector="Wheat",
            period="December 2026", year=2026, month=12, value_usd_m=30.6, volume_tonnes=85000.0,
            status=TradeRowStatus.VALID
        ),
        # Substitute supply from Vanir to Midgard
        TradeRow(
            row_id="R6", table_id="ORV-0027", source_id="ORV-0027",
            origin="Vanir", destination="Midgard", sector="Wheat",
            period="October 2026", year=2026, month=10, value_usd_m=38.0, volume_tonnes=102000.0,
            status=TradeRowStatus.VALID
        ),
    ]

    exp = engine.calculate_country_sector("Midgard", "Wheat", rows)

    assert exp.country == "Midgard"
    assert exp.sector == "Wheat"
    assert exp.baseline_direct_value == 93.05
    assert exp.observed_post_event_value == 33.0
    assert exp.gross_direct_loss == round(93.05 - 33.0, 2)
    assert exp.odin_final_range.low_usd_m is not None
    assert exp.odin_final_range.high_usd_m is not None
    assert exp.odin_final_range.low_usd_m <= exp.odin_final_range.high_usd_m
    assert len(exp.sensitivity_cards) == 3
    assert exp.coverage.coverage_score > 0.5
