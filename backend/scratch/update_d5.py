import asyncio
import sys
from pathlib import Path

# Setup paths
BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.db.database import async_session
from app.db.tables import Location, LocationLink
from sqlalchemy import select

async def run():
    async with async_session() as db:
        # Check if D5 exists
        d5_res = await db.execute(select(Location).where(Location.slug == 'd5-nha-hoc'))
        d5 = d5_res.scalar_one_or_none()
        
        if not d5:
            d5 = Location(
                name='Nhà học D5',
                slug='d5-nha-hoc',
                status='active',
                description='Khu vực nhà học D5 - Đang phát triển nội dung.'
            )
            db.add(d5)
            await db.flush()
            print("Created D5 location")
        else:
            d5.status = 'active'
            print("Updated D5 to active")

        # Check for Gate
        gate_res = await db.execute(select(Location).where(Location.slug == 'cong-chinh'))
        gate = gate_res.scalar_one_or_none()

        if gate and d5:
            # Add links if they don't exist
            link1_res = await db.execute(select(LocationLink).where(
                LocationLink.from_location_id == gate.id,
                LocationLink.to_location_id == d5.id
            ))
            if not link1_res.scalar_one_or_none():
                db.add(LocationLink(from_location_id=gate.id, to_location_id=d5.id, label='Cổng chính -> D5'))
                print("Added link Gate -> D5")

            link2_res = await db.execute(select(LocationLink).where(
                LocationLink.from_location_id == d5.id,
                LocationLink.to_location_id == gate.id
            ))
            if not link2_res.scalar_one_or_none():
                db.add(LocationLink(from_location_id=d5.id, to_location_id=gate.id, label='D5 -> Cổng chính'))
                print("Added link D5 -> Gate")

        await db.commit()
        print("Done!")

if __name__ == "__main__":
    asyncio.run(run())
