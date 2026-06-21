"""Pydantic schemas for Chat endpoints and validated UI tool actions."""

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


class ChatRequest(BaseModel):
    """POST /api/chat request body."""

    message: str
    location_id: Optional[str] = None
    session_id: Optional[str] = None
    input_type: str = "text"  # "text" | "voice"
    history: Optional[list[dict]] = None  # Frontend sends recent history in-memory
    stream: bool = False  # True = SSE streaming, False = JSON response
    tts: bool = False  # True = include TTS audio when supported by the response mode


class ChatResponse(BaseModel):
    """Standard chat response (non-streaming)."""

    answer: str
    thinking: Optional[str] = None
    sources: list[dict] = Field(default_factory=list)
    response_time_ms: int = 0


class SessionResponse(BaseModel):
    """POST /api/chat/session response."""

    session_id: str


class TTSRequest(BaseModel):
    """POST /api/tts request body."""

    text: str = Field(..., max_length=1000)
    voice_name: Optional[str] = None
    voice_style: Optional[str] = None


class NavigateArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    location_slug: str = Field(min_length=1, max_length=100)


class NavigateAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Literal["navigate_to"]
    args: NavigateArgs


class ShowMediaArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    media_type: Literal["video", "image", "all"]
    search_query: str | None = Field(default=None, max_length=200)
    focus_media_id: str | None = Field(default=None, max_length=100)


class ShowMediaAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Literal["show_media"]
    args: ShowMediaArgs


class ToggleMapArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: Literal["open", "close"]


class ToggleMapAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Literal["toggle_map"]
    args: ToggleMapArgs


ToolAction = Annotated[
    Union[NavigateAction, ShowMediaAction, ToggleMapAction],
    Field(discriminator="name"),
]
TOOL_ACTION_ADAPTER = TypeAdapter(ToolAction)
