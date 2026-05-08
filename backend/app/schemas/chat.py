"""
Pydantic schemas for Chat endpoints (Request/Response DTOs).
"""

from pydantic import BaseModel, Field
from typing import Optional


class ChatRequest(BaseModel):
    """POST /api/chat request body."""

    message: str
    location_id: Optional[str] = None
    session_id: Optional[str] = None
    input_type: str = "text"  # "text" | "voice"
    history: Optional[list[dict]] = None  # Frontend sends recent history in-memory
    stream: bool = False  # True = SSE streaming, False = JSON response
    tts: bool = False  # True = bundle TTS audio (base64) in JSON response


class ChatResponse(BaseModel):
    """Standard chat response (non-streaming)."""

    answer: str
    thinking: Optional[str] = None
    sources: list[dict] = []
    response_time_ms: int = 0


class SessionResponse(BaseModel):
    """POST /api/chat/session response."""

    session_id: str


class TTSRequest(BaseModel):
    """POST /api/tts request body."""
    text: str = Field(..., max_length=1000)
    voice_name: Optional[str] = None
    voice_style: Optional[str] = None
