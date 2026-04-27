import asyncio
import os
import sys
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from dotenv import load_dotenv

load_dotenv()

# Setup paths
BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

async def cleanup_db():
    DATABASE_URL = os.environ.get("DATABASE_URL")
    if DATABASE_URL and "6543" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("6543", "5432")
    
    if not DATABASE_URL.startswith("postgresql+asyncpg://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

    engine = create_async_engine(DATABASE_URL)
    
    async with engine.begin() as conn:
        print("Dropping redundant columns map_x and map_y from 'locations' table...")
        await conn.execute(text("ALTER TABLE locations DROP COLUMN IF EXISTS map_x;"))
        await conn.execute(text("ALTER TABLE locations DROP COLUMN IF EXISTS map_y;"))
        
        print("Dropping redundant column path_points from 'location_links' table...")
        await conn.execute(text("ALTER TABLE location_links DROP COLUMN IF EXISTS path_points;"))
        
    print("Database cleanup complete. Single Source of Truth for coordinates is now nav_graph.json.")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(cleanup_db())
