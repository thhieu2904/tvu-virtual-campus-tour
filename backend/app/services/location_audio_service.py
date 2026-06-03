"""Helpers for generated, versioned audio assets attached to locations."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal

from app.ai import tts_engine
from app.ai.tts_engine import CONTENT_TYPE_MP3
from app.services import storage_service

LOCATION_AUDIO_CACHE_CONTROL = "public, max-age=31536000, immutable"
REVISIT_AUDIO_TEMPLATE_VERSION = "location-revisit-v1"
REVISIT_AUDIO_TEMPLATE = "Chào mừng bạn quay lại {name}."


@dataclass(frozen=True)
class LocationAudioResult:
    audio_url: str
    r2_key: str
    content_type: str
    provider: str
    cache_hit: bool


def build_revisit_audio_text(location_name: str) -> str:
    name = str(location_name or "").strip() or "địa điểm này"
    return REVISIT_AUDIO_TEMPLATE.format(name=name)


def _audio_extension(content_type: str) -> str:
    return "mp3" if content_type == CONTENT_TYPE_MP3 else "wav"


def _build_audio_key(location_slug: str, kind: Literal["intro", "revisit"], extension: str) -> str:
    if kind == "revisit":
        return storage_service.build_revisit_key(location_slug, extension)
    return storage_service.build_intro_key(location_slug, extension)


async def synthesize_location_audio(
    *,
    text: str,
    location_slug: str,
    kind: Literal["intro", "revisit"],
    voice: str,
    style: str,
    persona: str,
    force: bool = False,
) -> LocationAudioResult:
    # Check if audio already exists in R2 — reuse to avoid non-deterministic TTS regeneration.
    if not force:
        for ext in ("wav", "mp3"):
            candidate_key = _build_audio_key(location_slug, kind, ext)
            content_type = "audio/mpeg" if ext == "mp3" else "audio/wav"
            if await storage_service.file_exists(candidate_key):
                audio_url = f"{storage_service.get_public_url(candidate_key)}?v=cached"
                return LocationAudioResult(
                    audio_url=audio_url,
                    r2_key=candidate_key,
                    content_type=content_type,
                    provider="cache",
                    cache_hit=True,
                )

    result = await tts_engine.synthesize(
        text=text,
        voice_name=voice,
        voice_style=style,
        personality_prompt=persona,
    )
    extension = _audio_extension(result.content_type)
    r2_key = _build_audio_key(location_slug, kind, extension)
    await storage_service.upload_file(
        file_bytes=result.audio_data,
        key=r2_key,
        content_type=result.content_type,
        cache_control=LOCATION_AUDIO_CACHE_CONTROL,
    )
    audio_url = f"{storage_service.get_public_url(r2_key)}?v={int(time.time())}"
    return LocationAudioResult(
        audio_url=audio_url,
        r2_key=r2_key,
        content_type=result.content_type,
        provider=result.provider,
        cache_hit=result.cached,
    )
