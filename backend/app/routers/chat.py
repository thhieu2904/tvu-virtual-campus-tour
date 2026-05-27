"""
Chat router — Public endpoints for AI chat interaction.
Layer 1 (HTTP): Parse request → call Service → stream response (SSE).
"""

import hashlib
import asyncio
from pathlib import Path
import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.ai import tts_engine
from app.ai.tts_engine import CONTENT_TYPE_MP3, CONTENT_TYPE_WAV
from app.cache import qa_cache_store, tts_key_cache
from app.db.database import async_session, get_db
from app.repositories import location_repo
from app.schemas.chat import ChatRequest, SessionResponse, TTSRequest
from app.services import rag_service, storage_service

logger = logging.getLogger(__name__)
router = APIRouter()


def _runtime_audio_url(api_request: Request, filename: str) -> str:
    return str(api_request.url_for("get_runtime_tts_audio", filename=filename))


async def _sync_tts_to_r2(local_path: str, r2_key: str, content_type: str) -> None:
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


@router.post("/chat")
async def chat(
    request: ChatRequest,
    api_request: Request,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
):
    """
    POST /api/chat
    Send a message and receive AI response.

    Supports three modes:
    - tts=true (kiosk default): Returns JSON with text + audio_base64 + tool_actions
    - stream=true: Returns SSE event stream (text only, for muted mode)
    - stream=false, tts=false: Returns JSON response (text only)
    """
    # Resolve location name and mascot config
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

        # Release DB connection before any long processing
        await session.commit()

    # ── Mode 1: Audio-First (Kiosk TTS) ──
    if request.tts:
        # 1. Kiểm tra QA Cache (Semantic Cache cho Suggested Questions)
        cache_key = hashlib.md5(f"{request.message}_{location_name}".encode()).hexdigest()
        cached_response = qa_cache_store.get(cache_key)
        if cached_response:
            logger.info("🎯 Trúng QA Cache cho câu hỏi: %s", request.message)
            return JSONResponse(content=cached_response)

        # 2. Không trúng QA Cache -> Gọi RAG Service
        result = await rag_service.process_query(
            session=session,
            message=request.message,
            location_id=request.location_id,
            session_id=request.session_id,
            history=request.history,
            location_name=location_name,
            personality_prompt=personality_prompt,
            voice_style=voice_style,
        )

        answer_text = result.get("answer", "")
        audio_url = None
        audio_base64 = None

        if answer_text and not result.get("error"):
            # Ensure DB connection is released before TTS synthesis
            await session.commit()
            tool_actions = result.get("tool_actions") or []
            tool_names = {
                action.get("name")
                for action in tool_actions
                if isinstance(action, dict)
            }
            should_skip_tts_on_miss = "show_media" in tool_names and "navigate_to" not in tool_names

            # 3. MD5 Hash Answer cho TTS Cache
            # Include the TTS prompt version and persona so stale audio generated
            # with weaker voice instructions is not reused for new answers.
            voice_name = "Leda"
            if request.location_id and location and location.mascot:
                voice_name = location.mascot.voice_name

            style = voice_style or ""
            persona = personality_prompt or ""
            answer_hash = hashlib.md5(
                f"{tts_engine.TTS_PROMPT_VERSION}_{answer_text}_{voice_name}_{style}_{persona}".encode()
            ).hexdigest()
            wav_r2_key = f"tts-cache/{answer_hash}.wav"
            mp3_r2_key = f"tts-cache/{answer_hash}.mp3"
            logger.warning(
                "TTS voice selected: location=%s voice=%s style=%s persona_set=%s cache=%s",
                location_name,
                voice_name,
                style,
                bool(persona),
                answer_hash,
            )

            try:
                cached_r2_key = None
                if tts_key_cache.loaded:
                    if tts_key_cache.contains(wav_r2_key):
                        cached_r2_key = wav_r2_key
                    elif tts_key_cache.contains(mp3_r2_key):
                        cached_r2_key = mp3_r2_key
                else:
                    if await storage_service.file_exists(wav_r2_key):
                        cached_r2_key = wav_r2_key
                    elif await storage_service.file_exists(mp3_r2_key):
                        cached_r2_key = mp3_r2_key
                    if cached_r2_key:
                        tts_key_cache.add(cached_r2_key)

                if cached_r2_key:
                    logger.info("🎯 Trúng TTS Cache MD5: %s", answer_hash)
                    audio_url = storage_service.get_public_url(cached_r2_key)
                elif should_skip_tts_on_miss:
                    logger.info("Skip TTS miss for visual-only tool action: %s", tool_names)
                elif runtime_cached := tts_engine.get_runtime_cached(answer_hash):
                    path, content_type, filename = runtime_cached
                    r2_key = mp3_r2_key if content_type == CONTENT_TYPE_MP3 else wav_r2_key
                    logger.info("🎯 Trúng local TTS cache: %s", filename)
                    audio_url = _runtime_audio_url(api_request, filename)
                    background_tasks.add_task(
                        _sync_tts_to_r2,
                        str(path),
                        r2_key,
                        content_type,
                    )
                else:
                    logger.info("Miss TTS Cache, generating new audio...")
                    # Get voice config
                    voice = "Leda"
                    if request.location_id and location and location.mascot:
                        voice = location.mascot.voice_name

                    tts_result = await tts_engine.synthesize(
                        text=answer_text,
                        voice_name=voice,
                        voice_style=voice_style,
                        personality_prompt=personality_prompt,
                    )
                    if tts_result.content_type == CONTENT_TYPE_MP3:
                        r2_key = mp3_r2_key
                    else:
                        r2_key = wav_r2_key

                    content_type = tts_result.content_type or CONTENT_TYPE_WAV
                    filename = tts_engine.save_runtime_cache(
                        answer_hash,
                        tts_result.audio_data,
                        content_type,
                    )
                    local_path = str(tts_engine.RUNTIME_CACHE_DIR / filename)
                    audio_url = _runtime_audio_url(api_request, filename)
                    background_tasks.add_task(
                        _sync_tts_to_r2,
                        local_path,
                        r2_key,
                        content_type,
                    )
                    logger.info("Saved local TTS cache and queued R2 sync: %s -> %s", filename, r2_key)
            except Exception as e:
                logger.warning("TTS synthesis or R2 upload failed: %s", e)
                # Fallback to base64 if R2 fails (if we even generated audio)
                pass

        result["audio_url"] = audio_url
        result["audio_base64"] = audio_base64
        return JSONResponse(content=result)

    # ── Mode 2: SSE Streaming (Muted / text-only) ──
    if request.stream:
        async def event_generator():
            async with async_session() as stream_session:
                async for chunk in rag_service.process_query_stream(
                    session=stream_session,
                    message=request.message,
                    location_id=request.location_id,
                    session_id=request.session_id,
                    history=request.history,
                    location_name=location_name,
                    personality_prompt=personality_prompt,
                    voice_style=voice_style,
                ):
                    yield {
                        "event": chunk.type,
                        "data": json.dumps(
                            {"content": chunk.content},
                            ensure_ascii=False,
                        ),
                    }
                await stream_session.commit()

        return EventSourceResponse(event_generator())

    # ── Mode 3: Non-streaming JSON (default fallback) ──
    result = await rag_service.process_query(
        session=session,
        message=request.message,
        location_id=request.location_id,
        session_id=request.session_id,
        history=request.history,
        location_name=location_name,
        personality_prompt=personality_prompt,
        voice_style=voice_style,
    )
    return JSONResponse(content=result)


@router.post("/chat/session", response_model=SessionResponse)
async def create_session(session: AsyncSession = Depends(get_db)):
    """
    POST /api/chat/session
    Creates a new chat session when user starts a tour.
    """
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
    """
    POST /api/tts
    Synthesize speech from text and return binary audio.
    """
    try:
        result = await tts_engine.synthesize(
            text=request.text,
            voice_name=request.voice_name,
            voice_style=request.voice_style
        )
        return Response(content=result.audio_data, media_type=result.content_type)
    except Exception as e:
        logger.error("TTS endpoint error: %s", e)
        return JSONResponse({"error": "Failed to synthesize speech"}, status_code=500)
