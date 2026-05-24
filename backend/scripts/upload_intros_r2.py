import asyncio
import sys
import os
import time
from pathlib import Path

# Thêm đường dẫn backend vào sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.db.database import async_session
from app.db.tables import Location, Mascot
from app.ai.tts_engine import CONTENT_TYPE_MP3, synthesize
from app.services import storage_service

async def upload_intros():
    print(f"🚀 Bắt đầu sinh Audio và Upload lên R2...")
    
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
            if not loc.intro_message:
                print(f"⚠️ Skipping {loc.slug} - No intro message.")
                continue

            voice_name = "Leda"
            voice_style = "soft, cheerful, and youthful like a college student"
            
            if loc.mascot:
                voice_name = loc.mascot.voice_name
                voice_style = loc.mascot.voice_style
            
            print(f"⏳ Generating audio for: {loc.name} ({loc.slug}) with voice {voice_name}")
            try:
                # Gọi API TTS
                tts_result = await synthesize(
                    text=loc.intro_message,
                    voice_name=voice_name,
                    voice_style=voice_style,
                )
                
                # Upload lên R2
                extension = "mp3" if tts_result.content_type == CONTENT_TYPE_MP3 else "wav"
                r2_key = storage_service.build_intro_key(loc.slug, extension)
                await storage_service.upload_file(
                    file_bytes=tts_result.audio_data,
                    key=r2_key,
                    content_type=tts_result.content_type,
                    cache_control="no-cache, no-store, must-revalidate",
                )
                
                public_url = f"{storage_service.get_public_url(r2_key)}?v={int(time.time())}"
                
                # Update DB
                loc.intro_audio_url = public_url
                print(f"✅ Uploaded to {public_url}")
                
                # Sleep nhỏ để tránh bị rate limit
                await asyncio.sleep(0.5)
            except Exception as e:
                print(f"❌ Error generating/uploading audio for {loc.slug}: {e}")
                
        await session.commit()
        print("🎉 Hoàn thành cập nhật Audio Intro cho các khu vực!")

if __name__ == "__main__":
    asyncio.run(upload_intros())
