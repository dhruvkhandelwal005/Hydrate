import asyncio
from app.config import settings

async def test_all():
    print("Testing Gemini...")
    try:
        from google import genai
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        r = client.models.generate_content(
            model="gemini-2.5-flash",
            contents="Return JSON: {\"status\": \"ok\"}"
        )
        print("Gemini response:", r.text[:100] if r else "empty")
    except Exception as e:
        print("Gemini failed:", e)

    print("Testing Anthropic...")
    try:
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        r = await client.messages.create(
            model="claude-3-5-haiku-latest",
            max_tokens=100,
            messages=[{"role": "user", "content": "Return JSON: {\"status\": \"ok\"}"}]
        )
        print("Anthropic response:", r.content[0].text[:100])
    except Exception as e:
        print("Anthropic failed:", e)

    print("Testing Groq qwen...")
    try:
        from groq import AsyncGroq
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        r = await client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[{"role": "user", "content": "Return JSON: {\"status\": \"ok\"}"}],
            response_format={"type": "json_object"},
            max_tokens=50
        )
        print("Groq qwen response:", r.choices[0].message.content)
    except Exception as e:
        print("Groq qwen failed:", e)

asyncio.run(test_all())
