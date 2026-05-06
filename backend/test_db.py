import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:6543/postgres')
    async with AsyncSession(engine) as session:
        res = await session.execute(text('SELECT slug FROM locations'))
        print(res.fetchall())
asyncio.run(main())
