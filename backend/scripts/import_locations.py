"""Update intro_message and description from LOCATION_DATA_REVIEW.md"""
import asyncio, sys, os
import re
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

async def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    in_path = os.path.join(os.path.dirname(root), "LOCATION_DATA_REVIEW.md")
    
    with open(in_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Parse markdown blocks
    # Format: ## Name (`slug`) \n\n ### Intro... \n\n ```\n text \n``` \n\n ### Desc... \n\n ```\n text \n```
    blocks = re.findall(r"## .*? \(`(.*?)`\)\n\n### Intro Message.*?\n\n```\n(.*?)\n```\n\n### Description.*?\n\n```\n(.*?)\n```", content, re.DOTALL)
    
    updates = []
    for slug, intro, desc in blocks:
        updates.append({
            "slug": slug.strip(),
            "intro": intro.strip() if intro.strip() != "(trống)" else "",
            "desc": desc.strip() if desc.strip() != "(trống)" else ""
        })

    async with AsyncSession(engine) as db:
        for data in updates:
            await db.execute(
                text("UPDATE locations SET intro_message = :intro, description = :desc WHERE slug = :slug"),
                data
            )
            print(f"✅ Updated {data['slug']}")
        await db.commit()

    print("\n--- Verification ---")
    async with AsyncSession(engine) as db:
        res = await db.execute(text("SELECT slug, intro_message, description FROM locations ORDER BY slug"))
        for row in res.fetchall():
            print(f"[{row[0]}]")
            print(f"  Intro: {row[1][:60]}..." if row[1] else "  Intro: (empty)")
            print(f"  Desc:  {row[2][:60]}..." if row[2] else "  Desc:  (empty)")

asyncio.run(main())
