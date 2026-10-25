from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/packs")
def list_packs():
    return [
        {
            "pack_id": "pack-rotterdam-2026",
            "state": "READY",
            "files": [
                {"doc_id": "ORV-0412", "path": "Rotterdam_Berth_Manifest_Q3.pdf", "status": "VALID"},
                {"doc_id": "ORV-0388", "path": "Microelectronics_Supply_Route_Audit.pdf", "status": "VALID"},
                {"doc_id": "ORV-0501", "path": "Trade_Table_Commodities_Index.pdf", "status": "VALID"},
                {"doc_id": "ORV-0711", "path": "EU_Energy_And_Reserves_Directive.pdf", "status": "VALID"},
                {"doc_id": "ORV-0544", "path": "Master_Supplier_Agreements_Annex_C.pdf", "status": "VALID"},
            ],
            "file_count": 5,
            "valid_count": 5,
            "created_at": "2026-10-24T12:00:00Z",
        }
    ]


@app.get("/v1/packs/{pack_id}/status")
def get_pack_status(pack_id: str):
    return {
        "pack_id": pack_id,
        "state": "READY",
        "files": [
            {"doc_id": "ORV-0412", "path": "Rotterdam_Berth_Manifest_Q3.pdf", "status": "VALID"},
            {"doc_id": "ORV-0388", "path": "Microelectronics_Supply_Route_Audit.pdf", "status": "VALID"},
            {"doc_id": "ORV-0501", "path": "Trade_Table_Commodities_Index.pdf", "status": "VALID"},
            {"doc_id": "ORV-0711", "path": "EU_Energy_And_Reserves_Directive.pdf", "status": "VALID"},
            {"doc_id": "ORV-0544", "path": "Master_Supplier_Agreements_Annex_C.pdf", "status": "VALID"},
        ],
        "file_count": 5,
        "valid_count": 5,
        "created_at": "2026-10-24T12:00:00Z",
    }


@app.post("/v1/packs/ingest")
def ingest_pack():
    return {"pack_id": "pack-rotterdam-2026"}


@app.post("/v1/cases")
def create_case(payload: dict):
    return {
        "case_id": "case-rotterdam-001",
        "question": payload.get("question", "Rotterdam supply chain disruption"),
        "as_of_date": payload.get("as_of_date", "2026-10-24"),
        "created_at": "2026-10-24T12:00:00Z",
    }


@app.post("/v1/cases/{case_id}/run")
def run_case(case_id: str):
    return {"run_id": f"run-{case_id}-01"}
