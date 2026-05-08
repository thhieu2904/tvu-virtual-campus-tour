"""
Chat router — Public endpoints for AI chat interaction.
Layer 1 (HTTP): Parse request → call Service → stream response (SSE).
"""

import json
import logging
import base64
import hashlib
import os

from fastapi import APIRouter, Depends, Response
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.db.database import get_db, async_session
from app.schemas.chat import ChatRequest, ChatResponse, SessionResponse, TTSRequest
from app.services import rag_service
from app.repositories import location_repo
from app.ai import tts_engine
from app.services import storage_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/chat")
async def chat(request: ChatRequest, session: AsyncSession = Depends(get_db)):
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
    
    if request.location_id:
        location = await location_repo.get_by_id(session, request.location_id)
        if location:
            location_name = location.name
            if location.mascot:
                personality_prompt = location.mascot.personality_prompt
                voice_style = location.mascot.voice_style

    # ── Mode 1: Audio-First (Kiosk TTS) ──
    if request.tts:
        # 1. Kiểm tra QA Cache (Semantic Cache cho Suggested Questions)
        qa_cache_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "qa_cache.json")
        if os.path.exists(qa_cache_path):
            with open(qa_cache_path, "r", encoding="utf-8") as f:
                qa_cache = json.load(f)
                
            cache_key = hashlib.md5(f"{request.message}_{location_name}".encode()).hexdigest()
            if cache_key in qa_cache:
                logger.info("🎯 Trúng QA Cache cho câu hỏi: %s", request.message)
                return JSONResponse(content=qa_cache[cache_key])
                
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
            # 3. MD5 Hash Answer cho TTS Cache
            # Lấy voice_name của mascot nếu có
            voice_name = "default"
            if request.location_id and location and location.mascot:
                voice_name = location.mascot.voice_name
                
            answer_hash = hashlib.md5(f"{answer_text}_{voice_name}".encode()).hexdigest()
            r2_key = f"global/cache/{answer_hash}.wav"
            
            try:
                is_cached = await storage_service.file_exists(r2_key)
                if is_cached:
                    logger.info("🎯 Trúng TTS Cache MD5: %s", answer_hash)
                    audio_url = storage_service.get_public_url(r2_key)
                else:
                    logger.info("Miss TTS Cache, generating new audio...")
                    # Get voice config
                    voice = "vi-VN-Standard-A"
                    if request.location_id and location and location.mascot:
                        voice = location.mascot.voice_name
                        
                    tts_result = await tts_engine.synthesize(text=answer_text, voice_name=voice)
                    # Upload to R2
                    await storage_service.upload_file(
                        file_bytes=tts_result.audio_data,
                        key=r2_key,
                        content_type="audio/wav"
                    )
                    audio_url = storage_service.get_public_url(r2_key)
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
