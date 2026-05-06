"""Fix: D5 missing intro_message."""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

FIXES = {
    "d5-giang-duong": {
        "intro_message": "Đây là Giảng đường D5 — một trong những tòa nhà giảng dạy chính của TVU! Nơi đây có nhiều phòng học và phòng thực hành hiện đại phục vụ sinh viên.",
    },
}

async def main():
    async with AsyncSession(engine) as db:
        for slug, data in FIXES.items():
            await db.execute(
                text("UPDATE locations SET intro_message = :intro WHERE slug = :slug"),
                {"intro": data["intro_message"], "slug": slug},
            )
            print(f"✅ {slug} → intro updated")
        await db.commit()

    # Verify
    async with AsyncSession(engine) as db:
        res = await db.execute(text(
            "SELECT slug, intro_message FROM locations ORDER BY slug"
        ))
        print("\n--- Verification ---")
        for row in res.fetchall():
            print(f"  {row[0]}: {row[1][:80] if row[1] else '(empty)'}...")

asyncio.run(main())
