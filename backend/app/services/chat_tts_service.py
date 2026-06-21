"""Resolve chat TTS cache hits and synthesize missing audio outside the HTTP router."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.ai import tts_engine
from app.ai.tts_engine import CONTENT_TYPE_MP3, CONTENT_TYPE_WAV
from app.cache import tts_key_cache
from app.services import storage_service

logger = logging.getLogger(__name__)


@dataclass
class ChatAudioResult:
    audio_url: str | None = None
    runtime_filename: str | None = None
    provider: str | None = None
    content_type: str | None = None
    cache_status: str = "miss"
    lookup_ms: float = 0.0
    generation_ms: float = 0.0
    total_ms: float = 0.0
    sync_local_path: str | None = None
    sync_r2_key: str | None = None


async def sync_tts_to_r2(local_path: str, r2_key: str, content_type: str) -> None:
    """Upload a generated runtime audio file to R2 after the response completes."""
    path = Path(local_path)
    if not path.is_file():
        logger.warning("Skip R2 TTS sync because local file is missing: %s", local_path)
        return

    try:
        file_bytes = await asyncio.to_thread(path.read_bytes)
        await storage_service.upload_file(
            file_bytes=file_bytes,
            key=r2_key,
            content_type=content_type,
        )
        tts_key_cache.add(r2_key)
        logger.info("Synced local TTS cache to R2: %s", r2_key)
    except Exception as exc:
        logger.warning("Background R2 TTS sync failed for %s: %s", r2_key, exc)


def should_skip_tts(tool_actions: list[dict[str, Any]]) -> bool:
    """Skip narration only for a video action without navigation."""
    tool_names = {
        action.get("name")
        for action in tool_actions
        if isinstance(action, dict)
    }
    return (
        "navigate_to" not in tool_names
        and any(
            isinstance(action, dict)
            and action.get("name") == "show_media"
            and (action.get("args") or {}).get("media_type") == "video"
            for action in tool_actions
        )
    )


async def resolve_chat_audio(
    *,
    answer_text: str,
    tool_actions: list[dict[str, Any]],
    voice_name: str,
    voice_style: str | None,
    personality_prompt: str | None,
) -> ChatAudioResult | None:
    """Return cached audio or generate a runtime file for one complete answer."""
    if not answer_text or should_skip_tts(tool_actions):
        return None

    started = time.perf_counter()
    style = voice_style or ""
    persona = personality_prompt or ""
    answer_hash = tts_engine._cache_key(answer_text, voice_name, style, persona)
    legacy_hash = tts_engine._legacy_cache_key(answer_text, voice_name, style, persona)
    cache_candidates = [
        {
            "hash": answer_hash,
            "wav_r2_key": f"tts-cache/{answer_hash}.wav",
            "mp3_r2_key": f"tts-cache/{answer_hash}.mp3",
        }
    ]
    if legacy_hash != answer_hash:
        cache_candidates.append(
            {
                "hash": legacy_hash,
                "wav_r2_key": f"tts-cache/{legacy_hash}.wav",
                "mp3_r2_key": f"tts-cache/{legacy_hash}.mp3",
            }
        )

    logger.info(
        "TTS voice selected: voice=%s style=%s persona_set=%s cache=%s",
        voice_name,
        style,
        bool(persona),
        answer_hash,
    )

    lookup_started = time.perf_counter()
    cached_r2_key: str | None = None
    if tts_key_cache.loaded:
        for candidate in cache_candidates:
            if tts_key_cache.contains(candidate["wav_r2_key"]):
                cached_r2_key = candidate["wav_r2_key"]
                break
            if tts_key_cache.contains(candidate["mp3_r2_key"]):
                cached_r2_key = candidate["mp3_r2_key"]
                break
    else:
        for candidate in cache_candidates:
            if await storage_service.file_exists(candidate["wav_r2_key"]):
                cached_r2_key = candidate["wav_r2_key"]
                break
            if await storage_service.file_exists(candidate["mp3_r2_key"]):
                cached_r2_key = candidate["mp3_r2_key"]
                break
        if cached_r2_key:
            tts_key_cache.add(cached_r2_key)

    lookup_ms = round((time.perf_counter() - lookup_started) * 1000, 2)
    if cached_r2_key:
        content_type = CONTENT_TYPE_MP3 if cached_r2_key.endswith(".mp3") else CONTENT_TYPE_WAV
        return ChatAudioResult(
            audio_url=storage_service.get_public_url(cached_r2_key),
            provider="cache",
            content_type=content_type,
            cache_status="r2",
            lookup_ms=lookup_ms,
            total_ms=round((time.perf_counter() - started) * 1000, 2),
        )

    for candidate in cache_candidates:
        runtime_cached = tts_engine.get_runtime_cached(candidate["hash"])
        if not runtime_cached:
            continue
        path, content_type, filename = runtime_cached
        r2_key = (
            candidate["mp3_r2_key"]
            if content_type == CONTENT_TYPE_MP3
            else candidate["wav_r2_key"]
        )
        return ChatAudioResult(
            runtime_filename=filename,
            provider="cache",
            content_type=content_type,
            cache_status="runtime",
            lookup_ms=lookup_ms,
            total_ms=round((time.perf_counter() - started) * 1000, 2),
            sync_local_path=str(path),
            sync_r2_key=r2_key,
        )

    generation_started = time.perf_counter()
    tts_result = await tts_engine.synthesize(
        text=answer_text,
        voice_name=voice_name,
        voice_style=voice_style,
        personality_prompt=personality_prompt,
    )
    generation_ms = round((time.perf_counter() - generation_started) * 1000, 2)
    content_type = tts_result.content_type or CONTENT_TYPE_WAV
    filename = tts_engine.save_runtime_cache(
        answer_hash,
        tts_result.audio_data,
        content_type,
    )
    r2_key = (
        cache_candidates[0]["mp3_r2_key"]
        if content_type == CONTENT_TYPE_MP3
        else cache_candidates[0]["wav_r2_key"]
    )
    local_path = str(tts_engine.RUNTIME_CACHE_DIR / filename)
    return ChatAudioResult(
        runtime_filename=filename,
        provider=tts_result.provider,
        content_type=content_type,
        cache_status="generated",
        lookup_ms=lookup_ms,
        generation_ms=generation_ms,
        total_ms=round((time.perf_counter() - started) * 1000, 2),
        sync_local_path=local_path,
        sync_r2_key=r2_key,
    )
