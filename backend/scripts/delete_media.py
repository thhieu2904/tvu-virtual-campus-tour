import asyncio
from app.db.database import async_session
from app.db.tables import Media
from sqlalchemy import select

async def main():
    async with async_session() as db:
        result = await db.execute(select(Media).where(Media.caption.like('%Giao lưu sinh viên quốc tế%')))
        media = result.scalars().first()
        if media:
            print(f"Deleting: {media.caption}")
            await db.delete(media)
            await db.commit()
            print("Deleted successfully!")
        else:
            print("Not found!")

if __name__ == "__main__":
    asyncio.run(main())
