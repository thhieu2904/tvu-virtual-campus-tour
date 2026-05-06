"""Check intro_message and description for all locations."""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

async def main():
    async with AsyncSession(engine) as db:
        res = await db.execute(text(
            "SELECT slug, name, intro_message, description FROM locations ORDER BY slug"
        ))
        for row in res.fetchall():
            print(f"═══ {row[0]} ({row[1]}) ═══")
            print(f"  intro: {row[2][:100] if row[2] else '(empty)'}...")
            print(f"  desc:  {row[3][:100] if row[3] else '(empty)'}...")
            print()

asyncio.run(main())
