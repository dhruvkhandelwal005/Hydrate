from __future__ import annotations
from typing import Any
from google.cloud import firestore
from app.models.trace import TraceEvent
from app.observability.tracing import TraceSink
from app.repositories.firebase import fs_retry

class FirestoreTraceRepository(TraceSink):
    def __init__(self, db: firestore.Client):
        self.db = db

    async def emit(self, event: TraceEvent) -> None:
        ref = (
            self.db.collection("cases").document(event.case_id)
            .collection("runs").document(event.run_id)
            .collection("events").document(event.trace_id)
        )
        data = event.model_dump(mode="json")
        data["timestamp"] = event.timestamp
        await fs_retry(lambda: ref.set(data))

    async def get_events_for_case(self, case_id: str) -> list[TraceEvent]:
        # Stream all events across runs for this case
        runs = await fs_retry(lambda: list(self.db.collection("cases").document(case_id).collection("runs").stream()))
        all_events: list[TraceEvent] = []
        for run_doc in runs:
            event_snaps = await fs_retry(lambda r=run_doc: list(r.reference.collection("events").order_by("timestamp").stream()))
            for s in event_snaps:
                all_events.append(TraceEvent.model_validate(s.to_dict()))
        all_events.sort(key=lambda x: x.timestamp)
        return all_events
