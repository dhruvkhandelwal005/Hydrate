import os, time
from dotenv import load_dotenv
load_dotenv()

def test_groq():
    from groq import Groq
    keys = [os.getenv("GROQ_API_KEY"), os.getenv("GROQ_API_KEY1"), os.getenv("GROQ_API_KEY2"), os.getenv("GROQ_API_KEY3")]
    for i, k in enumerate(keys):
        if not k: continue
        try:
            c = Groq(api_key=k)
            t0 = time.time()
            r = c.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=[{"role": "user", "content": "Respond with JSON: {\"status\": \"ok\"}"}],
                response_format={"type": "json_object"},
                max_tokens=50
            )
            print(f"Groq key {i} OK in {time.time()-t0:.2f}s: {r.choices[0].message.content}")
        except Exception as e:
            print(f"Groq key {i} FAILED: {e}")

def test_anthropic():
    from anthropic import Anthropic
    keys = [os.getenv("ANTHROPIC_API_KEY"), os.getenv("ANTHROPIC_API_KEY1")]
    for i, k in enumerate(keys):
        if not k: continue
        try:
            c = Anthropic(api_key=k)
            t0 = time.time()
            r = c.messages.create(
                model="claude-3-5-haiku-20241022",
                max_tokens=50,
                messages=[{"role": "user", "content": "Respond with OK"}]
            )
            print(f"Anthropic key {i} OK in {time.time()-t0:.2f}s: {r.content[0].text}")
        except Exception as e:
            print(f"Anthropic key {i} FAILED: {e}")

def test_gemini():
    from google import genai
    k = os.getenv("GEMINI_API_KEY")
    if k:
        try:
            c = genai.Client(api_key=k)
            t0 = time.time()
            r = c.models.generate_content(
                model="gemini-2.5-flash",
                contents="Say OK"
            )
            print(f"Gemini OK in {time.time()-t0:.2f}s: {r.text}")
        except Exception as e:
            print(f"Gemini FAILED: {e}")

if __name__ == "__main__":
    print("Testing Groq...")
    test_groq()
    print("\nTesting Anthropic...")
    test_anthropic()
    print("\nTesting Gemini...")
    test_gemini()
