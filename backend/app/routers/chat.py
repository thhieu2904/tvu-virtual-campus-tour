"""Chat router — public endpoints for AI chat interaction."""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.ai import tts_engine
from app.cache import qa_cache_store
from app.config import get_settings
from app.db.database import async_session, get_db
from app.repositories import location_repo
from app.schemas.chat import ChatRequest, SessionResponse, TTSRequest
from app.services import cache_fingerprint_service, chat_tts_service, rag_service

logger = logging.getLogger(__name__)
router = APIRouter()


def build_sse_event(event: str, payload: dict[str, Any]) -> dict[str, str]:
    """Build one SSE event with a single JSON encoding layer."""
    return {
        "event": event,
        "data": json.dumps(payload, ensure_ascii=False),
    }


def _runtime_audio_url(api_request: Request, filename: str) -> str:
    path = api_request.url_for("get_runtime_tts_audio", filename=filename).path

    origin = api_request.headers.get("origin", "").rstrip("/")
    if origin.startswith("https://"):
        return f"{origin}{path}"

    forwarded_proto = api_request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    forwarded_host = (
        api_request.headers.get("x-forwarded-host", "").split(",", 1)[0].strip()
        or api_request.headers.get("host", "")
    )
    if forwarded_proto == "https" and forwarded_host:
        return f"https://{forwarded_host}{path}"

    return str(api_request.url_for("get_runtime_tts_audio", filename=filename))


def _voice_name(location: Any | None) -> str:
    if location and getattr(location, "mascot", None):
        return location.mascot.voice_name or get_settings().GEMINI_DEFAULT_VOICE
    return get_settings().GEMINI_DEFAULT_VOICE


def _schedule_audio_sync(
    background_tasks: BackgroundTasks,
    audio: chat_tts_service.ChatAudioResult,
) -> None:
    if not audio.sync_local_path or not audio.sync_r2_key or not audio.content_type:
        return
    background_tasks.add_task(
        chat_tts_service.sync_tts_to_r2,
        audio.sync_local_path,
        audio.sync_r2_key,
        audio.content_type,
    )


def _audio_payload(
    request_id: str,
    api_request: Request,
    audio: chat_tts_service.ChatAudioResult,
) -> dict[str, Any]:
    audio_url = audio.audio_url
    if not audio_url and audio.runtime_filename:
        audio_url = _runtime_audio_url(api_request, audio.runtime_filename)
    return {
        "request_id": request_id,
        "url": audio_url,
        "provider": audio.provider,
        "content_type": audio.content_type,
        "cache_status": audio.cache_status,
        "timings": {
            "tts_lookup_ms": audio.lookup_ms,
            "tts_generation_ms": audio.generation_ms,
            "tts_total_ms": audio.total_ms,
        },
    }


async def _get_chat_result(
    *,
    session: AsyncSession,
    request: ChatRequest,
    location_name: str,
    personality_prompt: str | None,
    voice_style: str | None,
    allow_qa_cache: bool,
    persist: bool,
) -> tuple[dict[str, Any], bool]:
    if allow_qa_cache:
        cache_key = cache_fingerprint_service.qa_cache_lookup_key(request.message, location_name)
        cached_response = qa_cache_store.get(cache_key)
        if cached_response:
            answer = str(cached_response.get("answer") or "")
            tool_actions = (
                cached_response.get("tool_actions")
                if isinstance(cached_response.get("tool_actions"), list)
                else []
            )
            tool_actions = await rag_service.validate_tool_actions(session, tool_actions)
            exchange_saved = persist and await rag_service.save_chat_exchange(
                session=session,
                session_id=request.session_id,
                location_id=request.location_id,
                user_message=request.message,
                assistant_message=answer,
                response_time_ms=0,
                input_type=request.input_type,
                tool_calls_data=tool_actions or None,
            )
            if exchange_saved:
                await session.commit()
            result = dict(cached_response)
            result["answer"] = answer
            result["tool_actions"] = tool_actions
            result.setdefault("sources", [])
            result["response_time_ms"] = 0
            result["timings"] = {"qa_cache_ms": 0.0, "total_rag_ms": 0.0}
            return result, True

    result = await rag_service.process_query(
        session=session,
        message=request.message,
        location_id=request.location_id,
        session_id=request.session_id,
        history=request.history,
        location_name=location_name,
        personality_prompt=personality_prompt,
        voice_style=voice_style,
        input_type=request.input_type,
        persist=persist,
    )
    return result, False


async def _persist_stream_exchange(
    request: ChatRequest,
    result: dict[str, Any],
) -> None:
    if not request.session_id:
        return

    async with async_session() as persist_session:
        saved = await rag_service.save_chat_exchange(
            session=persist_session,
            session_id=request.session_id,
            location_id=request.location_id,
            user_message=request.message,
            assistant_message=str(result.get("answer") or ""),
            response_time_ms=int(result.get("response_time_ms") or 0),
            input_type=request.input_type,
            tool_calls_data=result.get("tool_actions") or None,
        )
        if saved:
            await persist_session.commit()


async def _stream_chat_events(
    *,
    request: ChatRequest,
    api_request: Request,
    background_tasks: BackgroundTasks,
    location: Any | None,
    location_name: str,
    personality_prompt: str | None,
    voice_style: str | None,
):
    request_id = uuid.uuid4().hex
    stream_started = time.perf_counter()
    yield build_sse_event("start", {"request_id": request_id})

    try:
        async with async_session() as stream_session:
            result, cache_hit = await _get_chat_result(
                session=stream_session,
                request=request,
                location_name=location_name,
                personality_prompt=personality_prompt,
                voice_style=voice_style,
                allow_qa_cache=request.tts,
                persist=False,
            )
    except Exception as exc:
        logger.exception("Chat SSE pipeline failed before answer: %s", exc)
        yield build_sse_event(
            "error",
            {
                "request_id": request_id,
                "code": "CHAT_FAILED",
                "message": "Không thể tạo câu trả lời lúc này.",
                "recoverable": False,
            },
        )
        return

    answer = str(result.get("answer") or "")
    tool_actions = result.get("tool_actions") if isinstance(result.get("tool_actions"), list) else []
    sources = result.get("sources") if isinstance(result.get("sources"), list) else []
    timings = dict(result.get("timings") or {})
    timings["time_to_answer_ms"] = round((time.perf_counter() - stream_started) * 1000, 2)

    yield build_sse_event(
        "answer",
        {
            "request_id": request_id,
            "text": answer,
            "response_time_ms": result.get("response_time_ms", 0),
            "timings": timings,
            "cache_hit": cache_hit,
            "error": bool(result.get("error")),
        },
    )

    if tool_actions:
        yield build_sse_event(
            "tool_actions",
            {"request_id": request_id, "actions": tool_actions},
        )

    yield build_sse_event(
        "sources",
        {"request_id": request_id, "items": sources},
    )

    if request.session_id:
        background_tasks.add_task(_persist_stream_exchange, request, result)

    audio_payload: dict[str, Any] | None = None
    if request.tts and answer and not result.get("error") and not await api_request.is_disconnected():
        cached_audio_url = result.get("audio_url") if cache_hit else None
        if isinstance(cached_audio_url, str) and cached_audio_url:
            audio_payload = {
                "request_id": request_id,
                "url": cached_audio_url,
                "provider": result.get("tts_provider") or "cache",
                "content_type": result.get("audio_content_type"),
                "cache_status": "qa",
                "timings": {
                    "tts_lookup_ms": 0.0,
                    "tts_generation_ms": 0.0,
                    "tts_total_ms": 0.0,
                },
            }
        else:
            try:
                audio = await asyncio.wait_for(
                    chat_tts_service.resolve_chat_audio(
                        answer_text=answer,
                        tool_actions=tool_actions,
                        voice_name=_voice_name(location),
                        voice_style=voice_style,
                        personality_prompt=personality_prompt,
                    ),
                    timeout=30,
                )
                if audio:
                    _schedule_audio_sync(background_tasks, audio)
                    audio_payload = _audio_payload(request_id, api_request, audio)
            except TimeoutError:
                logger.warning("TTS timed out for request %s", request_id)
                yield build_sse_event(
                    "error",
                    {
                        "request_id": request_id,
                        "code": "TTS_TIMEOUT",
                        "message": "Giọng nói chưa sẵn sàng, phần chữ vẫn hoạt động bình thường.",
                        "recoverable": True,
                    },
                )
            except Exception as exc:
                logger.warning("TTS failed for request %s: %s", request_id, exc)
                yield build_sse_event(
                    "error",
                    {
                        "request_id": request_id,
                        "code": "TTS_FAILED",
                        "message": "Không thể tạo giọng nói, phần chữ vẫn hoạt động bình thường.",
                        "recoverable": True,
                    },
                )

    if audio_payload and audio_payload.get("url"):
        timings.update(audio_payload["timings"])
        timings["time_to_audio_ready_ms"] = round(
            (time.perf_counter() - stream_started) * 1000,
            2,
        )
        audio_payload["timings"]["time_to_audio_ready_ms"] = timings["time_to_audio_ready_ms"]
        yield build_sse_event("audio_ready", audio_payload)

    timings["total_stream_ms"] = round((time.perf_counter() - stream_started) * 1000, 2)
    yield build_sse_event(
        "done",
        {
            "request_id": request_id,
            "answer": answer,
            "response_time_ms": result.get("response_time_ms", 0),
            "timings": timings,
            "has_audio": bool(audio_payload and audio_payload.get("url")),
        },
    )


async def _attach_legacy_audio(
    *,
    result: dict[str, Any],
    api_request: Request,
    background_tasks: BackgroundTasks,
    location: Any | None,
    personality_prompt: str | None,
    voice_style: str | None,
) -> dict[str, Any]:
    result["audio_url"] = None
    result["audio_base64"] = None
    result["tts_provider"] = None
    if not result.get("answer") or result.get("error"):
        return result

    try:
        audio = await chat_tts_service.resolve_chat_audio(
            answer_text=str(result["answer"]),
            tool_actions=result.get("tool_actions") or [],
            voice_name=_voice_name(location),
            voice_style=voice_style,
            personality_prompt=personality_prompt,
        )
        if not audio:
            return result
        _schedule_audio_sync(background_tasks, audio)
        payload = _audio_payload("legacy", api_request, audio)
        result["audio_url"] = payload["url"]
        result["tts_provider"] = payload["provider"]
        result["audio_content_type"] = payload["content_type"]
        result.setdefault("timings", {}).update(payload["timings"])
    except Exception as exc:
        logger.warning("Legacy TTS synthesis failed: %s", exc)
    return result


@router.post("/chat")
async def chat(
    request: ChatRequest,
    api_request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
):
    """Send a chat message as SSE or a backward-compatible JSON response."""
    location_name = "Sảnh Chính"
    personality_prompt = None
    voice_style = None
    location = None

    if request.location_id:
        location = await location_repo.get_by_id(session, request.location_id)
        if location:
            location_name = location.name
            if location.mascot:
                personality_prompt = location.mascot.personality_prompt
                voice_style = location.mascot.voice_style
        await session.commit()

    if request.stream:
        return EventSourceResponse(
            _stream_chat_events(
                request=request,
                api_request=api_request,
                background_tasks=background_tasks,
                location=location,
                location_name=location_name,
                personality_prompt=personality_prompt,
                voice_style=voice_style,
            ),
            ping=15,
            background=background_tasks,
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
            },
        )

    result, cache_hit = await _get_chat_result(
        session=session,
        request=request,
        location_name=location_name,
        personality_prompt=personality_prompt,
        voice_style=voice_style,
        allow_qa_cache=request.tts,
        persist=True,
    )
    if request.tts and not cache_hit:
        result = await _attach_legacy_audio(
            result=result,
            api_request=api_request,
            background_tasks=background_tasks,
            location=location,
            personality_prompt=personality_prompt,
            voice_style=voice_style,
        )
    return JSONResponse(content=result)


@router.post("/chat/session", response_model=SessionResponse)
async def create_session(session: AsyncSession = Depends(get_db)):
    """Create a kiosk chat session."""
    session_id = await rag_service.create_chat_session(session, is_kiosk=True)
    return SessionResponse(session_id=str(session_id))


@router.get("/audio/tts/{filename}", name="get_runtime_tts_audio")
async def get_runtime_tts_audio(filename: str):
    cached = tts_engine.resolve_runtime_cache_file(filename)
    if cached is None:
        raise HTTPException(status_code=404, detail="Audio not found")

    path, content_type = cached
    return FileResponse(
        path,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.post("/tts")
async def text_to_speech(request: TTSRequest):
    """Synthesize text and return binary audio."""
    try:
        result = await tts_engine.synthesize(
            text=request.text,
            voice_name=request.voice_name,
            voice_style=request.voice_style,
        )
        return Response(content=result.audio_data, media_type=result.content_type)
    except Exception as exc:
        logger.error("TTS endpoint error: %s", exc)
        return JSONResponse({"error": "Failed to synthesize speech"}, status_code=500)
