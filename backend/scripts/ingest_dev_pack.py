import asyncio
import sys
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.container import get_container

async def main():
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("dev_pack_E5")
    c = get_container()
    print(f"Ingesting pack from: {target}...")
    report = await c.loader.ingest_pack(target)
    print("Ingestion report:")
    print(report.model_dump_json(indent=2))

if __name__ == "__main__":
    asyncio.run(main())
