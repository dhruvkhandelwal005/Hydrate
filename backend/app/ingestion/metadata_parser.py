from __future__ import annotations
import re
from datetime import date
from typing import Any
from app.models.document import ReliabilityTier
from app.utils.dates import parse_iso_date

HEADER_FIELD_RE = re.compile(r"^([A-Z_]+)\s*:\s*(.+)$")

def parse_metadata_header(text: str, manifest_entry: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Parses key-value headers formatted as KEY: VALUE before '---'
    and reconciles with manifest metadata.
    """
    header_data: dict[str, Any] = {}
    lines = text.split("\n")
    for line in lines:
        line = line.strip()
        if line == "---":
            break
        m = HEADER_FIELD_RE.match(line)
        if m:
            k, v = m.group(1).upper(), m.group(2).strip()
            header_data[k] = v

    # Fallback / merge with manifest
    if manifest_entry:
        for k, v in manifest_entry.items():
            if k.upper() not in header_data or not header_data[k.upper()]:
                header_data[k.upper()] = v

    # Normalize fields
    doc_id = header_data.get("DOC_ID", "")
    event_id = header_data.get("EVENT_ID", "NONE")
    title = header_data.get("TITLE", "")
    source_name = header_data.get("SOURCE_NAME", "")
    source_type = header_data.get("SOURCE_TYPE", "")
    raw_rel = str(header_data.get("RELIABILITY", "UNKNOWN"))
    rel = parse_reliability_tier(raw_rel)
    pub_date = parse_iso_date(header_data.get("PUB_DATE")) or date(2026, 1, 1)
    pub_time = header_data.get("PUB_TIME")
    country = header_data.get("COUNTRY")
    sector = header_data.get("SECTOR")
    language = header_data.get("LANGUAGE", "en")
    fmt = header_data.get("FORMAT", "TXT")

    return {
        "doc_id": doc_id,
        "event_id": event_id,
        "title": title,
        "source_name": source_name,
        "source_type": source_type,
        "reliability": rel,
        "pub_date": pub_date,
        "pub_time": pub_time,
        "country": country,
        "sector": sector,
        "language": language,
        "format": fmt,
    }

def parse_reliability_tier(raw: str) -> ReliabilityTier:
    raw = raw.strip().upper().replace(" ", "_")
    if raw in ("1", "TIER_1", "TIER1"):
        return ReliabilityTier.TIER_1
    if raw in ("2", "TIER_2", "TIER2"):
        return ReliabilityTier.TIER_2
    if raw in ("3", "TIER_3", "TIER3"):
        return ReliabilityTier.TIER_3
    if raw in ("4", "TIER_4", "TIER4"):
        return ReliabilityTier.TIER_4
    return ReliabilityTier.UNKNOWN
