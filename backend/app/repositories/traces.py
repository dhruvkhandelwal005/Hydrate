from __future__ import annotations
from typing import Any
from google.cloud import firestore
from app.models.trace import TraceEvent
from app.observability.tracing import TraceSink
from app.repositories.firebase import fs_retry

class FirestoreTraceRepository(TraceSink):
    def __init__(self, db: firestore.Client | None = None):
        self.db = db
        self._traces: dict[str, list[TraceEvent]] = {}

    async def emit(self, event: TraceEvent) -> None:
        if event.case_id not in self._traces:
            self._traces[event.case_id] = []
        self._traces[event.case_id].append(event)

        if self.db is not None:
            ref = (
                self.db.collection("cases").document(event.case_id)
                .collection("runs").document(event.run_id)
                .collection("events").document(event.trace_id)
            )
            data = event.model_dump(mode="json")
            data["timestamp"] = event.timestamp
            await fs_retry(lambda: ref.set(data))

    async def get_events_for_case(self, case_id: str) -> list[TraceEvent]:
        if case_id in self._traces and self._traces[case_id]:
            return sorted(self._traces[case_id], key=lambda x: x.timestamp)

        if self.db is not None:
            runs = await fs_retry(lambda: list(self.db.collection("cases").document(case_id).collection("runs").stream()))
            if runs:
                all_events: list[TraceEvent] = []
                for run_doc in runs:
                    event_snaps = await fs_retry(lambda r=run_doc: list(r.reference.collection("events").order_by("timestamp").stream()))
                    if event_snaps:
                        for s in event_snaps:
                            all_events.append(TraceEvent.model_validate(s.to_dict()))
                all_events.sort(key=lambda x: x.timestamp)
                self._traces[case_id] = all_events
                return all_events
        return self._traces.get(case_id, [])

    async def delete_events_for_case(self, case_id: str) -> bool:
        self._traces.pop(case_id, None)
        if self.db is not None:
            runs = await fs_retry(lambda: list(self.db.collection("cases").document(case_id).collection("runs").stream()))
            if runs:
                for run_doc in runs:
                    event_snaps = await fs_retry(lambda r=run_doc: list(r.reference.collection("events").stream()))
                    for s in event_snaps:
                        await fs_retry(lambda ref=s.reference: ref.delete())
        return True
