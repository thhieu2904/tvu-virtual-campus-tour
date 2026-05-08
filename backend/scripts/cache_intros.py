import asyncio
import sys
import os
from pathlib import Path

# Thêm đường dẫn backend vào sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.db.database import async_session
from app.db.tables import Location, Mascot
from app.ai.tts_engine import synthesize

# Đường dẫn thư mục chứa audio của frontend
FRONTEND_AUDIO_DIR = Path(__file__).parent.parent.parent / "frontend" / "public" / "audio" / "intros"

async def cache_intros():
    print(f"🚀 Starting intro caching to: {FRONTEND_AUDIO_DIR}")
    
    # Tạo thư mục nếu chưa có
    FRONTEND_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    
    async with async_session() as session:
        result = await session.execute(
            select(Location)
            .where(Location.status == 'active')
            .options(selectinload(Location.mascot))
        )
        locations = result.scalars().all()
        
        if not locations:
            print("❌ No active locations found.")
            return

        for loc in locations:
            # Fetch mascot directly or fallback to default
            voice_name = "vi-VN-Standard-A"
            voice_style = "Friendly and welcoming"
            
            if loc.mascot:
                voice_name = loc.mascot.voice_name
                voice_style = loc.mascot.voice_style
            
            file_path = FRONTEND_AUDIO_DIR / f"{loc.slug}.wav"
            
            # Bỏ qua nếu file đã tồn tại
            if file_path.exists():
                print(f"⏭️ Skipping {loc.slug} - Audio already exists.")
                continue
                
            if not loc.intro_message:
                print(f"⚠️ Skipping {loc.slug} - No intro message.")
                continue

            print(f"⏳ Generating audio for: {loc.name} ({loc.slug})")
            try:
                # Gọi API TTS
                tts_result = await synthesize(
                    text=loc.intro_message,
                    voice_name=voice_name,
                    voice_style=voice_style
                )
                
                # Lưu file
                with open(file_path, "wb") as f:
                    f.write(tts_result.audio_data)
                
                print(f"✅ Saved {file_path.name}")
                # Sleep nhỏ để tránh bị rate limit
                await asyncio.sleep(0.5)
            except Exception as e:
                print(f"❌ Error generating audio for {loc.slug}: {e}")

if __name__ == "__main__":
    asyncio.run(cache_intros())
