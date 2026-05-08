import asyncio
import os
import sys

# Thêm đường dẫn backend vào sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.db.database import async_session
from app.db.tables import Mascot, Location
from sqlalchemy import select

async def main():
    async with async_session() as session:
        r1 = await session.execute(select(Mascot))
        print('Mascots:', [(m.id, m.name, m.slug) for m in r1.scalars().all()])
        r2 = await session.execute(select(Location.slug, Location.mascot_id))
        print('Locations:', [(l.slug, l.mascot_id) for l in r2.scalars().all()])

asyncio.run(main())
