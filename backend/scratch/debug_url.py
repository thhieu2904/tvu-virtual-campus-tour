"""Debug: print the exact URL SQLAlchemy is using."""
import asyncio, sys, os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.db.database import db_url, engine, _connect_args
from sqlalchemy import text

print(f"db_url = {db_url}")
print(f"connect_args = {_connect_args}")
print(f"engine.url = {engine.url}")
print(f"engine.url.render_as_string(hide_password=False) = {engine.url.render_as_string(hide_password=False)}")

async def test():
    try:
        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT 1"))
            print(f"✅ OK: {res.scalar()}")
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {e}")
    finally:
        await engine.dispose()

asyncio.run(test())
