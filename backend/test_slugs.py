import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres.inooqrxptxsfnvuxtgec:tvu-virtual-campus-tour@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres')
    async with AsyncSession(engine) as db:
        res = await db.execute(text('SELECT slug, name, status FROM locations'))
        print(res.fetchall())
asyncio.run(main())
