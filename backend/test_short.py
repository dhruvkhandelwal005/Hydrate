import requests

res = requests.post("http://127.0.0.1:8000/v1/cases", json={
    "question": "agvn",
    "pack_id": "dev_pack_E5",
    "as_of_date": "2027-01-25"
})
print("STATUS:", res.status_code)
print("RESPONSE:", res.json())
