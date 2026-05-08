import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text

load_dotenv()

async def main():
    engine = create_async_engine(os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://"))
    async with AsyncSession(engine) as db:
        res = await db.execute(text('SELECT slug, name, status FROM locations'))
        print(res.fetchall())
asyncio.run(main())
