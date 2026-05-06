"""Export full location data to markdown for review."""
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
        rows = res.fetchall()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = os.path.join(os.path.dirname(root), "LOCATION_DATA_REVIEW.md")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("# Dữ liệu Location — Cần Review & Sửa lại\n\n")
        f.write("> File này dùng để review nội dung intro_message và description của từng khu vực.\n")
        f.write("> Sau khi sửa xong, báo lại để chạy script update DB.\n\n---\n\n")

        for row in rows:
            slug, name, intro, desc = row
            f.write(f"## {name} (`{slug}`)\n\n")
            f.write(f"### Intro Message (Lời chào khi đến khu vực)\n\n")
            f.write(f"```\n{intro if intro else '(trống)'}\n```\n\n")
            f.write(f"### Description (Mô tả chi tiết)\n\n")
            f.write(f"```\n{desc if desc else '(trống)'}\n```\n\n")
            f.write("---\n\n")

    print(f"✅ Exported to: {out_path}")

asyncio.run(main())
