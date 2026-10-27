import asyncio, time
from app.services.container import get_container

async def test():
    container = get_container()
    q = "How exposed are Midgard and Tolan to the Orvan corridor closure?"
    t0 = time.time()
    print("Building case...")
    case_file = await container.trial_engine.build_case(question=q, pack_id="dev_pack_E5")
    t1 = time.time()
    print(f"Case built in {t1-t0:.2f}s: case_id={case_file.case_id}, status={case_file.verification_status.value}")
    print(f"Summary: {case_file.verification_summary[:120]}")
    print("Running round 1...")
    t2 = time.time()
    try:
        t_claims, l_claims = await container.trial_engine.run_round_1(case_file.case_id, force=True)
        t3 = time.time()
        print(f"Round 1 finished in {t3-t2:.2f}s: {len(t_claims)} Thor claims, {len(l_claims)} Loki claims")
    except Exception as e:
        print("Round 1 FAILED:", type(e), e)

asyncio.run(test())
