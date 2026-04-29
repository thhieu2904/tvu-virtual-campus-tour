"""
One-off script: Update D5 slug from d5-nha-hoc → d5-giang-duong and name to Giảng đường D5.
Uses the app's existing database module to ensure correct asyncpg/SSL configuration.
"""
import asyncio
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select
from app.db.database import async_session, engine
from app.db.tables import Location

async def main():
    async with async_session() as db:
        result = await db.execute(select(Location).where(Location.slug == "d5-nha-hoc"))
        d5 = result.scalars().first()
        
        if d5:
            d5.slug = "d5-giang-duong"
            d5.name = "Giảng đường D5"
            await db.commit()
            print("✅ Updated D5: slug='d5-giang-duong', name='Giảng đường D5'")
        else:
            print("⚠️ D5 with slug 'd5-nha-hoc' not found.")
            result2 = await db.execute(select(Location).where(Location.slug == "d5-giang-duong"))
            if result2.scalars().first():
                print("   → Already updated to 'd5-giang-duong'. No action needed.")
            else:
                print("   → D5 does not exist at all in DB.")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())
