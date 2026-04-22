"""
Chat router — Public endpoints for AI chat interaction.
Layer 1 (HTTP): Parse request → call Service → stream response (SSE).
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.schemas.chat import ChatRequest

router = APIRouter()


@router.post("/chat")
async def chat(request: ChatRequest):
    """
    POST /api/chat
    Send a message and receive AI response via SSE stream.
    Supports text input and voice input (transcribed by frontend).
    """
    # TODO: Implement SSE streaming
    # 1. Call rag_service.process_query(request)
    # 2. Stream text chunks + audio chunks via SSE
    # 3. Return tool actions (navigate_to, show_media, etc.)
    return JSONResponse(
        content={
            "message": "Chat endpoint not implemented yet",
            "received": request.message,
        }
    )


@router.post("/chat/session")
async def create_session():
    """
    POST /api/chat/session
    Creates a new chat session when user starts a tour.
    """
    # TODO: Call session_service.create_session()
    return {"session_id": "placeholder-session-id"}
