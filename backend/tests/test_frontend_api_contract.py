import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

QUESTION = (
    "As of 25 January 2027, how exposed are Midgard and Tolan to the end of the "
    "Orvan corridor agreement? Give a low and high range for wheat and maize imports."
)

def test_pack_hub_endpoints():
    # 1. GET /api/v1/packs
    res = client.get("/api/v1/packs")
    assert res.status_code == 200, res.text
    packs = res.json()
    assert len(packs) > 0
    assert any(p["pack_id"] in ("dev_pack_E5", "pack_e5") for p in packs)
    pack_summary = packs[0]
    assert "pack_id" in pack_summary
    assert "name" in pack_summary
    assert pack_summary["state"] == "READY"
    assert pack_summary["total_files"] > 0
    assert "created_at" in pack_summary

    # 2. GET /api/v1/packs/{pack_id}/status
    res = client.get("/api/v1/packs/dev_pack_E5/status")
    assert res.status_code == 200, res.text
    status = res.json()
    assert status["state"] == "READY"
    assert status["total_files"] > 0
    assert "counts" in status
    assert status["counts"]["VALID"] > 0
    assert "trade_tables" in status
    assert "files" in status
    assert len(status["files"]) > 0

    # Verify map file is NOT in document files
    assert not any("runemark_map" in f["path"].lower() for f in status["files"])

def test_full_case_lifecycle_and_step_mode():
    # 1. POST /api/v1/cases
    req_body = {
        "question": QUESTION,
        "as_of_date": "2027-01-25",
        "pack_id": "dev_pack_E5"
    }
    res = client.post("/api/v1/cases", json=req_body)
    assert res.status_code == 201, res.text
    case_summary = res.json()
    case_id = case_summary["case_id"]
    assert case_summary["verification_status"] in ("VERIFIED", "INSUFFICIENT")
    assert case_summary["phase"] == "idle"
    assert "Midgard" in case_summary["countries"]
    assert "Tolan" in case_summary["countries"]
    assert len(case_summary["verification_doc_ids"]) > 0

    # 2. GET /api/v1/cases
    res = client.get("/api/v1/cases")
    assert res.status_code == 200
    all_cases = res.json()
    assert any(c["case_id"] == case_id for c in all_cases)

    # 3. GET /api/v1/cases/{case_id}
    res = client.get(f"/api/v1/cases/{case_id}")
    assert res.status_code == 200
    state = res.json()
    assert state["case_id"] == case_id
    assert state["phase"] == "idle"
    assert state["status"] == "IN_PROGRESS"
    assert "limits" in state
    assert "headers" in state

    # 4. Advance wrong order -> 409
    res = client.post(f"/api/v1/cases/{case_id}/advance", json={"to": "judge"})
    assert res.status_code == 409
    assert "detail" in res.json()

    # 5. Advance to round1 -> phase r1_done
    res = client.post(f"/api/v1/cases/{case_id}/advance", json={"to": "round1"})
    assert res.status_code == 200
    assert res.json()["phase"] == "r1_done"

    # Verify claims populated
    res = client.get(f"/api/v1/cases/{case_id}")
    state = res.json()
    assert state["phase"] == "r1_done"
    assert len(state["claims"]) > 0
    # Check claim format
    sample_claim = state["claims"][0]
    assert "nature" in sample_claim
    assert "status" in sample_claim
    assert "citations" in sample_claim

    # 6. Advance to round2 -> phase r2_done
    res = client.post(f"/api/v1/cases/{case_id}/advance", json={"to": "round2"})
    assert res.status_code == 200
    assert res.json()["phase"] == "r2_done"

    # 7. Advance to judge -> phase complete
    res = client.post(f"/api/v1/cases/{case_id}/advance", json={"to": "judge"})
    assert res.status_code == 200
    assert res.json()["phase"] == "complete"

    # 8. GET /api/v1/cases/{case_id}/exposure
    res = client.get(f"/api/v1/cases/{case_id}/exposure")
    assert res.status_code == 200
    exp = res.json()
    assert "unit" in exp
    assert "rows" in exp
    assert len(exp["rows"]) > 0
    row0 = exp["rows"][0]
    assert "thor" in row0
    assert "loki" in row0
    assert "odin" in row0
    assert "evidence" in row0

    # 9. GET /api/v1/cases/{case_id}/ruling
    res = client.get(f"/api/v1/cases/{case_id}/ruling")
    assert res.status_code == 200
    ruling_panel = res.json()
    assert "decree" in ruling_panel
    assert "determination" in ruling_panel
    assert "rulings" in ruling_panel
    assert "sufficiency" in ruling_panel
    assert "recommendations" in ruling_panel

    # 10. GET /api/v1/cases/{case_id}/briefing
    res = client.get(f"/api/v1/cases/{case_id}/briefing")
    assert res.status_code == 200
    briefing = res.json()
    assert briefing["status"] == "COMPLETE"
    assert "executive_summary" in briefing
    assert "established" in briefing
    assert "sources" in briefing

    # 11. GET /api/v1/cases/{case_id}/judge
    res = client.get(f"/api/v1/cases/{case_id}/judge")
    assert res.status_code == 200
    judge_data = res.json()
    assert "items" in judge_data
    assert len(judge_data["items"]) == 12
    assert all(item["ok"] is True for item in judge_data["items"])

    # 12. GET /api/v1/cases/{case_id}/runs
    res = client.get(f"/api/v1/cases/{case_id}/runs")
    assert res.status_code == 200
    runs = res.json()
    assert len(runs) > 0
    assert "run_number" in runs[0]

    # 13. GET /api/v1/cases/{case_id}/feed
    res = client.get(f"/api/v1/cases/{case_id}/feed?speed=5")
    assert res.status_code == 200
    feed = res.json()
    assert len(feed) > 0

    # 14. GET /api/v1/cases/{case_id}/memory-events
    res = client.get(f"/api/v1/cases/{case_id}/memory-events")
    assert res.status_code == 200
    mem_events = res.json()
    assert len(mem_events) > 0

    # 15. POST /api/v1/cases/{case_id}/reset
    res = client.post(f"/api/v1/cases/{case_id}/reset")
    assert res.status_code == 200
    new_summary = res.json()
    assert new_summary["case_id"] != case_id
    assert new_summary["phase"] == "idle"

    # 16. GET /api/v1/cases/{case_id}/export
    res = client.get(f"/api/v1/cases/{case_id}/export")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/zip"

def test_sources_click_through_and_pdf():
    # 1. GET /api/v1/sources
    res = client.get("/api/v1/sources?country=Midgard&sector=Wheat")
    assert res.status_code == 200
    sources = res.json()
    assert len(sources) > 0

    # 2. GET /api/v1/sources/{doc_id}
    res = client.get("/api/v1/sources/ORV-0002")
    assert res.status_code == 200
    doc = res.json()
    assert doc["doc_id"] == "ORV-0002"
    assert "file_url" in doc
    assert "flags" in doc
    assert "spans" in doc

    # 3. GET /api/v1/sources/ORV-0002/file - opens exact PDF
    res = client.get("/api/v1/sources/ORV-0002/file")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "inline" in res.headers.get("content-disposition", "")

    # 4. Clock violation check: post-date document returns 403
    res = client.get("/api/v1/sources/ORV-0009?as_of=2026-01-01")
    assert res.status_code == 403
    assert "CLOCK_VIOLATION" in res.json()["detail"]

def test_trade_table_endpoints():
    # 1. GET /api/v1/trade/{table_id}
    res = client.get("/api/v1/trade/ORV-0009")
    assert res.status_code == 200
    table = res.json()
    assert table["table_id"] == "ORV-0009"
    assert "rows" in table
    assert len(table["rows"]) > 0

    # 2. GET /api/v1/trade/{table_id}/rows/{row_id}
    res = client.get("/api/v1/trade/ORV-0009/rows/R1")
    assert res.status_code == 200
    row = res.json()
    assert row["table_id"] == "ORV-0009"
    assert "values" in row
    assert "header" in row
