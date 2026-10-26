from __future__ import annotations
import re
from typing import Any
from app.models.trade import TradeRow, TradeTable, TradeRowStatus

ROUTE_RE = re.compile(r"Route\s*:\s*([A-Za-z\s]+)\s+to\s+([A-Za-z\s]+),\s*([A-Za-z\s]+)", re.I)
MONTH_VALUE_VOL_RE = re.compile(
    r"In\s+([A-Za-z]+)\s+(\d{4}),\s+the\s+value\s+was\s+USD\s*([0-9.,]+)M?\s+and\s+the\s+volume\s+was\s*([0-9.,]+)\s*([A-Za-z]+)",
    re.I
)
TABLE_PIPE_RE = re.compile(r"\|\s*([A-Za-z]+)\s+(\d{4})\s*\|\s*([0-9.,]+)\s*\|\s*([0-9.,]+)\s*([A-Za-z]*)\s*\|")

MONTHS_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
}

def parse_trade_content(doc_id: str, text: str, default_origin: str = "", default_dest: str = "", default_sector: str = "") -> TradeTable | None:
    """
    Parses trade notes and tables into structured TradeRow models.
    Identifies origin, destination, sector, monthly values and volumes,
    and flags anomalies (malformed numbers, missing values, duplicates, truncation).
    """
    origin = default_origin
    dest = default_dest
    sector = default_sector

    # Check for route line
    m_route = ROUTE_RE.search(text)
    if m_route:
        origin = m_route.group(1).strip()
        dest = m_route.group(2).strip()
        sector = m_route.group(3).strip()

    rows: list[TradeRow] = []
    seen_periods: set[str] = set()
    anomalies: list[str] = []
    row_idx = 1

    lines = text.split("\n")
    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            continue

        # Pattern 1: Narrative trade note: "In July 2026, the value was USD 90.0M and the volume was 250,000 tonnes."
        m_narrative = MONTH_VALUE_VOL_RE.search(line_clean)
        if m_narrative:
            month_str = m_narrative.group(1).strip()
            year_str = m_narrative.group(2).strip()
            val_str = m_narrative.group(3).strip().replace(",", "")
            vol_str = m_narrative.group(4).strip().replace(",", "")
            vol_unit = m_narrative.group(5).strip()

            period = f"{month_str} {year_str}"
            m_num = MONTHS_MAP.get(month_str.lower(), 1)
            year_num = int(year_str)

            status = TradeRowStatus.VALID
            err = None
            val_float = None
            vol_float = None

            try:
                val_float = float(val_str)
            except ValueError:
                status = TradeRowStatus.MALFORMED_NUMBER
                err = f"Malformed value: {val_str}"
                anomalies.append(err)

            try:
                vol_float = float(vol_str)
            except ValueError:
                status = TradeRowStatus.MALFORMED_NUMBER
                err = f"Malformed volume: {vol_str}"
                anomalies.append(err)

            if period in seen_periods:
                status = TradeRowStatus.REPEATED_ROW
                err = f"Repeated row period: {period}"
                anomalies.append(err)
            else:
                seen_periods.add(period)

            # Inconsistent unit check
            if vol_unit.lower() not in ("tonnes", "tons", "mt"):
                status = TradeRowStatus.INCONSISTENT_UNIT
                err = f"Inconsistent volume unit: {vol_unit}"
                anomalies.append(err)

            row = TradeRow(
                row_id=f"R{row_idx}",
                table_id=doc_id,
                source_id=doc_id,
                origin=origin,
                destination=dest,
                sector=sector,
                period=period,
                year=year_num,
                month=m_num,
                value_usd_m=val_float,
                volume_tonnes=vol_float,
                raw_value=val_str,
                raw_volume=vol_str,
                unit="USD_M",
                volume_unit=vol_unit,
                status=status,
                validation_error=err,
                raw_line=line_clean
            )
            rows.append(row)
            row_idx += 1
            continue

        # Pattern 2: Pipe separated table row
        m_pipe = TABLE_PIPE_RE.search(line_clean)
        if m_pipe:
            month_str = m_pipe.group(1).strip()
            year_str = m_pipe.group(2).strip()
            val_str = m_pipe.group(3).strip().replace(",", "")
            vol_str = m_pipe.group(4).strip().replace(",", "")
            vol_unit = m_pipe.group(5).strip() or "tonnes"

            period = f"{month_str} {year_str}"
            m_num = MONTHS_MAP.get(month_str.lower(), 1)
            year_num = int(year_str)

            status = TradeRowStatus.VALID
            err = None
            try:
                val_float = float(val_str)
                vol_float = float(vol_str)
            except ValueError:
                status = TradeRowStatus.MALFORMED_NUMBER
                err = "Malformed pipe table numbers"
                anomalies.append(err)
                val_float = None
                vol_float = None

            if period in seen_periods:
                status = TradeRowStatus.REPEATED_ROW
                anomalies.append(f"Repeated row: {period}")
            else:
                seen_periods.add(period)

            row = TradeRow(
                row_id=f"R{row_idx}",
                table_id=doc_id,
                source_id=doc_id,
                origin=origin,
                destination=dest,
                sector=sector,
                period=period,
                year=year_num,
                month=m_num,
                value_usd_m=val_float,
                volume_tonnes=vol_float,
                raw_value=val_str,
                raw_volume=vol_str,
                status=status,
                validation_error=err,
                raw_line=line_clean
            )
            rows.append(row)
            row_idx += 1

    if not rows:
        return None

    return TradeTable(
        table_id=doc_id,
        source_id=doc_id,
        title=f"Trade data: {origin} to {dest} ({sector})",
        origin=origin,
        destination=dest,
        sector=sector,
        rows=rows,
        has_anomalies=bool(anomalies),
        anomalies=anomalies
    )
