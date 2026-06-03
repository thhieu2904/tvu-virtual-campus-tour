"""In-process cache job worker for Admin Cache Phase 2B."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai import tts_engine
from app.ai.tts_engine import CONTENT_TYPE_MP3, CONTENT_TYPE_WAV
from app.cache import qa_cache_store, tts_key_cache
from app.db.database import async_session
from app.db.tables import CacheArtifact, CacheJob, CacheJobLog, Location, Mascot
from app.services import cache_fingerprint_service as fingerprints
from app.services import location_audio_service
from app.services import rag_service, storage_service

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[2]
QA_CACHE_PATH = BACKEND_ROOT / "data" / "qa_cache.json"
_qa_cache_file_lock = asyncio.Lock()


class CacheItemSkipped(Exception):
    """Raised when an item should be skipped without failing the whole job."""


@dataclass(frozen=True)
class CacheWorkItem:
    kind: str
    scope: str
    target_id: UUID
    item_key: str
    label: str
    location_id: UUID | None = None
    mascot_id: UUID | None = None
    question: str | None = None
    sort_order: int = 0
    qa_cache_key: str | None = None
    force: bool = False


def job_type_for(scope: str, focus: str) -> str:
    if scope == "mascot":
        return "mascot_intro_audio" if focus == "voice" else "mascot_dependent_cache"
    if scope == "location" and focus == "voice":
        return "location_qa_audio"
    if scope == "location":
        return "location_suggested_qa"
    return "cache_observability"


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def add_job_log(
    session: AsyncSession,
    job_id: UUID,
    level: str,
    message: str,
    item_key: str | None = None,
    payload: dict[str, Any] | None = None,
) -> CacheJobLog:
    log = CacheJobLog(
        job_id=job_id,
        level=level,
        message=message,
        item_key=item_key,
        payload=payload or {},
    )
    session.add(log)
    await session.flush()
    return log


async def _commit_log(
    job_id: UUID,
    level: str,
    message: str,
    item_key: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    async with async_session() as session:
        await add_job_log(session, job_id, level, message, item_key, payload)
        await session.commit()


async def _mark_job_started(job_id: UUID, total_items: int) -> bool:
    async with async_session() as session:
        job = await session.get(CacheJob, job_id)
        if not job or job.status == "cancelled":
            return False
        job.status = "running"
        job.total_items = total_items
        job.processed_items = 0
        job.failed_items = 0
        job.error_message = None
        job.started_at = _now()
        job.updated_at = _now()
        await add_job_log(session, job_id, "info", f"Job started with {total_items} item(s).")
        await session.commit()
        return True


async def _increment_progress(job_id: UUID, failed: bool) -> None:
    async with async_session() as session:
        job = await session.get(CacheJob, job_id)
        if not job:
            return
        job.processed_items += 1
        if failed:
            job.failed_items += 1
        job.updated_at = _now()
        await session.commit()


async def _is_cancelled(job_id: UUID) -> bool:
    async with async_session() as session:
        job = await session.get(CacheJob, job_id)
        return not job or job.status == "cancelled"


async def _finish_job(job_id: UUID) -> None:
    async with async_session() as session:
        job = await session.get(CacheJob, job_id)
        if not job:
            return
        if job.status == "cancelled":
            await add_job_log(session, job_id, "warning", "Job cancelled.")
        elif job.failed_items > 0:
            job.status = "failed"
            job.error_message = f"{job.failed_items} item(s) failed."
            await add_job_log(session, job_id, "error", job.error_message)
        else:
            job.status = "succeeded"
            await add_job_log(session, job_id, "info", "Job succeeded.")
        job.finished_at = _now()
        job.updated_at = _now()
        await session.commit()


async def _get_job(job_id: UUID) -> CacheJob | None:
    async with async_session() as session:
        return await session.get(CacheJob, job_id)


async def _load_location(session: AsyncSession, location_id: UUID) -> Location:
    result = await session.execute(
        select(Location)
        .where(Location.id == location_id)
        .options(selectinload(Location.suggested_questions), selectinload(Location.mascot))
    )
    location = result.scalar_one_or_none()
    if not location:
        raise ValueError(f"Location not found: {location_id}")
    return location


async def _dependent_locations(session: AsyncSession, mascot_id: UUID) -> list[Location]:
    result = await session.execute(
        select(Location)
        .where(Location.mascot_id == mascot_id, Location.status == "active")
        .options(selectinload(Location.suggested_questions), selectinload(Location.mascot))
        .order_by(Location.sort_order, Location.name)
    )
    return list(result.scalars().all())


async def _current_artifact_map(
    session: AsyncSession,
    items: list[fingerprints.CacheFingerprintItem],
) -> dict[tuple[str, str], CacheArtifact]:
    if not items:
        return {}
    result = await session.execute(
        select(CacheArtifact).where(
            CacheArtifact.artifact_type.in_({item.artifact_type for item in items}),
            CacheArtifact.item_key.in_({item.item_key for item in items}),
        )
    )
    return {
        (artifact.artifact_type, artifact.item_key): artifact
        for artifact in result.scalars().all()
    }


def _item_needs_work(
    item: fingerprints.CacheFingerprintItem,
    artifact_map: dict[tuple[str, str], CacheArtifact],
    force: bool,
) -> bool:
    if force:
        return True
    artifact = artifact_map.get((item.artifact_type, item.item_key))
    return artifact is None or artifact.fingerprint != item.fingerprint


async def _build_location_work_items(
    session: AsyncSession,
    location_id: UUID,
    focus: str,
    force: bool,
) -> list[CacheWorkItem]:
    location = await _load_location(session, location_id)
    fingerprint_items = []
    intro_item = fingerprints.build_location_intro_item(location)
    if intro_item:
        fingerprint_items.append(intro_item)
    fingerprint_items.extend(fingerprints.build_location_qa_items(location))
    artifact_map = await _current_artifact_map(session, fingerprint_items)
    work_items: list[CacheWorkItem] = []

    if intro_item and focus in {"voice", "all", "overview"} and _item_needs_work(intro_item, artifact_map, force):
        work_items.append(
            CacheWorkItem(
                kind="location_intro",
                scope="location",
                target_id=location.id,
                location_id=location.id,
                item_key=intro_item.item_key,
                label=intro_item.label,
                force=force,
            )
        )

    for question in fingerprints.sorted_questions(location):
        question_text = str(question.question).strip()
        if not question_text:
            continue
        sort_order = int(question.sort_order or 0)
        qa_cache_key = fingerprints.qa_cache_lookup_key(question_text, location.name)
        item_key = fingerprints.qa_item_key(location.id, question_text, location.name)
        answer_item = next(
            item for item in fingerprint_items
            if item.artifact_type == "qa_answer" and item.item_key == item_key
        )
        audio_item = next(
            item for item in fingerprint_items
            if item.artifact_type == "qa_audio" and item.item_key == item_key
        )

        if focus == "voice":
            if _item_needs_work(audio_item, artifact_map, force):
                work_items.append(
                    CacheWorkItem(
                        kind="location_qa_audio",
                        scope="location",
                        target_id=location.id,
                        location_id=location.id,
                        item_key=item_key,
                        label=question_text,
                        question=question_text,
                        sort_order=sort_order,
                        qa_cache_key=qa_cache_key,
                    )
                )
            continue

        if (
            _item_needs_work(answer_item, artifact_map, force)
            or _item_needs_work(audio_item, artifact_map, force)
        ):
            work_items.append(
                CacheWorkItem(
                    kind="location_qa_pair",
                    scope="location",
                    target_id=location.id,
                    location_id=location.id,
                    item_key=item_key,
                    label=question_text,
                    question=question_text,
                    sort_order=sort_order,
                    qa_cache_key=qa_cache_key,
                )
            )

    return work_items


async def _build_mascot_work_items(
    session: AsyncSession,
    mascot_id: UUID,
    focus: str,
    force: bool,
) -> list[CacheWorkItem]:
    mascot = await session.get(Mascot, mascot_id)
    if not mascot:
        raise ValueError(f"Mascot not found: {mascot_id}")

    intro_item = fingerprints.build_mascot_intro_item(mascot)
    artifact_map = await _current_artifact_map(session, [intro_item])
    work_items: list[CacheWorkItem] = []
    if focus in {"voice", "all", "overview"} and _item_needs_work(intro_item, artifact_map, force):
        work_items.append(
            CacheWorkItem(
                kind="mascot_intro",
                scope="mascot",
                target_id=mascot.id,
                mascot_id=mascot.id,
                item_key=intro_item.item_key,
                label=intro_item.label,
            )
        )

    locations = await _dependent_locations(session, mascot_id)
    for location in locations:
        if focus == "voice":
            location_focus = "voice"
        elif focus in {"all", "overview"}:
            location_focus = "all"
        else:
            location_focus = "questions"
        work_items.extend(await _build_location_work_items(session, location.id, location_focus, force))

    return work_items


async def _build_work_items(job: CacheJob) -> list[CacheWorkItem]:
    force = bool((job.params or {}).get("force"))
    focus = job.focus or "overview"
    if job.scope == "location":
        if not job.target_id:
            raise ValueError("Cần target_id cho cache job địa điểm")
        async with async_session() as session:
            return await _build_location_work_items(session, job.target_id, focus, force)
    if job.scope == "mascot":
        if not job.target_id:
            raise ValueError("Cần target_id cho cache job đại sứ ảo")
        async with async_session() as session:
            return await _build_mascot_work_items(session, job.target_id, focus, force)
    if job.scope == "global":
        async with async_session() as session:
            return await _build_global_work_items(session, focus, force)
    return []

async def _build_global_work_items(session: AsyncSession, focus: str, force: bool) -> list[CacheWorkItem]:
    work_items: list[CacheWorkItem] = []
    
    mas_res = await session.execute(select(Mascot))
    mascots = list(mas_res.scalars().all())
    
    for mascot in mascots:
        intro_item = fingerprints.build_mascot_intro_item(mascot)
        artifact_map = await _current_artifact_map(session, [intro_item])
        if focus in {"voice", "all", "overview"} and _item_needs_work(intro_item, artifact_map, force):
            work_items.append(
                CacheWorkItem(
                    kind="mascot_intro",
                    scope="mascot",
                    target_id=mascot.id,
                    mascot_id=mascot.id,
                    item_key=intro_item.item_key,
                    label=intro_item.label,
                    force=force,
                )
            )
            
    loc_res = await session.execute(select(Location).where(Location.status == "active"))
    locations = list(loc_res.scalars().all())
    
    for location in locations:
        location_focus = focus
        if focus == "voice":
            location_focus = "voice"
        elif focus in {"all", "overview"}:
            location_focus = "all"
        else:
            location_focus = "questions"
        work_items.extend(await _build_location_work_items(session, location.id, location_focus, force))
        
    return work_items


async def _upsert_artifact(
    session: AsyncSession,
    *,
    artifact_type: str,
    scope: str,
    target_id: UUID,
    item_key: str,
    fingerprint: str,
    storage_url: str | None,
    cache_key: str | None,
    metadata: dict[str, Any],
) -> CacheArtifact:
    result = await session.execute(
        select(CacheArtifact).where(
            CacheArtifact.artifact_type == artifact_type,
            CacheArtifact.item_key == item_key,
        )
    )
    artifact = result.scalar_one_or_none()
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
    artifact.updated_at = _now()
    await session.flush()
    return artifact


def _load_qa_cache_file() -> dict[str, Any]:
    if not QA_CACHE_PATH.exists():
        return {}
    with QA_CACHE_PATH.open("r", encoding="utf-8") as file:
        data = json.load(file)
    return data if isinstance(data, dict) else {}


async def _write_qa_cache_entry(cache_key: str, entry: dict[str, Any]) -> None:
    async with _qa_cache_file_lock:
        QA_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = _load_qa_cache_file()
        data[cache_key] = entry
        temp_path = QA_CACHE_PATH.with_name(f"{QA_CACHE_PATH.name}.{uuid.uuid4().hex}.tmp")
        with temp_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)
            file.write("\n")
        os.replace(temp_path, QA_CACHE_PATH)
        qa_cache_store.reload()


def _audio_extension(content_type: str) -> str:
    return "mp3" if content_type == CONTENT_TYPE_MP3 else "wav"


async def _find_cached_tts_key(candidates: list[dict[str, str]]) -> tuple[str, str] | None:
    for candidate in candidates:
        for key_name, content_type in (("wav_r2_key", CONTENT_TYPE_WAV), ("mp3_r2_key", CONTENT_TYPE_MP3)):
            r2_key = candidate[key_name]
            if tts_key_cache.loaded:
                exists = tts_key_cache.contains(r2_key)
            else:
                exists = await storage_service.file_exists(r2_key)
                if exists:
                    tts_key_cache.add(r2_key)
            if exists:
                return r2_key, content_type
    return None


async def _ensure_tts_audio(
    text: str,
    voice: str,
    style: str,
    persona: str,
) -> tuple[str, str, str, bool]:
    answer_hash = tts_engine._cache_key(text, voice, style, persona)
    legacy_hash = tts_engine._legacy_cache_key(text, voice, style, persona)
    candidates = [
        {
            "hash": answer_hash,
            "wav_r2_key": f"tts-cache/{answer_hash}.wav",
            "mp3_r2_key": f"tts-cache/{answer_hash}.mp3",
        }
    ]
    if legacy_hash != answer_hash:
        candidates.append(
            {
                "hash": legacy_hash,
                "wav_r2_key": f"tts-cache/{legacy_hash}.wav",
                "mp3_r2_key": f"tts-cache/{legacy_hash}.mp3",
            }
        )

    cached = await _find_cached_tts_key(candidates)
    if cached:
        r2_key, content_type = cached
        return storage_service.get_public_url(r2_key), r2_key, content_type, True

    result = await tts_engine.synthesize(
        text=text,
        voice_name=voice,
        voice_style=style,
        personality_prompt=persona,
    )
    extension = _audio_extension(result.content_type)
    r2_key = f"tts-cache/{answer_hash}.{extension}"
    await storage_service.upload_file(
        file_bytes=result.audio_data,
        key=r2_key,
        content_type=result.content_type,
        cache_control="public, max-age=31536000, immutable",
    )
    tts_key_cache.add(r2_key)
    return storage_service.get_public_url(r2_key), r2_key, result.content_type, False


def _voice_for_location(location: Location) -> tuple[str, str, str]:
    mascot = location.mascot
    voice = mascot.voice_name if mascot else "Leda"
    style = mascot.voice_style if mascot else "soft, cheerful, and youthful like a college student"
    persona = mascot.personality_prompt if mascot else ""
    return voice, style or "", persona or ""


async def _process_mascot_intro(item: CacheWorkItem) -> None:
    async with async_session() as session:
        mascot = await session.get(Mascot, item.mascot_id)
        if not mascot:
            raise ValueError(f"Không tìm thấy đại sứ ảo: {item.mascot_id}")
        text = (
            f"Xin chào, mình là {mascot.name}. "
            "Mình sẽ đồng hành cùng bạn trong chuyến tham quan Đại học Trà Vinh hôm nay."
        )
        voice = mascot.voice_name or "Leda"
        style = mascot.voice_style or ""
        persona = mascot.personality_prompt or ""
        audio_url, r2_key, content_type, cache_hit = await _ensure_tts_audio(text, voice, style, persona)
        fp_item = fingerprints.build_mascot_intro_item(mascot)
        await _upsert_artifact(
            session,
            artifact_type="intro_audio",
            scope="mascot",
            target_id=mascot.id,
            item_key=fp_item.item_key,
            fingerprint=fp_item.fingerprint,
            storage_url=audio_url,
            cache_key=r2_key,
            metadata={
                **(fp_item.metadata or {}),
                "intro_text": text,
                "voice_name": voice,
                "voice_style": style,
                "content_type": content_type,
                "tts_cache_hit": cache_hit,
                "updated_by": "cache_worker",
            },
        )
        await session.commit()


async def _process_location_intro(item: CacheWorkItem) -> None:
    async with async_session() as session:
        location = await _load_location(session, item.location_id)
        if location.status != "active":
            raise CacheItemSkipped("Địa điểm đang inactive; bỏ qua intro audio")
        if not location.mascot:
            raise CacheItemSkipped("Địa điểm chưa gán đại sứ ảo; bỏ qua intro audio")

        intro_message = (location.intro_message or "").strip()
        if not intro_message:
            raise CacheItemSkipped("intro_message rỗng; bỏ qua intro audio")

        voice, style, persona = _voice_for_location(location)
        intro_audio = await location_audio_service.synthesize_location_audio(
            text=intro_message,
            location_slug=location.slug,
            kind="intro",
            voice=voice,
            style=style,
            persona=persona,
            force=True,
        )
        revisit_text = location_audio_service.build_revisit_audio_text(location.name)
        revisit_audio = await location_audio_service.synthesize_location_audio(
            text=revisit_text,
            location_slug=location.slug,
            kind="revisit",
            voice=voice,
            style=style,
            persona=persona,
            force=True,
        )
        location.intro_audio_url = intro_audio.audio_url
        location.revisit_audio_url = revisit_audio.audio_url

        fp_item = fingerprints.build_location_intro_item(location)
        if fp_item is None:
            raise CacheItemSkipped("Intro địa điểm không còn đủ điều kiện cache")

        await _upsert_artifact(
            session,
            artifact_type="location_intro_audio",
            scope="location",
            target_id=location.id,
            item_key=fp_item.item_key,
            fingerprint=fp_item.fingerprint,
            storage_url=intro_audio.audio_url,
            cache_key=intro_audio.r2_key,
            metadata={
                **(fp_item.metadata or {}),
                "revisit_text": revisit_text,
                "revisit_audio_url": revisit_audio.audio_url,
                "revisit_cache_key": revisit_audio.r2_key,
                "voice_name": voice,
                "voice_style": style,
                "content_type": intro_audio.content_type,
                "revisit_content_type": revisit_audio.content_type,
                "tts_provider": intro_audio.provider,
                "revisit_tts_provider": revisit_audio.provider,
                "tts_cache_hit": intro_audio.cache_hit,
                "revisit_tts_cache_hit": revisit_audio.cache_hit,
                "updated_by": "cache_worker",
            },
        )
        await session.commit()


async def _process_location_qa_pair(item: CacheWorkItem) -> None:
    async with async_session() as session:
        location = await _load_location(session, item.location_id)
        voice, style, persona = _voice_for_location(location)
        result = await rag_service.process_query(
            session=session,
            message=item.question or "",
            location_id=str(location.id),
            session_id=None,
            history=[],
            location_name=location.name,
            personality_prompt=persona or None,
            voice_style=style or None,
        )

        answer_text = str(result.get("answer") or "").strip()
        if not answer_text or result.get("error"):
            raise ValueError("RAG không trả về câu trả lời có thể cache")

        audio_url, r2_key, content_type, cache_hit = await _ensure_tts_audio(answer_text, voice, style, persona)
        qa_cache_key = item.qa_cache_key or fingerprints.qa_cache_lookup_key(item.question or "", location.name)
        qa_entry = {
            "answer": answer_text,
            "audio_url": audio_url,
            "tool_actions": result.get("tool_actions", []),
            "audio_base64": None,
            "question": item.question,
            "location": location.name,
            "location_slug": location.slug,
            "voice_name": voice,
        }
        await _write_qa_cache_entry(qa_cache_key, qa_entry)

        fp_items = {
            fp_item.artifact_type: fp_item
            for fp_item in fingerprints.build_location_qa_items(location)
            if fp_item.item_key == item.item_key
        }
        answer_item = fp_items["qa_answer"]
        audio_item = fp_items["qa_audio"]
        metadata = {
            "question": item.question,
            "sort_order": item.sort_order,
            "qa_cache_key": qa_cache_key,
            "location_slug": location.slug,
            "voice_name": voice,
            "voice_style": style,
            "answer_length": len(answer_text),
            "response_time_ms": result.get("response_time_ms"),
            "updated_by": "cache_worker",
        }
        await _upsert_artifact(
            session,
            artifact_type="qa_answer",
            scope="location",
            target_id=location.id,
            item_key=answer_item.item_key,
            fingerprint=answer_item.fingerprint,
            storage_url=None,
            cache_key=qa_cache_key,
            metadata={**metadata, "tool_actions_count": len(result.get("tool_actions") or [])},
        )
        await _upsert_artifact(
            session,
            artifact_type="qa_audio",
            scope="location",
            target_id=location.id,
            item_key=audio_item.item_key,
            fingerprint=audio_item.fingerprint,
            storage_url=audio_url,
            cache_key=r2_key,
            metadata={**metadata, "content_type": content_type, "tts_cache_hit": cache_hit},
        )
        await session.commit()


async def _process_location_qa_audio(item: CacheWorkItem) -> None:
    async with async_session() as session:
        location = await _load_location(session, item.location_id)
        qa_cache_key = item.qa_cache_key or fingerprints.qa_cache_lookup_key(item.question or "", location.name)
        cached_entry = qa_cache_store.get(qa_cache_key)
        if not cached_entry or not str(cached_entry.get("answer") or "").strip():
            raise ValueError("Thiếu câu trả lời QA; hãy rebuild nhóm câu hỏi trước")

        answer_text = str(cached_entry["answer"])
        voice, style, persona = _voice_for_location(location)
        audio_url, r2_key, content_type, cache_hit = await _ensure_tts_audio(answer_text, voice, style, persona)
        updated_entry = {
            **cached_entry,
            "audio_url": audio_url,
            "audio_base64": None,
            "voice_name": voice,
        }
        await _write_qa_cache_entry(qa_cache_key, updated_entry)

        audio_item = next(
            fp_item for fp_item in fingerprints.build_location_qa_items(location)
            if fp_item.artifact_type == "qa_audio" and fp_item.item_key == item.item_key
        )
        await _upsert_artifact(
            session,
            artifact_type="qa_audio",
            scope="location",
            target_id=location.id,
            item_key=audio_item.item_key,
            fingerprint=audio_item.fingerprint,
            storage_url=audio_url,
            cache_key=r2_key,
            metadata={
                "question": item.question,
                "sort_order": item.sort_order,
                "qa_cache_key": qa_cache_key,
                "location_slug": location.slug,
                "voice_name": voice,
                "voice_style": style,
                "content_type": content_type,
                "tts_cache_hit": cache_hit,
                "updated_by": "cache_worker",
            },
        )
        await session.commit()


async def _process_item(item: CacheWorkItem) -> None:
    if item.kind == "mascot_intro":
        await _process_mascot_intro(item)
    elif item.kind == "location_intro":
        await _process_location_intro(item)
    elif item.kind == "location_qa_pair":
        await _process_location_qa_pair(item)
    elif item.kind == "location_qa_audio":
        await _process_location_qa_audio(item)
    else:
        raise ValueError(f"Loại mục cache chưa hỗ trợ: {item.kind}")


async def run_cache_job(job_id: str) -> None:
    parsed_job_id = UUID(job_id)
    job = await _get_job(parsed_job_id)
    if not job:
        logger.warning("Cache job not found: %s", job_id)
        return

    try:
        work_items = await _build_work_items(job)
    except Exception as exc:
        async with async_session() as session:
            job_row = await session.get(CacheJob, parsed_job_id)
            if job_row:
                job_row.status = "failed"
                job_row.error_message = str(exc)
                job_row.finished_at = _now()
                job_row.updated_at = _now()
                await add_job_log(session, parsed_job_id, "error", f"Không lập được kế hoạch job: {exc}")
                await session.commit()
        return

    if not await _mark_job_started(parsed_job_id, len(work_items)):
        return

    for item in work_items:
        if await _is_cancelled(parsed_job_id):
            break
        started = time.perf_counter()
        try:
            await _commit_log(
                parsed_job_id,
                "info",
                f"Đang xử lý {item.kind}: {item.label}",
                item.item_key,
            )
            await _process_item(item)
            elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
            await _commit_log(
                parsed_job_id,
                "info",
                f"Hoàn tất {item.kind}: {item.label}",
                item.item_key,
                {"elapsed_ms": elapsed_ms},
            )
            await _increment_progress(parsed_job_id, failed=False)
        except CacheItemSkipped as exc:
            await _commit_log(
                parsed_job_id,
                "warning",
                f"Bỏ qua {item.kind}: {exc}",
                item.item_key,
                {"label": item.label},
            )
            await _increment_progress(parsed_job_id, failed=False)
        except Exception as exc:
            logger.exception("Cache job item failed: %s", item.item_key)
            await _commit_log(
                parsed_job_id,
                "error",
                f"Lỗi {item.kind}: {exc}",
                item.item_key,
                {"label": item.label},
            )
            await _increment_progress(parsed_job_id, failed=True)

    await _finish_job(parsed_job_id)
