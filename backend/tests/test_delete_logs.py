import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_delete_case_logs_and_case():
    # 1. Create a case
    res = client.post("/api/v1/cases", json={
        "question": "Midgard wheat corridor disruption analysis",
        "as_of_date": "2027-01-25",
        "pack_id": "dev_pack_E5"
    })
    assert res.status_code == 201
    case_id = res.json()["case_id"]

    # 2. Verify GET /api/v1/cases returns a list containing our case
    res = client.get("/api/v1/cases")
    assert res.status_code == 200
    cases = res.json()
    assert isinstance(cases, list)
    assert any(c["case_id"] == case_id for c in cases)

    # 3. Test DELETE /api/v1/cases/{case_id}/logs
    res = client.delete(f"/api/v1/cases/{case_id}/logs")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["case_id"] == case_id

    # 4. Verify logs are empty
    res = client.get(f"/api/v1/cases/{case_id}/logs")
    assert res.status_code == 200
    assert res.json()["total_events"] == 0

    # 5. Test DELETE /api/v1/cases/{case_id}
    res = client.delete(f"/api/v1/cases/{case_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["case_id"] == case_id

    # 6. Verify case is gone from GET /api/v1/cases
    res = client.get("/api/v1/cases")
    assert res.status_code == 200
    cases_after = res.json()
    assert not any(c["case_id"] == case_id for c in cases_after)
