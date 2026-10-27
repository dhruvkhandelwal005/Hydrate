import asyncio
from app.config import settings
from groq import AsyncGroq

async def test():
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    try:
        models = await client.models.list()
        print([m.id for m in models.data])
    except Exception as e:
        print("Models list error:", e)

asyncio.run(test())
