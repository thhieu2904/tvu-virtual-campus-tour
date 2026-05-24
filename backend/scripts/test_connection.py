import asyncio
import os
import sys
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.db.database import get_db
from sqlalchemy import text

load_dotenv()

async def main():
    try:
        # Use existing configured get_db that handles Supabase SSL & Pooler correctly
        async for session in get_db():
            res = await session.execute(text("SELECT 1"))
            if res.scalar() == 1:
                print("✅ Kết nối CSDL bằng mật khẩu mới THÀNH CÔNG!")
                break
    except Exception as e:
        print(f"❌ Lỗi kết nối: {e}")

if __name__ == "__main__":
    asyncio.run(main())
