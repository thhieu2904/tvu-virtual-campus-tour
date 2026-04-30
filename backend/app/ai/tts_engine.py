"""
TTS Engine — Synthesizes speech with Gemini TTS and Edge TTS fallback.
"""

import logging
import os
import hashlib
import asyncio
from dataclasses import dataclass
from google.genai import types
import edge_tts

from app.ai.core_client import get_client
from app.config import get_settings

logger = logging.getLogger(__name__)

# Audio content types
CONTENT_TYPE_PCM = "audio/pcm"    # Gemini output: raw PCM 24kHz 16-bit mono
CONTENT_TYPE_MP3 = "audio/mpeg"   # Edge TTS output: MP3


@dataclass
class TTSResult:
    """Result from a TTS synthesis call."""
    audio_data: bytes
    content_type: str       # "audio/pcm" or "audio/mpeg"
    provider: str           # "gemini" | "edge-tts" | "cache"
    cached: bool


CACHE_DIR = "data/tts_cache"


def _cache_key(text: str, voice: str) -> str:
    """Generate a stable cache key."""
    return hashlib.sha256(f"{text}|{voice}".encode()).hexdigest()


def _get_cached(key: str) -> tuple[bytes, str] | None:
    """
    Read from disk cache.
    Checks for both .pcm and .mp3 extensions.
    Returns (audio_bytes, content_type) or None.
    """
    for ext, ct in [(".pcm", CONTENT_TYPE_PCM), (".mp3", CONTENT_TYPE_MP3)]:
        path = os.path.join(CACHE_DIR, f"{key}{ext}")
        if os.path.exists(path):
            with open(path, "rb") as f:
                return f.read(), ct
    return None


def _save_cache(key: str, audio: bytes, content_type: str):
    """Write to disk cache with the correct extension."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    ext = ".pcm" if content_type == CONTENT_TYPE_PCM else ".mp3"
    with open(os.path.join(CACHE_DIR, f"{key}{ext}"), "wb") as f:
        f.write(audio)


async def _edge_tts_fallback(text: str, voice: str = "vi-VN-HoaiMyNeural") -> bytes:
    """Fallback using edge-tts when Gemini quota is exhausted."""
    communicate = edge_tts.Communicate(text, voice)
    audio_bytes = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_bytes += chunk["data"]
    return audio_bytes


async def synthesize(
    text: str,
    voice_name: str | None = None,
) -> TTSResult:
    """
    Synthesize speech from text.
    Strategy (3-layer):
      1. Check disk cache.
      2. Try Gemini TTS → PCM output.
      3. Fallback to Edge TTS → MP3 output.
    """
    settings = get_settings()
    voice = voice_name or settings.GEMINI_DEFAULT_VOICE

    key = _cache_key(text, voice)
    cached = await asyncio.to_thread(_get_cached, key)

    if cached:
        audio_data, content_type = cached
        return TTSResult(
            audio_data=audio_data,
            content_type=content_type,
            provider="cache",
            cached=True,
        )

    try:
        prompt = f"Say in Vietnamese: {text}"

        result = await asyncio.to_thread(
            get_client().models.generate_content,
            model=settings.GEMINI_TTS_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name=voice
                        )
                    )
                ),
            ),
        )

        audio_data = result.candidates[0].content.parts[0].inline_data.data
        await asyncio.to_thread(_save_cache, key, audio_data, CONTENT_TYPE_PCM)
        return TTSResult(
            audio_data=audio_data,
            content_type=CONTENT_TYPE_PCM,
            provider="gemini",
            cached=False,
        )

    except Exception as e:
        logger.warning("Gemini TTS failed (%s). Falling back to Edge TTS.", e)
        try:
            audio_data = await _edge_tts_fallback(text)
            await asyncio.to_thread(_save_cache, key, audio_data, CONTENT_TYPE_MP3)
            return TTSResult(
                audio_data=audio_data,
                content_type=CONTENT_TYPE_MP3,
                provider="edge-tts",
                cached=False,
            )
        except Exception as fb_e:
            logger.error("Edge TTS also failed: %s", fb_e)
            raise
