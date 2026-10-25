import pytest
from app.ingestion.trade_parser import parse_trade_content
from app.models.trade import TradeRowStatus

def test_parse_narrative_trade_note():
    sample_text = """
    Route: Orvan to Midgard, wheat.
    [P1] In July 2026, the value was USD 90.0M and the volume was 250,000 tonnes.
    [P2] In August 2026, the value was USD 96.1M and the volume was 267,000 tonnes.
    [P3] In September 2026, the value was USD 54.0M and the volume was 150,000 tonnes.
    """
    table = parse_trade_content(doc_id="ORV-0009", text=sample_text)
    assert table is not None
    assert table.origin == "Orvan"
    assert table.destination == "Midgard"
    assert table.sector == "wheat"
    assert len(table.rows) == 3
    assert table.rows[0].period == "July 2026"
    assert table.rows[0].value_usd_m == 90.0
    assert table.rows[0].volume_tonnes == 250000.0
    assert table.rows[0].status == TradeRowStatus.VALID

def test_detect_repeated_rows():
    sample_text = """
    Route: Orvan to Tolan, maize.
    In July 2026, the value was USD 50.0M and the volume was 120,000 tonnes.
    In July 2026, the value was USD 50.0M and the volume was 120,000 tonnes.
    """
    table = parse_trade_content(doc_id="ORV-TEST-DUP", text=sample_text)
    assert table is not None
    assert len(table.rows) == 2
    assert table.rows[1].status == TradeRowStatus.REPEATED_ROW
    assert table.has_anomalies is True

def test_detect_inconsistent_unit():
    sample_text = """
    Route: Orvan to Midgard, wheat.
    In October 2026, the value was USD 36.0M and the volume was 100,000 bushels.
    """
    table = parse_trade_content(doc_id="ORV-TEST-UNIT", text=sample_text)
    assert table is not None
    assert table.rows[0].status == TradeRowStatus.INCONSISTENT_UNIT
    assert table.has_anomalies is True
