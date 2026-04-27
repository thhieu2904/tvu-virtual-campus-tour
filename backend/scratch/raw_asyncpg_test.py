"""Raw asyncpg test — bypass SQLAlchemy to isolate the issue."""
import asyncio
import ssl
import asyncpg

async def test():
    # Test 1: Pooler connection (port 6543)
    print("=== Test 1: Pooler (6543) ===")
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        conn = await asyncio.wait_for(
            asyncpg.connect(
                host="aws-1-ap-southeast-1.pooler.supabase.com",
                port=6543,
                user="postgres.inooqrxptxsfnvuxtgec",
                password="",
                database="postgres",
                ssl=ctx,
            ),
            timeout=10,
        )
        val = await conn.fetchval("SELECT 1")
        print(f"✅ Pooler OK! Result: {val}")
        await conn.close()
    except Exception as e:
        print(f"❌ Pooler FAILED: {type(e).__name__}: {e}")

    # Test 2: Direct connection (port 5432)
    print("\n=== Test 2: Direct (5432) ===")
    try:
        ctx2 = ssl.create_default_context()
        ctx2.check_hostname = False
        ctx2.verify_mode = ssl.CERT_NONE
        conn = await asyncio.wait_for(
            asyncpg.connect(
                host="db.inooqrxptxsfnvuxtgec.supabase.co",
                port=5432,
                user="postgres.inooqrxptxsfnvuxtgec",
                password="",
                database="postgres",
                ssl=ctx2,
            ),
            timeout=10,
        )
        val = await conn.fetchval("SELECT 1")
        print(f"✅ Direct OK! Result: {val}")
        await conn.close()
    except Exception as e:
        print(f"❌ Direct FAILED: {type(e).__name__}: {e}")

    # Test 3: Pooler without SSL
    print("\n=== Test 3: Pooler without SSL ===")
    try:
        conn = await asyncio.wait_for(
            asyncpg.connect(
                host="aws-1-ap-southeast-1.pooler.supabase.com",
                port=6543,
                user="postgres.inooqrxptxsfnvuxtgec",
                password="",
                database="postgres",
            ),
            timeout=10,
        )
        val = await conn.fetchval("SELECT 1")
        print(f"✅ Pooler (no SSL) OK! Result: {val}")
        await conn.close()
    except Exception as e:
        print(f"❌ Pooler (no SSL) FAILED: {type(e).__name__}: {e}")

if __name__ == "__main__":
    asyncio.run(test())
