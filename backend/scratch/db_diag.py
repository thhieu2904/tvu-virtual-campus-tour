
import asyncio
import sys
import os

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from sqlalchemy import text
from app.db.database import engine
from app.db.tables import Base, Location

async def diagnostic():
    print("Testing DB connection...")
    try:
        async with engine.connect() as conn:
            print("Connected!")
            res = await conn.execute(text("SELECT 1"))
            print(f"Result: {res.scalar()}")
            
            print("Checking locations table...")
            res = await conn.execute(text("SELECT count(*) FROM locations"))
            print(f"Location count: {res.scalar()}")
            
    except Exception as e:
        print(f"DB Error: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(diagnostic())
