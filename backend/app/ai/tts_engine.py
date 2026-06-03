"""
TTS Engine — Synthesizes speech with Gemini TTS and Edge TTS fallback.
"""

import logging
import os
import hashlib
import asyncio
import struct
from dataclasses import dataclass
from pathlib import Path
import re
import uuid
from google.genai import types
import edge_tts

from app.ai.core_client import get_client
from app.config import get_settings

logger = logging.getLogger(__name__)

# Audio content types
CONTENT_TYPE_WAV = "audio/wav"    # Gemini output: converted to WAV 24kHz 16-bit mono
CONTENT_TYPE_MP3 = "audio/mpeg"   # Edge TTS output: MP3
TTS_PROMPT_VERSION = "tts-pronunciation-v3"
MALE_VOICES = {"Puck"}
TTS_REWRITE_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (
        re.compile(r"\bĐại\s+học\s+Trà\s+Vinh\s*\(\s*(?:TVU|T\s+V\s+U)\s*\)"),
        "Đại học Trà Vinh",
    ),
    (
        re.compile(r"\bCông\s+nghệ\s+thông\s+tin\s*\(\s*(?:CNTT|C\s+N\s+T\s+T)\s*\)"),
        "Công nghệ thông tin",
    ),
    (re.compile(r"(?<!\w)(?:TVU|T\s+V\s+U)(?!\w)"), "Đại học Trà Vinh"),
    (re.compile(r"(?<!\w)(?:CNTT|C\s+N\s+T\s+T)(?!\w)"), "Công nghệ thông tin"),
)


@dataclass
class TTSResult:
    """Result from a TTS synthesis call."""
    audio_data: bytes
    content_type: str       # "audio/wav" or "audio/mpeg"
    provider: str           # "gemini" | "edge-tts" | "cache"
    cached: bool


CACHE_DIR = "data/tts_cache"
RUNTIME_CACHE_DIR = Path("data/runtime_tts_cache")
_RUNTIME_CACHE_KEY_RE = re.compile(r"^(?:[0-9a-f]{32}|[0-9a-f]{64})$")
_RUNTIME_CACHE_FILENAME_RE = re.compile(r"^(?:[0-9a-f]{32}|[0-9a-f]{64})\.(wav|mp3)$")


def _extension_for_content_type(content_type: str) -> str:
    return "mp3" if content_type == CONTENT_TYPE_MP3 else "wav"


def _content_type_for_extension(extension: str) -> str:
    return CONTENT_TYPE_MP3 if extension == "mp3" else CONTENT_TYPE_WAV


def rewrite_tts_text(text: str) -> str:
    """Rewrite display acronyms into Vietnamese phrases that TTS reads reliably."""
    rewritten = str(text or "")
    for pattern, replacement in TTS_REWRITE_RULES:
        rewritten = pattern.sub(replacement, rewritten)
    return rewritten


def _cache_key(
    text: str,
    voice: str,
    voice_style: str = "",
    personality_prompt: str = "",
) -> str:
    """Generate a stable cache key."""
    spoken_text = rewrite_tts_text(text)
    return hashlib.sha256(
        f"{TTS_PROMPT_VERSION}|{spoken_text}|{voice}|{voice_style}|{personality_prompt}".encode()
    ).hexdigest()


def _legacy_cache_key(
    text: str,
    voice: str,
    voice_style: str = "",
    personality_prompt: str = "",
) -> str:
    """Return the previous chat/R2 cache key for backward-compatible lookups."""
    spoken_text = rewrite_tts_text(text)
    return hashlib.md5(
        f"{TTS_PROMPT_VERSION}_{spoken_text}_{voice}_{voice_style}_{personality_prompt}".encode()
    ).hexdigest()


def _get_cached(key: str) -> tuple[bytes, str] | None:
    """
    Read from disk cache.
    Checks for both .wav and .mp3 extensions.
    Returns (audio_bytes, content_type) or None.
    """
    for ext, ct in [(".wav", CONTENT_TYPE_WAV), (".mp3", CONTENT_TYPE_MP3)]:
        path = os.path.join(CACHE_DIR, f"{key}{ext}")
        if os.path.exists(path):
            with open(path, "rb") as f:
                return f.read(), ct
    return None


def _save_cache(key: str, audio: bytes, content_type: str):
    """Write to disk cache with the correct extension."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    ext = ".wav" if content_type == CONTENT_TYPE_WAV else ".mp3"
    with open(os.path.join(CACHE_DIR, f"{key}{ext}"), "wb") as f:
        f.write(audio)


def save_runtime_cache(cache_key: str, audio: bytes, content_type: str) -> str:
    """Persist chat-runtime audio locally and return the cache filename."""
    if not _RUNTIME_CACHE_KEY_RE.fullmatch(cache_key):
        raise ValueError("Invalid runtime cache key")

    RUNTIME_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    extension = _extension_for_content_type(content_type)
    filename = f"{cache_key}.{extension}"
    target_path = RUNTIME_CACHE_DIR / filename
    temp_path = RUNTIME_CACHE_DIR / f".{filename}.{uuid.uuid4().hex}.tmp"
    try:
        temp_path.write_bytes(audio)
        os.replace(temp_path, target_path)
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
    return filename


def get_runtime_cached(cache_key: str) -> tuple[Path, str, str] | None:
    """Return (path, content_type, filename) for local chat-runtime audio."""
    if not _RUNTIME_CACHE_KEY_RE.fullmatch(cache_key):
        return None

    for extension in ("wav", "mp3"):
        filename = f"{cache_key}.{extension}"
        path = RUNTIME_CACHE_DIR / filename
        if path.is_file():
            return path, _content_type_for_extension(extension), filename
    return None


def resolve_runtime_cache_file(filename: str) -> tuple[Path, str] | None:
    """Safely resolve a runtime cache filename for serving over HTTP."""
    if not _RUNTIME_CACHE_FILENAME_RE.fullmatch(filename):
        return None

    path = RUNTIME_CACHE_DIR / filename
    if not path.is_file():
        return None

    extension = filename.rsplit(".", 1)[1]
    return path, _content_type_for_extension(extension)


def _edge_voice_for(voice: str, personality_prompt: str = "") -> str:
    """Map Gemini mascot voices to Vietnamese Edge fallback voices."""
    if voice in MALE_VOICES:
        return "vi-VN-NamMinhNeural"
    return "vi-VN-HoaiMyNeural"


def _speaker_guard(voice: str, personality_prompt: str = "") -> str:
    if voice in MALE_VOICES:
        return "The speaker is male; keep a clearly masculine Vietnamese voice."
    return "The speaker is female; keep a clearly feminine Vietnamese voice."


async def _edge_tts_fallback(text: str, voice: str = "vi-VN-HoaiMyNeural") -> bytes:
    """Fallback using edge-tts when Gemini quota is exhausted."""
    communicate = edge_tts.Communicate(text, voice)
    audio_bytes = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_bytes += chunk["data"]
    return audio_bytes


def _pcm_to_wav(pcm_data: bytes, sample_rate: int = 24000, num_channels: int = 1, sample_width: int = 2) -> bytes:
    """Wrap raw PCM data in a WAV header."""
    audio_format = 1  # PCM
    byte_rate = sample_rate * num_channels * sample_width
    block_align = num_channels * sample_width
    data_size = len(pcm_data)
    chunk_size = 36 + data_size
    
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF', chunk_size, b'WAVE',
        b'fmt ', 16, audio_format, num_channels, sample_rate,
        byte_rate, block_align, sample_width * 8,
        b'data', data_size
    )
    return header + pcm_data


async def synthesize(
    text: str,
    voice_name: str | None = None,
    voice_style: str | None = None,
    personality_prompt: str | None = None,
) -> TTSResult:
    """
    Synthesize speech from text.
    Strategy:
      1. Optionally check local disk cache when explicitly enabled.
      2. Try Gemini TTS → PCM output.
      3. Fallback to Edge TTS → MP3 output.

    Chat/runtime R2 cache is handled by the caller. Local disk cache is
    disabled by default so production deployments do not grow app storage.
    """
    settings = get_settings()
    voice = voice_name or settings.GEMINI_DEFAULT_VOICE
    use_local_cache = getattr(settings, "TTS_LOCAL_CACHE_ENABLED", False) is True

    style = voice_style or ""
    persona = personality_prompt or ""
    key = _cache_key(text, voice, style, persona)
    spoken_text = rewrite_tts_text(text)
    cached = await asyncio.to_thread(_get_cached, key) if use_local_cache else None

    if cached:
        audio_data, content_type = cached
        return TTSResult(
            audio_data=audio_data,
            content_type=content_type,
            provider="cache",
            cached=True,
        )

    try:
        style_parts: list[str] = []
        if style:
            style_parts.append(f"Style: {style}.")
        if persona:
            style_parts.append(f"Persona: {persona}.")
        if style_parts:
            prompt = f"{' '.join(style_parts)} {spoken_text}"
        else:
            prompt = spoken_text

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
        audio_data = _pcm_to_wav(audio_data)
        
        if use_local_cache:
            await asyncio.to_thread(_save_cache, key, audio_data, CONTENT_TYPE_WAV)
        return TTSResult(
            audio_data=audio_data,
            content_type=CONTENT_TYPE_WAV,
            provider="gemini",
            cached=False,
        )

    except Exception as e:
        edge_voice = _edge_voice_for(voice, persona)
        logger.warning(
            "Gemini TTS failed for voice=%s text_len=%d: %s. Falling back to Edge TTS voice=%s",
            voice,
            len(spoken_text),
            e,
            edge_voice,
        )
        try:
            audio_data = await _edge_tts_fallback(spoken_text, edge_voice)
            if use_local_cache:
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
