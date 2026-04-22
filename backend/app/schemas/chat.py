"""
Pydantic schemas for Chat endpoints (Request/Response DTOs).
"""

from pydantic import BaseModel
from typing import Optional


class ChatRequest(BaseModel):
    """POST /api/chat request body."""

    message: str
    location_id: str
    session_id: Optional[str] = None
    input_type: str = "text"  # "text" | "voice"


class ChatResponse(BaseModel):
    """Standard chat response (non-streaming)."""

    answer: str
    sources: list[str] = []
    suggested_questions: list[str] = []
    tool_action: Optional[dict] = None  # { tool: "navigate_to", location_slug: "..." }
