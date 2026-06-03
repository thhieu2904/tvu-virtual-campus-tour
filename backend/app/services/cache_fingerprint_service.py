"""Fingerprint helpers for Admin Cache Phase 2A.

Fingerprints describe whether a cache artifact is still valid for the current
source data. They do not execute rebuild work or inspect generated audio/text.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.ai.tts_engine import TTS_PROMPT_VERSION
from app.config import get_settings
from app.services.location_audio_service import REVISIT_AUDIO_TEMPLATE_VERSION

MASCOT_INTRO_TEMPLATE_VERSION = "mascot-intro-v1"
LOCATION_INTRO_FINGERPRINT_VERSION = "location-intro-v2"
LOCATION_QA_FINGERPRINT_VERSION = "location-qa-v1"
QA_ITEM_FINGERPRINT_VERSION = "qa-item-v1"
ANSWER_PROMPT_VERSION = "rag-answer-v1"


@dataclass(frozen=True)
class CacheFingerprintItem:
    artifact_type: str
    item_key: str
    fingerprint: str
    label: str
    qa_cache_key: str | None = None
    metadata: dict[str, Any] | None = None


def _clean_string(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _jsonable(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _jsonable(value[key]) for key in sorted(value)}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def fingerprint_payload(payload: dict[str, Any]) -> str:
    normalized = _jsonable(payload)
    raw = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def qa_cache_lookup_key(question: str, location_name: str) -> str:
    """Return the legacy qa_cache.json key used by the chat hot path."""
    return hashlib.md5(f"{question}_{location_name}".encode()).hexdigest()


def qa_item_key(location_id: UUID | str, question: str, location_name: str) -> str:
    return f"qa:{location_id}:{qa_cache_lookup_key(question, location_name)}"


def intro_item_key(mascot_id: UUID | str) -> str:
    return f"intro:{mascot_id}"


def location_intro_item_key(location_id: UUID | str) -> str:
    return f"loc-intro:{location_id}"


def _model_source() -> dict[str, str]:
    settings = get_settings()
    return {
        "gemini_chat_model": settings.GEMINI_CHAT_MODEL,
        "gemini_embedding_model": settings.GEMINI_EMBEDDING_MODEL,
        "gemini_tts_model": settings.GEMINI_TTS_MODEL,
        "gemini_default_voice": settings.GEMINI_DEFAULT_VOICE,
    }


def mascot_source(mascot: Any | None) -> dict[str, Any]:
    settings = get_settings()
    if mascot is None:
        return {
            "id": None,
            "name": "",
            "voice_name": settings.GEMINI_DEFAULT_VOICE,
            "voice_style": "",
            "personality_prompt": "",
            "source": "runtime-default",
        }
    return {
        "id": str(mascot.id),
        "name": _clean_string(getattr(mascot, "name", "")),
        "voice_name": _clean_string(getattr(mascot, "voice_name", "")) or settings.GEMINI_DEFAULT_VOICE,
        "voice_style": _clean_string(getattr(mascot, "voice_style", "")),
        "personality_prompt": _clean_string(getattr(mascot, "personality_prompt", "")),
        "source": "assigned",
    }


def mascot_intro_payload(mascot: Any) -> dict[str, Any]:
    models = _model_source()
    return {
        "kind": "mascot_intro",
        "version": MASCOT_INTRO_TEMPLATE_VERSION,
        "mascot": mascot_source(mascot),
        "tts_prompt_version": TTS_PROMPT_VERSION,
        "gemini_tts_model": models["gemini_tts_model"],
        "gemini_default_voice": models["gemini_default_voice"],
    }


def mascot_intro_fingerprint(mascot: Any) -> str:
    return fingerprint_payload(mascot_intro_payload(mascot))


def location_intro_payload(location: Any) -> dict[str, Any]:
    models = _model_source()
    return {
        "kind": "location_intro",
        "version": LOCATION_INTRO_FINGERPRINT_VERSION,
        "location": {
            "id": str(location.id),
            "name": _clean_string(getattr(location, "name", "")),
            "slug": _clean_string(getattr(location, "slug", "")),
            "intro_message": _clean_string(getattr(location, "intro_message", "")),
        },
        "revisit_audio_template_version": REVISIT_AUDIO_TEMPLATE_VERSION,
        "mascot": mascot_source(getattr(location, "mascot", None)),
        "tts_prompt_version": TTS_PROMPT_VERSION,
        "gemini_tts_model": models["gemini_tts_model"],
    }


def location_intro_fingerprint(location: Any) -> str:
    return fingerprint_payload(location_intro_payload(location))


def _question_source(question: Any, fallback_order: int) -> dict[str, Any]:
    return {
        "question": _clean_string(getattr(question, "question", question)),
        "sort_order": int(getattr(question, "sort_order", fallback_order) or 0),
    }


def sorted_questions(location: Any) -> list[Any]:
    questions = list(getattr(location, "suggested_questions", []) or [])
    return sorted(
        questions,
        key=lambda item: (
            int(getattr(item, "sort_order", 0) or 0),
            _clean_string(getattr(item, "question", item)),
        ),
    )


def location_suggested_qa_payload(location: Any) -> dict[str, Any]:
    models = _model_source()
    questions = [
        _question_source(question, index)
        for index, question in enumerate(sorted_questions(location))
        if _question_source(question, index)["question"]
    ]
    return {
        "kind": "location_suggested_qa",
        "version": LOCATION_QA_FINGERPRINT_VERSION,
        "location": {
            "id": str(location.id),
            "name": _clean_string(getattr(location, "name", "")),
            "slug": _clean_string(getattr(location, "slug", "")),
        },
        "questions": questions,
        "mascot": mascot_source(getattr(location, "mascot", None)),
        "answer_prompt_version": ANSWER_PROMPT_VERSION,
        "tts_prompt_version": TTS_PROMPT_VERSION,
        "gemini_chat_model": models["gemini_chat_model"],
        "gemini_embedding_model": models["gemini_embedding_model"],
        "gemini_tts_model": models["gemini_tts_model"],
    }


def location_suggested_qa_fingerprint(location: Any) -> str:
    return fingerprint_payload(location_suggested_qa_payload(location))


def qa_item_payload(location: Any, question: Any, fallback_order: int = 0) -> dict[str, Any]:
    models = _model_source()
    question_data = _question_source(question, fallback_order)
    return {
        "kind": "location_qa_item",
        "version": QA_ITEM_FINGERPRINT_VERSION,
        "location": {
            "id": str(location.id),
            "name": _clean_string(getattr(location, "name", "")),
            "slug": _clean_string(getattr(location, "slug", "")),
        },
        "question": question_data,
        "mascot": mascot_source(getattr(location, "mascot", None)),
        "answer_prompt_version": ANSWER_PROMPT_VERSION,
        "tts_prompt_version": TTS_PROMPT_VERSION,
        "gemini_chat_model": models["gemini_chat_model"],
        "gemini_embedding_model": models["gemini_embedding_model"],
        "gemini_tts_model": models["gemini_tts_model"],
    }


def qa_item_fingerprint(location: Any, question: Any, fallback_order: int = 0) -> str:
    return fingerprint_payload(qa_item_payload(location, question, fallback_order))


def build_location_qa_items(location: Any) -> list[CacheFingerprintItem]:
    items: list[CacheFingerprintItem] = []
    for index, question in enumerate(sorted_questions(location)):
        text = _clean_string(getattr(question, "question", question))
        if not text:
            continue
        cache_key = qa_cache_lookup_key(text, _clean_string(getattr(location, "name", "")))
        item_key = qa_item_key(location.id, text, _clean_string(getattr(location, "name", "")))
        metadata = {
            "question": text,
            "sort_order": int(getattr(question, "sort_order", index) or 0),
            "qa_cache_key": cache_key,
            "location_slug": _clean_string(getattr(location, "slug", "")),
        }
        fingerprint = qa_item_fingerprint(location, question, index)
        items.append(
            CacheFingerprintItem(
                artifact_type="qa_answer",
                item_key=item_key,
                fingerprint=fingerprint,
                label=text,
                qa_cache_key=cache_key,
                metadata=metadata,
            )
        )
        items.append(
            CacheFingerprintItem(
                artifact_type="qa_audio",
                item_key=item_key,
                fingerprint=fingerprint,
                label=text,
                qa_cache_key=cache_key,
                metadata=metadata,
            )
        )
    return items


def build_location_intro_item(location: Any) -> CacheFingerprintItem | None:
    intro_message = _clean_string(getattr(location, "intro_message", ""))
    mascot = getattr(location, "mascot", None)
    if getattr(location, "status", "active") != "active" or mascot is None or not intro_message:
        return None

    return CacheFingerprintItem(
        artifact_type="location_intro_audio",
        item_key=location_intro_item_key(location.id),
        fingerprint=location_intro_fingerprint(location),
        label=f"Location intro: {_clean_string(getattr(location, 'name', ''))}",
        metadata={
            "location_id": str(location.id),
            "location_slug": _clean_string(getattr(location, "slug", "")),
            "intro_length": len(intro_message),
            "mascot_id": str(mascot.id),
            "mascot_name": _clean_string(getattr(mascot, "name", "")),
        },
    )


def build_mascot_intro_item(mascot: Any) -> CacheFingerprintItem:
    return CacheFingerprintItem(
        artifact_type="intro_audio",
        item_key=intro_item_key(mascot.id),
        fingerprint=mascot_intro_fingerprint(mascot),
        label=f"Intro audio: {_clean_string(getattr(mascot, 'name', ''))}",
        metadata={"mascot_id": str(mascot.id), "mascot_name": _clean_string(getattr(mascot, "name", ""))},
    )
