import argparse
import asyncio
import hashlib
import json
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.ai import tts_engine
from app.db.database import async_session
from app.db.tables import Location
from app.services import rag_service, storage_service


def _load_existing_cache(cache_path: str) -> dict:
    if not os.path.exists(cache_path):
        return {}
    with open(cache_path, "r", encoding="utf-8") as file:
        data = json.load(file)
    return data if isinstance(data, dict) else {}


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pre-cache suggested QA entries without writing chat analytics.")
    parser.add_argument("--location-slug", help="Cache only one location slug.")
    parser.add_argument("--question", help="Cache only one exact suggested question.")
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Start with an empty qa_cache.json instead of patching existing entries.",
    )
    return parser.parse_args()


async def cache_qa() -> None:
    args = _parse_args()
    print("Starting suggested QA pre-cache...")

    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
    os.makedirs(data_dir, exist_ok=True)
    cache_path = os.path.join(data_dir, "qa_cache.json")

    qa_cache = {} if args.rebuild else _load_existing_cache(cache_path)
    changed_count = 0

    async with async_session() as session:
        stmt = (
            select(Location)
            .where(Location.status == "active")
            .options(
                selectinload(Location.suggested_questions),
                selectinload(Location.mascot),
            )
        )
        if args.location_slug:
            stmt = stmt.where(Location.slug == args.location_slug)

        result = await session.execute(stmt)
        locations = result.scalars().all()

        for loc in locations:
            print(f"\nLocation: {loc.name} ({loc.slug})")
            voice = loc.mascot.voice_name if loc.mascot else "Leda"
            voice_style = loc.mascot.voice_style if loc.mascot else "soft, cheerful, and youthful like a college student"
            personality_prompt = loc.mascot.personality_prompt if loc.mascot else ""

            questions = sorted(loc.suggested_questions, key=lambda q: q.sort_order)
            if args.question:
                questions = [sq for sq in questions if sq.question == args.question]

            for sq in questions:
                print(f"  Question: {sq.question}")

                res = await rag_service.process_query(
                    session=session,
                    message=sq.question,
                    location_id=str(loc.id),
                    session_id=None,
                    history=[],
                    location_name=loc.name,
                    personality_prompt=personality_prompt or None,
                    voice_style=voice_style or None,
                )

                answer_text = res.get("answer", "")
                if not answer_text or res.get("error"):
                    print(f"    Failed to generate answer: {res.get('error')}")
                    continue

                print(f"    Generated text: {answer_text[:70]}...")

                style = voice_style or ""
                answer_hash = tts_engine.cache_key(answer_text, voice, style, personality_prompt)
                legacy_answer_hash = tts_engine.legacy_cache_key(answer_text, voice, style, personality_prompt)
                r2_candidates = [
                    (f"tts-cache/{answer_hash}.wav", f"tts-cache/{answer_hash}.mp3"),
                ]
                if legacy_answer_hash != answer_hash:
                    r2_candidates.append(
                        (f"tts-cache/{legacy_answer_hash}.wav", f"tts-cache/{legacy_answer_hash}.mp3"),
                    )

                audio_url = None
                cached_r2_key = None
                for wav_r2_key, mp3_r2_key in r2_candidates:
                    if await storage_service.file_exists(wav_r2_key):
                        cached_r2_key = wav_r2_key
                        break
                    if await storage_service.file_exists(mp3_r2_key):
                        cached_r2_key = mp3_r2_key
                        break

                if cached_r2_key:
                    audio_url = storage_service.get_public_url(cached_r2_key)
                    print("    Audio exists in R2")
                else:
                    try:
                        tts_result = await tts_engine.synthesize(
                            text=answer_text,
                            voice_name=voice,
                            voice_style=voice_style,
                            personality_prompt=personality_prompt,
                        )
                        wav_r2_key, mp3_r2_key = r2_candidates[0]
                        r2_key = mp3_r2_key if tts_result.content_type == tts_engine.CONTENT_TYPE_MP3 else wav_r2_key
                        await storage_service.upload_file(
                            file_bytes=tts_result.audio_data,
                            key=r2_key,
                            content_type=tts_result.content_type,
                        )
                        audio_url = storage_service.get_public_url(r2_key)
                        print("    Generated and uploaded audio")
                    except Exception as e:
                        print(f"    TTS/R2 failed: {e}")
                        continue

                cache_key = hashlib.md5(f"{sq.question}_{loc.name}".encode()).hexdigest()
                qa_cache[cache_key] = {
                    "answer": answer_text,
                    "audio_url": audio_url,
                    "tool_actions": res.get("tool_actions", []),
                    "audio_base64": None,
                    "question": sq.question,
                    "location": loc.name,
                    "location_slug": loc.slug,
                    "voice_name": voice,
                }
                changed_count += 1

    temp_path = f"{cache_path}.tmp"
    with open(temp_path, "w", encoding="utf-8") as file:
        json.dump(qa_cache, file, ensure_ascii=False, indent=2)
        file.write("\n")
    os.replace(temp_path, cache_path)

    print(f"\nDone. Updated {changed_count} QA cache entries. Total entries: {len(qa_cache)}")
    print(f"Cache file: {cache_path}")


if __name__ == "__main__":
    asyncio.run(cache_qa())
