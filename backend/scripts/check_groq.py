import os, time
from dotenv import load_dotenv
load_dotenv()
from groq import Groq

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "allam-2-7b"]

for m in models:
    t0 = time.time()
    try:
        r = client.chat.completions.create(
            model=m,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs JSON."},
                {"role": "user", "content": "Output a JSON object with key 'status' and value 'ok'."}
            ],
            response_format={"type": "json_object"},
            max_tokens=200
        )
        print(f"{m} OK in {time.time()-t0:.2f}s: {r.choices[0].message.content.strip()}")
    except Exception as e:
        print(f"{m} FAILED in {time.time()-t0:.2f}s: {e}")
