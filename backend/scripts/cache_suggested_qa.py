import asyncio
import os
import sys
import json
import hashlib

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import async_session
from app.db.tables import Location, SuggestedQuestion
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.services import rag_service, storage_service
from app.ai import tts_engine

async def cache_qa():
    print("🚀 Bắt đầu Pre-cache toàn bộ Câu hỏi gợi ý...")
    
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    os.makedirs(data_dir, exist_ok=True)
    cache_path = os.path.join(data_dir, "qa_cache.json")
    
    qa_cache = {}
    
    async with async_session() as session:
        result = await session.execute(
            select(Location)
            .where(Location.status == 'active')
            .options(
                selectinload(Location.suggested_questions),
                selectinload(Location.mascot)
            )
        )
        locations = result.scalars().all()
        
        for loc in locations:
            print(f"\n📍 Đang xử lý khu vực: {loc.name} (Mascot: {loc.mascot.name if loc.mascot else 'None'})")
            voice = loc.mascot.voice_name if loc.mascot else "vi-VN-Standard-A"
            
            for sq in sorted(loc.suggested_questions, key=lambda q: q.sort_order):
                print(f"  ❓ Câu hỏi: {sq.question}")
                
                # Check if it triggers a tool call (like navigation)
                # Currently we just let the AI handle it, but to force a tool call, the AI might output it.
                # Since this is a script, we'll just run process_query as a normal request.
                
                from app.db.tables import ChatSession
                import uuid
                
                cache_session_id = uuid.uuid4()
                new_session = ChatSession(id=cache_session_id)
                session.add(new_session)
                await session.commit()
                
                res = await rag_service.process_query(
                    session=session,
                    message=sq.question,
                    location_id=str(loc.id),
                    session_id=str(cache_session_id),
                    history=[],
                    location_name=loc.name,
                    personality_prompt=loc.mascot.personality_prompt if loc.mascot else None,
                    voice_style=loc.mascot.voice_style if loc.mascot else None,
                )
                
                answer_text = res.get("answer", "")
                if not answer_text or res.get("error"):
                    print(f"    ❌ Lỗi khi sinh câu trả lời: {res.get('error')}")
                    continue
                    
                print(f"    ✅ Đã có Text: {answer_text[:50]}...")
                
                # 2. Sinh Audio & Upload
                answer_hash = hashlib.md5(f"{answer_text}_{voice}".encode()).hexdigest()
                r2_key = f"global/cache/{answer_hash}.wav"
                
                audio_url = None
                
                is_cached = await storage_service.file_exists(r2_key)
                if is_cached:
                    audio_url = storage_service.get_public_url(r2_key)
                    print("    ✅ File audio đã có trên R2 (Cache trúng)")
                else:
                    try:
                        tts_result = await tts_engine.synthesize(text=answer_text, voice_name=voice)
                        await storage_service.upload_file(
                            file_bytes=tts_result.audio_data,
                            key=r2_key,
                            content_type="audio/wav"
                        )
                        audio_url = storage_service.get_public_url(r2_key)
                        print("    ✅ Đã tạo mới và upload Audio lên R2")
                    except Exception as e:
                        print(f"    ❌ Lỗi TTS hoặc R2: {e}")
                        continue
                        
                # 3. Lưu vào Cache Map
                cache_key = hashlib.md5(f"{sq.question}_{loc.name}".encode()).hexdigest()
                qa_cache[cache_key] = {
                    "answer": answer_text,
                    "audio_url": audio_url,
                    "tool_actions": res.get("tool_actions", []),
                    "audio_base64": None,
                    "question": sq.question,  # Thêm vào để debug dễ nhìn
                    "location": loc.name
                }
                
    # Ghi ra file JSON
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(qa_cache, f, ensure_ascii=False, indent=2)
        
    print(f"\n🎉 Hoàn tất! Đã lưu cache cho {len(qa_cache)} câu hỏi gợi ý vào {cache_path}")

if __name__ == "__main__":
    asyncio.run(cache_qa())
