from __future__ import annotations
from datetime import datetime, timezone
from typing import Any
from google.cloud import firestore
from app.models.case import CaseFile
from app.models.claim import Claim
from app.models.challenge import Challenge, CrossExaminationReport, DefenceReport
from app.models.ruling import ClaimRuling, JudicialReview
from app.models.briefing import ExecutiveBriefing
from app.repositories.firebase import fs_retry

class FirestoreCaseRepository:
    def __init__(self, db: firestore.Client | None = None):
        self.db = db
        self._cases: dict[str, CaseFile] = {}
        self._claims: dict[str, dict[str, Claim]] = {}
        self._challenges: dict[str, dict[str, Challenge]] = {}
        self._rulings: dict[str, dict[str, ClaimRuling]] = {}
        self._briefings: dict[str, list[ExecutiveBriefing]] = {}
        self._case_phases: dict[str, str] = {}
        self._case_statuses: dict[str, str] = {}

    async def save_case(self, case: CaseFile) -> None:
        self._cases[case.case_id] = case
        if self.db is not None:
            data = case.model_dump(mode="json")
            data["created_at"] = case.created_at
            await fs_retry(lambda: self.db.collection("cases").document(case.case_id).set(data, merge=True))

    async def get_case(self, case_id: str) -> CaseFile | None:
        if case_id in self._cases:
            return self._cases[case_id]
        if self.db is not None:
            snap = await fs_retry(lambda: self.db.collection("cases").document(case_id).get())
            if snap and snap.exists:
                case = CaseFile.model_validate(snap.to_dict())
                self._cases[case_id] = case
                return case
        return None

    async def get_all_cases(self) -> list[CaseFile]:
        cases = list(self._cases.values())
        cases.sort(key=lambda c: getattr(c, "created_at", datetime.min), reverse=True)
        return cases

    async def save_claim(self, case_id: str, claim: Claim) -> None:
        if case_id not in self._claims:
            self._claims[case_id] = {}
        self._claims[case_id][claim.claim_id] = claim

        if self.db is not None:
            data = claim.model_dump(mode="json")
            await fs_retry(lambda: self.db.collection("cases").document(case_id).collection("claims").document(claim.claim_id).set(data, merge=True))

    async def get_claims(self, case_id: str) -> list[Claim]:
        if case_id in self._claims:
            return list(self._claims[case_id].values())
        if self.db is not None:
            snaps = await fs_retry(lambda: list(self.db.collection("cases").document(case_id).collection("claims").stream()))
            if snaps:
                claims = [Claim.model_validate(s.to_dict()) for s in snaps]
                self._claims[case_id] = {c.claim_id: c for c in claims}
                return claims
        return []

    async def save_challenge(self, case_id: str, challenge: Challenge) -> None:
        if case_id not in self._challenges:
            self._challenges[case_id] = {}
        self._challenges[case_id][challenge.challenge_id] = challenge

        if self.db is not None:
            data = challenge.model_dump(mode="json")
            await fs_retry(lambda: self.db.collection("cases").document(case_id).collection("challenges").document(challenge.challenge_id).set(data, merge=True))

    async def get_challenges(self, case_id: str) -> list[Challenge]:
        if case_id in self._challenges:
            return list(self._challenges[case_id].values())
        if self.db is not None:
            snaps = await fs_retry(lambda: list(self.db.collection("cases").document(case_id).collection("challenges").stream()))
            if snaps:
                challs = [Challenge.model_validate(s.to_dict()) for s in snaps]
                self._challenges[case_id] = {ch.challenge_id: ch for ch in challs}
                return challs
        return []

    async def save_ruling(self, case_id: str, ruling: ClaimRuling) -> None:
        if case_id not in self._rulings:
            self._rulings[case_id] = {}
        self._rulings[case_id][ruling.claim_id] = ruling

        if self.db is not None:
            data = ruling.model_dump(mode="json")
            await fs_retry(lambda: self.db.collection("cases").document(case_id).collection("rulings").document(ruling.claim_id).set(data, merge=True))

    async def get_rulings(self, case_id: str) -> list[ClaimRuling]:
        if case_id in self._rulings:
            return list(self._rulings[case_id].values())
        if self.db is not None:
            snaps = await fs_retry(lambda: list(self.db.collection("cases").document(case_id).collection("rulings").stream()))
            if snaps:
                rulings = [ClaimRuling.model_validate(s.to_dict()) for s in snaps]
                self._rulings[case_id] = {r.claim_id: r for r in rulings}
                return rulings
        return []

    async def save_briefing(self, case_id: str, briefing: ExecutiveBriefing) -> None:
        if case_id not in self._briefings:
            self._briefings[case_id] = []
        self._briefings[case_id].insert(0, briefing)

        if self.db is not None:
            data = briefing.model_dump(mode="json")
            data["created_at"] = briefing.created_at
            await fs_retry(lambda: self.db.collection("cases").document(case_id).collection("briefings").document(briefing.briefing_id).set(data))

    async def get_briefing(self, case_id: str) -> ExecutiveBriefing | None:
        if case_id in self._briefings and self._briefings[case_id]:
            return self._briefings[case_id][0]
        if self.db is not None:
            snaps = await fs_retry(lambda: list(
                self.db.collection("cases").document(case_id).collection("briefings")
                .order_by("created_at", direction=firestore.Query.DESCENDING).limit(1).stream()
            ))
            if snaps:
                briefing = ExecutiveBriefing.model_validate(snaps[0].to_dict())
                if case_id not in self._briefings:
                    self._briefings[case_id] = []
                self._briefings[case_id].insert(0, briefing)
                return briefing
        return None

    def set_phase(self, case_id: str, phase: str) -> None:
        self._case_phases[case_id] = phase

    def get_phase(self, case_id: str) -> str:
        return self._case_phases.get(case_id, "idle")

    def set_status(self, case_id: str, status: str) -> None:
        self._case_statuses[case_id] = status

    def get_status(self, case_id: str) -> str:
        return self._case_statuses.get(case_id, "IN_PROGRESS")

    async def delete_case(self, case_id: str) -> bool:
        self._cases.pop(case_id, None)
        self._claims.pop(case_id, None)
        self._challenges.pop(case_id, None)
        self._rulings.pop(case_id, None)
        self._briefings.pop(case_id, None)
        self._case_phases.pop(case_id, None)
        self._case_statuses.pop(case_id, None)

        if self.db is not None:
            await fs_retry(lambda: self.db.collection("cases").document(case_id).delete())
        return True
