"""Test SQLAlchemy connection from backend dir."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import engine, db_url
from sqlalchemy import text

print(f"db_url = {db_url}")

async def test():
    from app.repositories.location_repo import get_all_locations_node_data
    from app.db.database import async_session
    try:
        async with async_session() as session:
            res = await get_all_locations_node_data(session)
            print(f"✅ SQLAlchemy OK, items: {len(res)}")
    except Exception as e:
        print(f"❌ FAILED: {type(e).__name__}: {e}")
    finally:
        await engine.dispose()

asyncio.run(test())
