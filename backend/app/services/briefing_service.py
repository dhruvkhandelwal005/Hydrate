from __future__ import annotations
from typing import Any
from app.models.briefing import ExecutiveBriefing
from app.services.container import Container

class BriefingService:
    def __init__(self, container: Container):
        self.container = container

    async def get_briefing(self, case_id: str) -> ExecutiveBriefing | None:
        return await self.container.case_repo.get_briefing(case_id)
