import os, asyncio
from app.config import settings
from groq import AsyncGroq

async def test():
    for name, k in [('GROQ_API_KEY', settings.GROQ_API_KEY), ('GROQ_API_KEY1', settings.GROQ_API_KEY1), ('GROQ_API_KEY2', settings.GROQ_API_KEY2), ('GROQ_API_KEY3', settings.GROQ_API_KEY3)]:
        if not k:
            continue
        client = AsyncGroq(api_key=k)
        for model in ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']:
            try:
                res = await client.chat.completions.create(
                    model=model,
                    messages=[{'role': 'user', 'content': 'Output valid JSON: {"status": "ok"}'}],
                    response_format={'type': 'json_object'},
                    max_tokens=50,
                    timeout=5.0
                )
                print(f'{name} with {model} SUCCESS: {res.choices[0].message.content}')
            except Exception as e:
                print(f'{name} with {model} FAILED: {e}')

asyncio.run(test())
