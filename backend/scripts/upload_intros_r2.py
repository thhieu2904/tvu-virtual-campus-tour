import asyncio
import sys
import os

# Thêm đường dẫn backend vào sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.db.database import async_session
from app.db.tables import Location
from app.services import location_audio_service

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
            personality_prompt = ""
            
            if loc.mascot:
                voice_name = loc.mascot.voice_name
                voice_style = loc.mascot.voice_style
                personality_prompt = loc.mascot.personality_prompt
            
            print(f"⏳ Generating audio for: {loc.name} ({loc.slug}) with voice {voice_name}")
            try:
                intro_audio = await location_audio_service.synthesize_location_audio(
                    text=loc.intro_message,
                    location_slug=loc.slug,
                    kind="intro",
                    voice=voice_name,
                    style=voice_style or "",
                    persona=personality_prompt or "",
                )
                revisit_audio = await location_audio_service.synthesize_location_audio(
                    text=location_audio_service.build_revisit_audio_text(loc.name),
                    location_slug=loc.slug,
                    kind="revisit",
                    voice=voice_name,
                    style=voice_style or "",
                    persona=personality_prompt or "",
                )
                loc.intro_audio_url = intro_audio.audio_url
                loc.revisit_audio_url = revisit_audio.audio_url
                print(f"✅ Uploaded intro to {intro_audio.audio_url}")
                print(f"✅ Uploaded revisit to {revisit_audio.audio_url}")
                
                # Sleep nhỏ để tránh bị rate limit
                await asyncio.sleep(0.5)
            except Exception as e:
                print(f"❌ Error generating/uploading audio for {loc.slug}: {e}")
                
        await session.commit()
        print("🎉 Hoàn thành cập nhật Audio Intro cho các khu vực!")

if __name__ == "__main__":
    asyncio.run(upload_intros())
