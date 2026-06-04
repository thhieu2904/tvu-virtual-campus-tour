"""Regenerate TTS audio with the current pronunciation rewrite rules.

Default behavior regenerates location intro/revisit audio only. Use
``--scope all`` to also rebuild suggested-question QA audio cache entries.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.ai import tts_engine
from app.db.database import async_session
from app.db.tables import Location
from app.services import location_audio_service, rag_service, storage_service


DEFAULT_VOICE = "Leda"
DEFAULT_STYLE = "soft, cheerful, and youthful like a college student"
QA_CACHE_PATH = Path(__file__).resolve().parents[1] / "data" / "qa_cache.json"


@dataclass(frozen=True)
class VoiceConfig:
    voice: str
    style: str
    persona: str


@dataclass
class RunStats:
    generated: int = 0
    skipped: int = 0
    failed: int = 0
    seen: int = 0


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Regenerate location and/or suggested QA audio with the current "
            "TTS rewrite/style/persona rules."
        )
    )
    parser.add_argument(
        "--scope",
        choices=("locations", "qa", "all"),
        default="locations",
        help="Audio scope to regenerate. Default: locations.",
    )
    parser.add_argument(
        "--location-slug",
        action="append",
        dest="location_slugs",
        help="Limit to one slug. Can be repeated.",
    )
    parser.add_argument(
        "--question",
        help="When scope includes qa, cache only one exact suggested question.",
    )
    parser.add_argument(
        "--include-inactive",
        action="store_true",
        help="Include inactive locations. Default only processes active locations.",
    )
    parser.add_argument(
        "--qa-mode",
        choices=("rebuild", "patch"),
        default="rebuild",
        help="For qa scope, rebuild starts qa_cache.json from empty. Default: rebuild.",
    )
    parser.add_argument(
        "--allow-edge",
        action="store_true",
        help="Allow saving Edge TTS fallback audio. Default rejects non-Gemini audio.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be regenerated without calling RAG/TTS or writing files.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Delay in seconds between TTS calls. Default: 0.5.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Stop after this many locations/questions per selected scope.",
    )
    return parser.parse_args()


def _load_existing_qa_cache() -> dict:
    if not QA_CACHE_PATH.exists():
        return {}
    with QA_CACHE_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)
    return data if isinstance(data, dict) else {}


def _write_qa_cache(cache: dict) -> None:
    QA_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = QA_CACHE_PATH.with_suffix(".json.tmp")
    with temp_path.open("w", encoding="utf-8") as file:
        json.dump(cache, file, ensure_ascii=False, indent=2)
        file.write("\n")
    os.replace(temp_path, QA_CACHE_PATH)


def _voice_for_location(location: Location) -> VoiceConfig:
    if location.mascot:
        return VoiceConfig(
            voice=location.mascot.voice_name or DEFAULT_VOICE,
            style=location.mascot.voice_style or "",
            persona=location.mascot.personality_prompt or "",
        )
    return VoiceConfig(voice=DEFAULT_VOICE, style=DEFAULT_STYLE, persona="")


def _build_location_stmt(args: argparse.Namespace):
    stmt = (
        select(Location)
        .options(
            selectinload(Location.mascot),
            selectinload(Location.suggested_questions),
        )
        .order_by(Location.sort_order, Location.name)
    )
    if not args.include_inactive:
        stmt = stmt.where(Location.status == "active")
    if args.location_slugs:
        stmt = stmt.where(Location.slug.in_(args.location_slugs))
    return stmt


def _audio_extension(content_type: str) -> str:
    return "mp3" if content_type == tts_engine.CONTENT_TYPE_MP3 else "wav"


def _location_audio_key(slug: str, kind: Literal["intro", "revisit"], extension: str) -> str:
    if kind == "revisit":
        return storage_service.build_revisit_key(slug, extension)
    return storage_service.build_intro_key(slug, extension)


async def _synthesize_gated(
    *,
    text: str,
    voice_config: VoiceConfig,
    allow_edge: bool,
):
    result = await tts_engine.synthesize(
        text=text,
        voice_name=voice_config.voice,
        voice_style=voice_config.style,
        personality_prompt=voice_config.persona,
    )
    if not allow_edge and result.provider != "gemini":
        raise RuntimeError(
            f"TTS provider was {result.provider}; audio was not saved. "
            "Retry later or pass --allow-edge if fallback audio is acceptable."
        )
    return result


async def _upload_location_audio(
    *,
    slug: str,
    kind: Literal["intro", "revisit"],
    audio_data: bytes,
    content_type: str,
) -> str:
    extension = _audio_extension(content_type)
    r2_key = _location_audio_key(slug, kind, extension)
    await storage_service.upload_file(
        file_bytes=audio_data,
        key=r2_key,
        content_type=content_type,
        cache_control=location_audio_service.LOCATION_AUDIO_CACHE_CONTROL,
    )
    return f"{storage_service.get_public_url(r2_key)}?v={int(time.time())}"


def _print_rewrite_preview(label: str, text: str) -> None:
    rewritten = tts_engine.rewrite_tts_text(text)
    if rewritten != text:
        print(f"    {label} rewrite: {rewritten}")


async def regenerate_locations(session, args: argparse.Namespace) -> RunStats:
    result = await session.execute(_build_location_stmt(args))
    locations = result.scalars().all()
    stats = RunStats()

    print(f"Location audio: {len(locations)} location(s) selected")
    for location in locations:
        if args.limit is not None and stats.seen >= args.limit:
            break
        stats.seen += 1

        intro_text = (location.intro_message or "").strip()
        if not intro_text:
            print(f"- skip {location.slug}: intro_message is empty")
            stats.skipped += 1
            continue

        voice_config = _voice_for_location(location)
        revisit_text = location_audio_service.build_revisit_audio_text(location.name)
        print(f"- regenerate {location.slug}: voice={voice_config.voice} style_set={bool(voice_config.style)}")
        _print_rewrite_preview("intro", intro_text)
        _print_rewrite_preview("revisit", revisit_text)

        if args.dry_run:
            stats.skipped += 1
            continue

        try:
            intro_result = await _synthesize_gated(
                text=intro_text,
                voice_config=voice_config,
                allow_edge=args.allow_edge,
            )
            await asyncio.sleep(max(args.delay, 0))
            revisit_result = await _synthesize_gated(
                text=revisit_text,
                voice_config=voice_config,
                allow_edge=args.allow_edge,
            )

            location.intro_audio_url = await _upload_location_audio(
                slug=location.slug,
                kind="intro",
                audio_data=intro_result.audio_data,
                content_type=intro_result.content_type,
            )
            location.revisit_audio_url = await _upload_location_audio(
                slug=location.slug,
                kind="revisit",
                audio_data=revisit_result.audio_data,
                content_type=revisit_result.content_type,
            )
            await session.commit()
            stats.generated += 1
            print(f"    saved intro: {location.intro_audio_url}")
            print(f"    saved revisit: {location.revisit_audio_url}")
            await asyncio.sleep(max(args.delay, 0))
        except Exception as exc:
            await session.rollback()
            stats.failed += 1
            print(f"    failed {location.slug}: {exc}")

    return stats


async def rebuild_qa_cache(session, args: argparse.Namespace) -> RunStats:
    result = await session.execute(_build_location_stmt(args))
    locations = result.scalars().all()
    cache = {} if args.qa_mode == "rebuild" else _load_existing_qa_cache()
    stats = RunStats()

    print(f"QA audio: {len(locations)} location(s) selected; mode={args.qa_mode}")
    for location in locations:
        questions = sorted(location.suggested_questions, key=lambda q: q.sort_order)
        if args.question:
            questions = [question for question in questions if question.question == args.question]

        if not questions:
            print(f"- skip {location.slug}: no matching suggested questions")
            stats.skipped += 1
            continue

        voice_config = _voice_for_location(location)
        print(f"- cache QA for {location.slug}: {len(questions)} question(s)")
        for suggested_question in questions:
            if args.limit is not None and stats.seen >= args.limit:
                break
            stats.seen += 1

            print(f"    question: {suggested_question.question}")
            if args.dry_run:
                stats.skipped += 1
                continue

            try:
                response = await rag_service.process_query(
                    session=session,
                    message=suggested_question.question,
                    location_id=str(location.id),
                    session_id=None,
                    history=[],
                    location_name=location.name,
                    personality_prompt=voice_config.persona or None,
                    voice_style=voice_config.style or None,
                )
                answer_text = str(response.get("answer") or "").strip()
                if not answer_text or response.get("error"):
                    raise RuntimeError(f"RAG failed: {response.get('error')}")

                _print_rewrite_preview("answer", answer_text)
                tts_result = await _synthesize_gated(
                    text=answer_text,
                    voice_config=voice_config,
                    allow_edge=args.allow_edge,
                )
                answer_hash = tts_engine._cache_key(
                    answer_text,
                    voice_config.voice,
                    voice_config.style,
                    voice_config.persona,
                )
                extension = _audio_extension(tts_result.content_type)
                r2_key = f"tts-cache/{answer_hash}.{extension}"
                await storage_service.upload_file(
                    file_bytes=tts_result.audio_data,
                    key=r2_key,
                    content_type=tts_result.content_type,
                )

                cache_key = hashlib.md5(f"{suggested_question.question}_{location.name}".encode()).hexdigest()
                cache[cache_key] = {
                    "answer": answer_text,
                    "audio_url": storage_service.get_public_url(r2_key),
                    "audio_base64": None,
                    "tool_actions": response.get("tool_actions", []),
                    "question": suggested_question.question,
                    "location": location.name,
                    "location_slug": location.slug,
                    "voice_name": voice_config.voice,
                    "tts_provider": tts_result.provider,
                    "tts_prompt_version": tts_engine.TTS_PROMPT_VERSION,
                }
                stats.generated += 1
                print(f"      saved: {r2_key}")
                await asyncio.sleep(max(args.delay, 0))
            except Exception as exc:
                await session.rollback()
                stats.failed += 1
                print(f"      failed: {exc}")

    if not args.dry_run:
        _write_qa_cache(cache)
        print(f"QA cache written: {QA_CACHE_PATH} ({len(cache)} entries)")

    return stats


async def main() -> None:
    args = _parse_args()
    print(f"TTS prompt version: {tts_engine.TTS_PROMPT_VERSION}")
    print(f"Scope: {args.scope}; allow_edge={args.allow_edge}; dry_run={args.dry_run}")

    async with async_session() as session:
        if args.scope in ("locations", "all"):
            location_stats = await regenerate_locations(session, args)
            print(
                "Location summary: "
                f"generated={location_stats.generated} "
                f"skipped={location_stats.skipped} "
                f"failed={location_stats.failed}"
            )

        if args.scope in ("qa", "all"):
            qa_stats = await rebuild_qa_cache(session, args)
            print(
                "QA summary: "
                f"generated={qa_stats.generated} "
                f"skipped={qa_stats.skipped} "
                f"failed={qa_stats.failed}"
            )


if __name__ == "__main__":
    asyncio.run(main())
