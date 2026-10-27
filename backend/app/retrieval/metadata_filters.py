from __future__ import annotations
from datetime import date
from typing import Any
from pydantic import BaseModel, ConfigDict, Field

class SearchFilters(BaseModel):
    model_config = ConfigDict(extra="ignore")
    pack_id: str
    as_of_date: date
    event_id: str | None = None
    country: str | None = None
    sector: str | None = None
    source_type: str | None = None
    reliability: str | None = None
    document_id: str | None = None

    def active_filter_count(self) -> int:
        count = 0
        for f in (self.country, self.sector, self.source_type, self.reliability, self.document_id):
            if f:
                count += 1
        return count
