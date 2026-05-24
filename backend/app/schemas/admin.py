"""Schemas shared by Admin API endpoints."""

from typing import Any, Literal

from pydantic import BaseModel, Field

LocationStatus = Literal["active", "inactive"]
MediaType = Literal["image", "video", "gif"]


class LocationUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    intro_message: str | None = None
    status: LocationStatus | None = None
    is_start_node: bool | None = None
    mascot_id: str | None = None
    sort_order: int | None = None
    camera_config: dict[str, Any] | None = None


class SuggestedQuestionInput(BaseModel):
    question: str
    sort_order: int | None = None


class LocationQuestionsUpdateRequest(BaseModel):
    questions: list[SuggestedQuestionInput | str] = Field(default_factory=list)


class LocationLinkInput(BaseModel):
    to_location_id: str
    label: str = ""


class LocationLinksUpdateRequest(BaseModel):
    links: list[LocationLinkInput] = Field(default_factory=list)


class MediaUpdateRequest(BaseModel):
    caption: str | None = None
    keywords: list[str] | None = None
    is_intro: bool | None = None
    sort_order: int | None = None


class MascotUpdateRequest(BaseModel):
    model_config = {"protected_namespaces": ()}

    name: str | None = None
    model_3d_url: str | None = None
    voice_name: str | None = None
    voice_style: str | None = None
    personality_prompt: str | None = None
    is_default: bool | None = None


class KioskConfigResponse(BaseModel):
    idle_timeout_minutes: int = 10
    warning_duration_seconds: int = 60
    kiosk_mode: bool = True
    default_start_slug: str = "cong-chinh"
    tts_enabled_default: bool = True
