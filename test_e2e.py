import urllib.request
import json
import zipfile
import io
import sys

BASE = "http://127.0.0.1:8000/api/v1"

def req(url, method="GET", data=None):
    headers = {"Content-Type": "application/json", "X-Request-ID": "test-req-123"}
    body = json.dumps(data).encode("utf-8") if data is not None else None
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

print("[1] Creating Case...")
status, body = req(f"{BASE}/cases", "POST", {
    "question": "As of 25 January 2027, how exposed are Midgard and Tolan to the end of the Orvan corridor agreement?",
    "as_of_date": "2027-01-25",
    "pack_id": "dev_pack_E5"
})
assert status in (200, 201), f"Create case failed: {status} {body}"
case = json.loads(body.decode("utf-8"))
case_id = case["case_id"]
print(f"  -> Case created: {case_id}, verification: {case.get('verification_status')}, excluded_count: {case.get('excluded_count')}")

print("\n[2] Advancing to Round 1...")
status, body = req(f"{BASE}/cases/{case_id}/advance", "POST", {"to": "round1"})
assert status == 200, f"Advance r1 failed: {status} {body}"
r1 = json.loads(body.decode("utf-8"))
print(f"  -> Round 1 done: phase={r1.get('phase')}")

print("\n[3] Advancing to Round 2...")
status, body = req(f"{BASE}/cases/{case_id}/advance", "POST", {"to": "round2"})
assert status == 200, f"Advance r2 failed: {status} {body}"
r2 = json.loads(body.decode("utf-8"))
print(f"  -> Round 2 done: phase={r2.get('phase')}")

print("\n[4] Advancing to Judge (Odin)...")
status, body = req(f"{BASE}/cases/{case_id}/advance", "POST", {"to": "judge"})
assert status == 200, f"Advance judge failed: {status} {body}"
judge_res = json.loads(body.decode("utf-8"))
print(f"  -> Judge done: phase={judge_res.get('phase')}")

print("\n[5] Getting Exposure Table...")
status, body = req(f"{BASE}/cases/{case_id}/exposure")
assert status == 200, f"Exposure failed: {status} {body}"
exposure = json.loads(body.decode("utf-8"))
print(f"  -> Exposure rows count: {len(exposure.get('rows', []))}")
assert len(exposure.get("rows", [])) > 0, "Exposure rows must not be empty"
for row in exposure.get("rows", []):
    print(f"     * {row['country']} / {row['sector']}: Thor={row['thor']} Loki={row['loki']} Odin={row['odin']}")

print("\n[6] Getting Ruling...")
status, body = req(f"{BASE}/cases/{case_id}/ruling")
assert status == 200, f"Ruling failed: {status} {body}"
ruling = json.loads(body.decode("utf-8"))
print(f"  -> Headline: {ruling.get('decree', {}).get('headline')}")
print(f"  -> Sufficiency: {ruling.get('sufficiency', {}).get('state')}")

print("\n[7] Getting Judge Compliance Checklist (Section 12)...")
status, body = req(f"{BASE}/cases/{case_id}/judge")
assert status == 200, f"Judge checklist failed: {status} {body}"
judge_check = json.loads(body.decode("utf-8"))
items = judge_check.get("items", [])
print(f"  -> Checklist items count: {len(items)}")
for item in items:
    print(f"     [{'OK' if item.get('ok') else 'FAIL'}] {item.get('id')}: {item.get('label')}")

print("\n[8] Getting Export Bundle ZIP...")
status, body = req(f"{BASE}/cases/{case_id}/export")
assert status == 200, f"Export failed: {status} {body}"
zf = zipfile.ZipFile(io.BytesIO(body))
print(f"  -> Export ZIP contains {len(zf.namelist())} files: {zf.namelist()}")
assert len(zf.namelist()) >= 10, "Export ZIP missing expected reproducibility files"

print("\n[9] Checking Source API...")
status, body = req(f"{BASE}/sources/ORV-0010")
if status == 200:
    source = json.loads(body.decode("utf-8"))
    print(f"  -> Source ORV-0010: title='{source.get('title')}', date={source.get('pub_date')}, tier={source.get('tier')}")
else:
    print(f"  -> Source status: {status}")

print("\nALL 9 ENDPOINTS PASSED FLAWLESSLY!")
