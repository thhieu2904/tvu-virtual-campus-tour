import asyncio
import sys
import os

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from sqlalchemy import text
from app.db.database import engine
from app.config import get_settings

settings = get_settings()

async def run_migration():
    print("⏳ Connecting to Database...")
    try:
        async with engine.begin() as conn:
            # Create mascots table if not exists (should be done by migrate.py, but just to be sure)
            # Actually we assume migrate.py was run.
            
            # 1. Insert default mascot
            print("👤 Seeding default Mascot (Trà Lê)...")
            model_url = f"{settings.R2_PUBLIC_URL}/mascots/character_1.glb" if hasattr(settings, 'R2_PUBLIC_URL') else "https://tvu-tour-v1.aic-rag.site/mascots/character_1.glb"
            
            import uuid
            new_id = str(uuid.uuid4())
            result = await conn.execute(text(
                "INSERT INTO mascots (id, name, slug, model_3d_url, voice_name, voice_style, personality_prompt, is_default) "
                "VALUES (:id, 'Trà Lê', 'tra-le', :url, 'Kore', 'Nói bằng giọng thân thiện, ấm áp, rõ ràng như hướng dẫn viên du lịch đại học', 'Bạn là Trà Lê, mascot chính thức của Đại học Trà Vinh. Tính cách: thân thiện, nhiệt tình, yêu trường.', TRUE) "
                "ON CONFLICT (slug) DO UPDATE SET model_3d_url = EXCLUDED.model_3d_url "
                "RETURNING id;"
            ), {"id": new_id, "url": model_url})
            mascot_id = result.scalar()
            
            # 2. Update existing locations to point to this mascot
            print(f"🔗 Linking locations to mascot_id: {mascot_id}")
            await conn.execute(text("UPDATE locations SET mascot_id = :mascot_id WHERE mascot_id IS NULL"), {"mascot_id": mascot_id})
            
            # 3. Drop old columns
            print("🗑️ Dropping old columns (voice_config, avatar_model_url)...")
            await conn.execute(text("ALTER TABLE locations DROP COLUMN IF EXISTS voice_config CASCADE;"))
            await conn.execute(text("ALTER TABLE locations DROP COLUMN IF EXISTS avatar_model_url CASCADE;"))
            
            print("✅ Mascot migration completed successfully!")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run_migration())
