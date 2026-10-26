from app.config import settings

print("GEMINI_API_KEY:", bool(settings.GEMINI_API_KEY))
print("ANTHROPIC_API_KEY:", bool(settings.ANTHROPIC_API_KEY))
print("OPENAI_API_KEY:", bool(settings.OPENAI_API_KEY))
print("LLM_API_KEY:", bool(settings.LLM_API_KEY))
print("GROQ_API_KEY:", bool(settings.GROQ_API_KEY))
