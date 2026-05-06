"""Update background_url for all locations to use correct 360 images."""
import asyncio
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

# Mapping: slug → correct background URL
BG_MAP = {
    "cong-chinh": "/360/cong-chinh.jpg",
    "b7-thu-vien": "/360/b7-thu-vien.jpg",
    "c7-khoa-cntt": "/360/c7-khoa-cntt.jpg",
    "d5-giang-duong": "/360/d5-giang-duong.jpg",
}

async def main():
    async with AsyncSession(engine) as db:
        for slug, url in BG_MAP.items():
            await db.execute(
                text("UPDATE locations SET background_url = :url WHERE slug = :slug"),
                {"url": url, "slug": slug},
            )
            print(f"✅ {slug} → {url}")
        await db.commit()
    
    # Verify
    async with AsyncSession(engine) as db:
        res = await db.execute(text("SELECT slug, background_url FROM locations"))
        print("\n--- Verification ---")
        for row in res.fetchall():
            print(f"  {row[0]}: {row[1]}")

asyncio.run(main())
