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
    def __init__(self, db: firestore.Client):
        self.db = db

    async def save_case(self, case: CaseFile) -> None:
        data = case.model_dump(mode="json")
        data["created_at"] = case.created_at
        await fs_retry(lambda: self.db.collection("cases").document(case.case_id).set(data, merge=True))

    async def get_case(self, case_id: str) -> CaseFile | None:
        snap = await fs_retry(lambda: self.db.collection("cases").document(case_id).get())
        if not snap.exists:
            return None
        return CaseFile.model_validate(snap.to_dict())

    async def save_claim(self, case_id: str, claim: Claim) -> None:
        data = claim.model_dump(mode="json")
        await fs_retry(lambda: self.db.collection("cases").document(case_id).collection("claims").document(claim.claim_id).set(data, merge=True))

    async def get_claims(self, case_id: str) -> list[Claim]:
        snaps = await fs_retry(lambda: list(self.db.collection("cases").document(case_id).collection("claims").stream()))
        return [Claim.model_validate(s.to_dict()) for s in snaps]

    async def save_challenge(self, case_id: str, challenge: Challenge) -> None:
        data = challenge.model_dump(mode="json")
        await fs_retry(lambda: self.db.collection("cases").document(case_id).collection("challenges").document(challenge.challenge_id).set(data, merge=True))

    async def get_challenges(self, case_id: str) -> list[Challenge]:
        snaps = await fs_retry(lambda: list(self.db.collection("cases").document(case_id).collection("challenges").stream()))
        return [Challenge.model_validate(s.to_dict()) for s in snaps]

    async def save_ruling(self, case_id: str, ruling: ClaimRuling) -> None:
        data = ruling.model_dump(mode="json")
        await fs_retry(lambda: self.db.collection("cases").document(case_id).collection("rulings").document(ruling.claim_id).set(data, merge=True))

    async def get_rulings(self, case_id: str) -> list[ClaimRuling]:
        snaps = await fs_retry(lambda: list(self.db.collection("cases").document(case_id).collection("rulings").stream()))
        return [ClaimRuling.model_validate(s.to_dict()) for s in snaps]

    async def save_briefing(self, case_id: str, briefing: ExecutiveBriefing) -> None:
        data = briefing.model_dump(mode="json")
        data["created_at"] = briefing.created_at
        await fs_retry(lambda: self.db.collection("cases").document(case_id).collection("briefings").document(briefing.briefing_id).set(data))

    async def get_briefing(self, case_id: str) -> ExecutiveBriefing | None:
        snaps = await fs_retry(lambda: list(
            self.db.collection("cases").document(case_id).collection("briefings")
            .order_by("created_at", direction=firestore.Query.DESCENDING).limit(1).stream()
        ))
        if not snaps:
            return None
        return ExecutiveBriefing.model_validate(snaps[0].to_dict())
