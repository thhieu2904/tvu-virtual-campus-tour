import asyncio
import sys
import uuid
from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select
from app.db.tables import Location, LocationLink
from sqlalchemy.pool import NullPool

import os
from dotenv import load_dotenv

load_dotenv()

# Create a custom engine that connects directly to avoid PgBouncer prepared statement issues
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and "6543" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("6543", "5432")

engine = create_async_engine(DATABASE_URL)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def insert_d5():
    async with async_session() as db:
        # Check if D5 exists
        d5_result = await db.execute(select(Location).where(Location.slug == "d5-nha-hoc"))
        d5 = d5_result.scalars().first()
        
        if not d5:
            print("Inserting D5...")
            d5 = Location(
                id=uuid.uuid4(),
                name="Nhà học D5",
                slug="d5-nha-hoc",
                description="Tòa nhà học D5",
                is_start_node=False,
                status="active"
            )
            db.add(d5)
            await db.commit()
            await db.refresh(d5)
        else:
            print("D5 already exists.")

        # Get other locations to create links
        locs_result = await db.execute(select(Location))
        locs = {loc.slug: loc.id for loc in locs_result.scalars().all()}
        
        d5_id = locs.get("d5-nha-hoc")
        other_slugs = ["cong-chinh", "thu-vien", "khoa-cntt"]
        
        print("Inserting links...")
        for slug in other_slugs:
            other_id = locs.get(slug)
            if not other_id:
                continue
                
            # Check link to D5
            link1 = await db.execute(select(LocationLink).where(LocationLink.from_location_id == other_id, LocationLink.to_location_id == d5_id))
            if not link1.scalars().first():
                db.add(LocationLink(id=uuid.uuid4(), from_location_id=other_id, to_location_id=d5_id, label=f"{slug} to D5"))
                
            # Check link from D5
            link2 = await db.execute(select(LocationLink).where(LocationLink.from_location_id == d5_id, LocationLink.to_location_id == other_id))
            if not link2.scalars().first():
                db.add(LocationLink(id=uuid.uuid4(), from_location_id=d5_id, to_location_id=other_id, label=f"D5 to {slug}"))
                
        await db.commit()
        print("Done inserting D5 and links.")

if __name__ == "__main__":
    asyncio.run(insert_d5())
