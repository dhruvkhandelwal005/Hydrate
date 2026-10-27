from __future__ import annotations
from datetime import date, datetime, timezone
from typing import Any

def parse_iso_date(val: Any) -> date | None:
    if val is None:
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    s = str(val).strip()
    if not s:
        return None
    # Support YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        # Fallback formats
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"):
            try:
                return datetime.strptime(s[:10], fmt).date()
            except Exception:
                continue
    return None

def is_admissible(pub_date: date | None, as_of_date: date) -> bool:
    if pub_date is None:
        return False
    return pub_date <= as_of_date

def utc_now() -> datetime:
    return datetime.now(timezone.utc)
