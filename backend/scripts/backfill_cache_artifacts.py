"""Backfill cache_artifacts from existing DB rows and qa_cache.json.

This script intentionally does not call RAG/TTS, mutate qa_cache.json, upload
files, or create chat analytics. It only records artifacts that already exist.

Run from backend/:
    python -m scripts.backfill_cache_artifacts
    python -m scripts.backfill_cache_artifacts --execute
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.ai import tts_engine  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db.database import async_session  # noqa: E402
from app.db.tables import CacheArtifact, Location, Mascot  # noqa: E402
from app.services import cache_fingerprint_service as fingerprints  # noqa: E402
from app.services import storage_service  # noqa: E402

BACKEND_ROOT = Path(__file__).resolve().parents[1]
QA_CACHE_PATH = BACKEND_ROOT / "data" / "qa_cache.json"

VoiceStatus = Literal["match", "mismatch", "unknown"]


@dataclass
class BackfillStats:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    skipped: int = 0
    unmatched: int = 0


@dataclass(frozen=True)
class ExistingAudio:
    storage_url: str
    r2_key: str
    content_type: str
    cache_key_kind: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill cache_artifacts without calling RAG/TTS.")
    parser.add_argument("--execute", action="store_true", help="Write cache_artifacts rows. Default is dry-run.")
    parser.add_argument("--location-slug", help="Only process one location slug.")
    parser.add_argument("--mascot-slug", help="Only process one mascot slug.")
    parser.add_argument("--force", action="store_true", help="Overwrite existing cache_artifacts rows.")
    parser.add_argument("--verify-r2", action="store_true", help="HEAD-check existing R2 objects before import.")
    return parser.parse_args()


def now() -> datetime:
    return datetime.now(timezone.utc)


def load_qa_cache(path: Path = QA_CACHE_PATH) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {}
    return {str(key): value for key, value in data.items() if isinstance(value, dict)}


def current_location_voice(location: Location) -> tuple[str, str, str]:
    settings = get_settings()
    mascot = location.mascot
    if not mascot:
        return settings.GEMINI_DEFAULT_VOICE, "", ""
    return (
        mascot.voice_name or settings.GEMINI_DEFAULT_VOICE,
        mascot.voice_style or "",
        mascot.personality_prompt or "",
    )


def qa_entry_voice_status(entry: dict[str, Any], current_voice: str) -> VoiceStatus:
    entry_voice = str(entry.get("voice_name") or "").strip()
    if not entry_voice:
        return "unknown"
    return "match" if entry_voice == current_voice else "mismatch"


def normalize_audio_key(audio_url: str | None) -> str | None:
    if not audio_url:
        return None
    value = str(audio_url).strip()
    if not value or value.startswith("data:"):
        return None
    return storage_service.normalize_object_key(value)


async def r2_exists(key: str) -> tuple[bool, str | None]:
    try:
        return await storage_service.file_exists(key), None
    except Exception as exc:  # R2 access should not crash the whole report.
        return False, str(exc)


def content_type_for_key(key: str) -> str:
    return tts_engine.CONTENT_TYPE_MP3 if key.lower().endswith(".mp3") else tts_engine.CONTENT_TYPE_WAV


def mascot_intro_text(mascot: Mascot) -> str:
    return (
        f"Xin chào, mình là {mascot.name}. "
        "Mình sẽ đồng hành cùng bạn trong chuyến tham quan Đại học Trà Vinh hôm nay."
    )


def tts_cache_candidates(text: str, voice: str, style: str, persona: str) -> list[tuple[str, str]]:
    current_hash = tts_engine.cache_key(text, voice, style, persona)
    legacy_hash = tts_engine.legacy_cache_key(text, voice, style, persona)
    candidates: list[tuple[str, str]] = []
    for key_hash, kind in ((current_hash, "sha256"), (legacy_hash, "legacy-md5")):
        if candidates and key_hash == current_hash:
            continue
        candidates.append((f"tts-cache/{key_hash}.wav", kind))
        candidates.append((f"tts-cache/{key_hash}.mp3", kind))
    return candidates


async def find_existing_mascot_intro_audio(mascot: Mascot) -> ExistingAudio | None:
    text = mascot_intro_text(mascot)
    voice = mascot.voice_name or get_settings().GEMINI_DEFAULT_VOICE
    style = mascot.voice_style or ""
    persona = mascot.personality_prompt or ""
    for key, key_kind in tts_cache_candidates(text, voice, style, persona):
        exists, _error = await r2_exists(key)
        if exists:
            return ExistingAudio(
                storage_url=storage_service.get_public_url(key),
                r2_key=key,
                content_type=content_type_for_key(key),
                cache_key_kind=key_kind,
            )
    return None


async def upsert_artifact(
    session: AsyncSession,
    *,
    execute: bool,
    force: bool,
    stats: BackfillStats,
    artifact_type: str,
    scope: str,
    target_id: UUID,
    item_key: str,
    fingerprint: str,
    storage_url: str | None,
    cache_key: str | None,
    metadata: dict[str, Any],
) -> str:
    result = await session.execute(
        select(CacheArtifact).where(
            CacheArtifact.artifact_type == artifact_type,
            CacheArtifact.item_key == item_key,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None and not force:
        stats.unchanged += 1
        return "EXISTS"

    action = "UPDATE" if existing is not None else "CREATE"
    if existing is None:
        stats.created += 1
    else:
        stats.updated += 1

    if not execute:
        return f"WOULD_{action}"

    artifact = existing
    if artifact is None:
        artifact = CacheArtifact(
            artifact_type=artifact_type,
            scope=scope,
            target_id=target_id,
            item_key=item_key,
        )
        session.add(artifact)

    artifact.fingerprint = fingerprint
    artifact.storage_url = storage_url
    artifact.cache_key = cache_key
    artifact.metadata_ = metadata
    artifact.updated_at = now()
    await session.flush()
    return action


def print_line(prefix: str, label: str, result: str, detail: str = "") -> None:
    suffix = f" ({detail})" if detail else ""
    print(f"   {prefix} {label} -> {result}{suffix}")


async def process_location_intro(
    session: AsyncSession,
    location: Location,
    args: argparse.Namespace,
    stats: BackfillStats,
) -> None:
    item = fingerprints.build_location_intro_item(location)
    if item is None:
        if location.intro_audio_url:
            stats.skipped += 1
            print_line("⚠️", "location_intro_audio", "SKIP", "location is not cacheable by current worker contract")
        return

    if not location.intro_audio_url:
        stats.unmatched += 1
        print_line("❌", "location_intro_audio", "INTRO_URL_MISSING")
        return

    intro_key = normalize_audio_key(location.intro_audio_url)
    if not intro_key:
        stats.unmatched += 1
        print_line("❌", "location_intro_audio", "INVALID_AUDIO_URL")
        return

    if args.verify_r2:
        exists, error = await r2_exists(intro_key)
        if not exists:
            stats.unmatched += 1
            print_line("❌", "location_intro_audio", "R2_NOT_FOUND", error or intro_key)
            return

    voice, style, _persona = current_location_voice(location)
    metadata = {
        **(item.metadata or {}),
        "intro_audio_url": location.intro_audio_url,
        "intro_cache_key": intro_key,
        "revisit_audio_url": location.revisit_audio_url,
        "revisit_cache_key": normalize_audio_key(location.revisit_audio_url),
        "voice_name": voice,
        "voice_style": style,
        "backfilled_by": "scripts.backfill_cache_artifacts",
    }
    action = await upsert_artifact(
        session,
        execute=args.execute,
        force=args.force,
        stats=stats,
        artifact_type=item.artifact_type,
        scope="location",
        target_id=location.id,
        item_key=item.item_key,
        fingerprint=item.fingerprint,
        storage_url=location.intro_audio_url,
        cache_key=intro_key,
        metadata=metadata,
    )
    print_line("✅", "location_intro_audio", action, "intro_audio_url matched")


async def process_location_qa(
    session: AsyncSession,
    location: Location,
    qa_cache: dict[str, dict[str, Any]],
    args: argparse.Namespace,
    stats: BackfillStats,
) -> None:
    voice, style, _persona = current_location_voice(location)
    items = fingerprints.build_location_qa_items(location)
    item_map = {(item.artifact_type, item.item_key): item for item in items}

    for question in fingerprints.sorted_questions(location):
        question_text = str(question.question or "").strip()
        if not question_text:
            continue
        qa_cache_key = fingerprints.qa_cache_lookup_key(question_text, location.name)
        item_key = fingerprints.qa_item_key(location.id, question_text, location.name)
        answer_item = item_map[("qa_answer", item_key)]
        audio_item = item_map[("qa_audio", item_key)]
        entry = qa_cache.get(qa_cache_key)

        if not entry:
            stats.unmatched += 2
            print_line("❌", f'qa_answer "{question_text}"', "QA_CACHE_KEY_MISS", qa_cache_key)
            print_line("❌", f'qa_audio "{question_text}"', "SKIP", "missing qa_answer")
            continue

        answer = str(entry.get("answer") or "").strip()
        if not answer:
            stats.unmatched += 2
            print_line("❌", f'qa_answer "{question_text}"', "ANSWER_EMPTY")
            print_line("❌", f'qa_audio "{question_text}"', "SKIP", "missing answer")
            continue

        voice_status = qa_entry_voice_status(entry, voice)
        if voice_status == "mismatch":
            stats.skipped += 2
            cache_voice = str(entry.get("voice_name") or "").strip()
            print_line("⚠️", f'qa_answer "{question_text}"', "VOICE_MISMATCH", f"cache={cache_voice}, current={voice}")
            print_line("⚠️", f'qa_audio "{question_text}"', "SKIP", "qa_answer voice mismatch")
            continue

        base_metadata = {
            **(answer_item.metadata or {}),
            "question": question_text,
            "sort_order": int(getattr(question, "sort_order", 0) or 0),
            "qa_cache_key": qa_cache_key,
            "location_slug": location.slug,
            "voice_name": voice,
            "voice_style": style,
            "cache_voice_name": entry.get("voice_name"),
            "cache_voice_status": voice_status,
            "answer_length": len(answer),
            "tool_actions_count": len(entry.get("tool_actions") or []),
            "backfilled_by": "scripts.backfill_cache_artifacts",
        }
        answer_action = await upsert_artifact(
            session,
            execute=args.execute,
            force=args.force,
            stats=stats,
            artifact_type=answer_item.artifact_type,
            scope="location",
            target_id=location.id,
            item_key=answer_item.item_key,
            fingerprint=answer_item.fingerprint,
            storage_url=None,
            cache_key=qa_cache_key,
            metadata=base_metadata,
        )
        detail = "qa_cache hit" if voice_status == "match" else "qa_cache hit, cache voice unknown"
        print_line("✅", f'qa_answer "{question_text}"', answer_action, detail)

        audio_url = str(entry.get("audio_url") or "").strip()
        audio_key = normalize_audio_key(audio_url)
        if not audio_url or not audio_key:
            stats.unmatched += 1
            print_line("❌", f'qa_audio "{question_text}"', "AUDIO_URL_MISSING")
            continue
        if not audio_key.startswith("tts-cache/"):
            stats.unmatched += 1
            print_line("❌", f'qa_audio "{question_text}"', "INVALID_TTS_CACHE_KEY", audio_key)
            continue
        if args.verify_r2:
            exists, error = await r2_exists(audio_key)
            if not exists:
                stats.unmatched += 1
                print_line("❌", f'qa_audio "{question_text}"', "R2_NOT_FOUND", error or audio_key)
                continue

        audio_action = await upsert_artifact(
            session,
            execute=args.execute,
            force=args.force,
            stats=stats,
            artifact_type=audio_item.artifact_type,
            scope="location",
            target_id=location.id,
            item_key=audio_item.item_key,
            fingerprint=audio_item.fingerprint,
            storage_url=audio_url,
            cache_key=audio_key,
            metadata={
                **base_metadata,
                "audio_url": audio_url,
                "content_type": content_type_for_key(audio_key),
            },
        )
        print_line("✅", f'qa_audio "{question_text}"', audio_action, audio_key)


async def process_location(
    session: AsyncSession,
    location: Location,
    qa_cache: dict[str, dict[str, Any]],
    args: argparse.Namespace,
    stats: BackfillStats,
) -> None:
    print(f"\n📍 Địa điểm: {location.name} ({location.slug})")
    await process_location_intro(session, location, args, stats)
    await process_location_qa(session, location, qa_cache, args, stats)


async def process_mascot(
    session: AsyncSession,
    mascot: Mascot,
    args: argparse.Namespace,
    stats: BackfillStats,
) -> None:
    print(f"\n🤖 Đại sứ ảo: {mascot.name} ({mascot.slug})")
    item = fingerprints.build_mascot_intro_item(mascot)
    audio = await find_existing_mascot_intro_audio(mascot)
    if audio is None:
        stats.unmatched += 1
        print_line("❌", "intro_audio", "R2_NOT_FOUND", "no sha256/legacy wav/mp3 candidate matched")
        return

    metadata = {
        **(item.metadata or {}),
        "intro_text": mascot_intro_text(mascot),
        "voice_name": mascot.voice_name or get_settings().GEMINI_DEFAULT_VOICE,
        "voice_style": mascot.voice_style or "",
        "content_type": audio.content_type,
        "cache_key_kind": audio.cache_key_kind,
        "backfilled_by": "scripts.backfill_cache_artifacts",
    }
    action = await upsert_artifact(
        session,
        execute=args.execute,
        force=args.force,
        stats=stats,
        artifact_type=item.artifact_type,
        scope="mascot",
        target_id=mascot.id,
        item_key=item.item_key,
        fingerprint=item.fingerprint,
        storage_url=audio.storage_url,
        cache_key=audio.r2_key,
        metadata=metadata,
    )
    print_line("✅", "intro_audio", action, audio.r2_key)


async def load_locations(session: AsyncSession, location_slug: str | None) -> list[Location]:
    stmt = select(Location).options(selectinload(Location.suggested_questions), selectinload(Location.mascot))
    if location_slug:
        stmt = stmt.where(Location.slug == location_slug)
    stmt = stmt.order_by(Location.sort_order, Location.name)
    return list((await session.execute(stmt)).scalars().all())


async def load_mascots(session: AsyncSession, mascot_slug: str | None) -> list[Mascot]:
    stmt = select(Mascot)
    if mascot_slug:
        stmt = stmt.where(Mascot.slug == mascot_slug)
    stmt = stmt.order_by(Mascot.created_at, Mascot.name)
    return list((await session.execute(stmt)).scalars().all())


async def run(args: argparse.Namespace) -> BackfillStats:
    stats = BackfillStats()
    qa_cache = load_qa_cache()
    mode = "EXECUTE" if args.execute else "DRY RUN"
    print(f"📦 Backfill Cache Artifacts ({mode})")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"QA cache entries: {len(qa_cache)}")
    if args.verify_r2:
        print("R2 verification: enabled")

    process_locations = args.location_slug is not None or args.mascot_slug is None
    process_mascots = args.mascot_slug is not None or args.location_slug is None

    async with async_session() as session:
        if process_locations:
            locations = await load_locations(session, args.location_slug)
            if args.location_slug and not locations:
                stats.unmatched += 1
                print(f"\n❌ Không tìm thấy địa điểm slug={args.location_slug}")
            for location in locations:
                await process_location(session, location, qa_cache, args, stats)

        if process_mascots:
            mascots = await load_mascots(session, args.mascot_slug)
            if args.mascot_slug and not mascots:
                stats.unmatched += 1
                print(f"\n❌ Không tìm thấy mascot slug={args.mascot_slug}")
            for mascot in mascots:
                await process_mascot(session, mascot, args, stats)

        if args.execute:
            await session.commit()
        else:
            await session.rollback()

    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("Tổng kết:")
    print(f"  Created:   {stats.created}")
    print(f"  Updated:   {stats.updated}")
    print(f"  Existing:  {stats.unchanged}")
    print(f"  Skipped:   {stats.skipped}")
    print(f"  Unmatched: {stats.unmatched}")
    if not args.execute:
        print("\n⚠️  Đang ở chế độ DRY RUN. Thêm --execute để ghi DB thật.")
    return stats


def main() -> None:
    asyncio.run(run(parse_args()))


if __name__ == "__main__":
    main()
