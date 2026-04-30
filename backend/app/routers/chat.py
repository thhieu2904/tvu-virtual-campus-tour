"""
Chat router — Public endpoints for AI chat interaction.
Layer 1 (HTTP): Parse request → call Service → stream response (SSE).
"""

import json
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.db.database import get_db, async_session
from app.schemas.chat import ChatRequest, ChatResponse, SessionResponse
from app.services import rag_service
from app.repositories import location_repo

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/chat")
async def chat(request: ChatRequest, session: AsyncSession = Depends(get_db)):
    """
    POST /api/chat
    Send a message and receive AI response.

    Supports two modes:
    - stream=false (default): Returns JSON response
    - stream=true: Returns SSE event stream
    """
    # Resolve location name for prompt context
    location_name = "Sảnh Chính"
    if request.location_id:
        location = await location_repo.get_by_id(session, request.location_id)
        if location:
            location_name = location.name

    if request.stream:
        # SSE streaming mode — uses self-managed session because
        # EventSourceResponse may outlive the request's DB session
        # (Supabase pooler can timeout long-lived connections).
        async def event_generator():
            async with async_session() as stream_session:
                async for chunk in rag_service.process_query_stream(
                    session=stream_session,
                    message=request.message,
                    location_id=request.location_id,
                    session_id=request.session_id,
                    history=request.history,
                    location_name=location_name,
                ):
                    yield {
                        "event": chunk.type,
                        "data": json.dumps(
                            {"content": chunk.content},
                            ensure_ascii=False,
                        ),
                    }

        return EventSourceResponse(event_generator())

    # Non-streaming mode (default)
    result = await rag_service.process_query(
        session=session,
        message=request.message,
        location_id=request.location_id,
        session_id=request.session_id,
        history=request.history,
        location_name=location_name,
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
