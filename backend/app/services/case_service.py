from __future__ import annotations
from typing import Any
from app.models.case import CaseFile, CaseCreateRequest, CaseRunRequest
from app.models.ruling import JudicialReview
from app.models.briefing import ExecutiveBriefing
from app.services.container import Container

class CaseService:
    def __init__(self, container: Container):
        self.container = container

    async def create_and_run_case(self, req: CaseCreateRequest) -> dict[str, Any]:
        case_file, review, briefing = await self.container.trial_engine.execute_trial(
            question=req.question,
            pack_id=req.pack_id,
            as_of_date=req.as_of_date
        )
        return {
            "case": case_file.model_dump(mode="json"),
            "review": review.model_dump(mode="json"),
            "briefing": briefing.model_dump(mode="json") if briefing else None
        }

    async def get_case(self, case_id: str) -> CaseFile | None:
        return await self.container.case_repo.get_case(case_id)

    async def get_briefing(self, case_id: str) -> ExecutiveBriefing | None:
        return await self.container.case_repo.get_briefing(case_id)

    async def get_traces(self, case_id: str) -> list[dict[str, Any]]:
        events = await self.container.trace_repo.get_events_for_case(case_id)
        if not events:
            events = self.container.trace_sink.get_events(case_id)
        return [e.model_dump(mode="json") for e in events]
