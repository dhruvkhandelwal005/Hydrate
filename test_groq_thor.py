import asyncio
from app.config import settings
from app.agents.thor import ThorReport
from app.agents.base import GroqProvider

async def test():
    gp = GroqProvider(api_keys=settings.GROQ_API_KEY, model="qwen/qwen3.8-27b")
    try:
        r = await gp.structured(
            system="You are Thor, advocate for high supply chain disruption.",
            user="Analyze impact of Orvan corridor closure on Midgard and Tolan wheat imports. Provide structured ThorReport.",
            schema=ThorReport
        )
        print("Success! Claims count:", len(r.claims))
        print("Executive summary:", r.executive_summary[:100])
    except Exception as e:
        print("Failed:", e)

asyncio.run(test())
