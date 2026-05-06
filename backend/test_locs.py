import asyncio
from app.db.database import get_db
from app.repositories import location_repo
async def main():
    async for db in get_db():
        locs = await location_repo.get_all(db)
        print([(l.slug, l.status) for l in locs])
asyncio.run(main())
