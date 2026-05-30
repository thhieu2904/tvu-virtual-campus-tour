"""Schemas shared by Admin API endpoints."""

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

LocationStatus = Literal["active", "inactive"]
MediaType = Literal["image", "video", "gif"]
VALID_GEMINI_VOICES = frozenset(
    {
        "Zephyr",
        "Puck",
        "Charon",
        "Kore",
        "Fenrir",
        "Leda",
        "Orus",
        "Aoede",
        "Callirrhoe",
        "Autonoe",
        "Enceladus",
        "Iapetus",
        "Umbriel",
        "Algieba",
        "Despina",
        "Erinome",
        "Algenib",
        "Rasalgethi",
        "Laomedeia",
        "Achernar",
        "Alnilam",
        "Schedar",
        "Gacrux",
        "Pulcherrima",
        "Achird",
        "Zubenelgenubi",
        "Vindemiatrix",
        "Sadachbia",
        "Sadaltager",
        "Sulafat",
    }
)


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


class DocumentCategoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str | None = Field(default=None, max_length=100)
    description: str = ""
    color: str = "#6366f1"
    sort_order: int = 0

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
            raise ValueError("Slug must be lowercase, ASCII, and hyphenated")
        return value

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str) -> str:
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("Color must be a hex value like #6366f1")
        return value.lower()


class DocumentCategoryUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    slug: str | None = Field(default=None, max_length=100)
    description: str | None = None
    color: str | None = None
    sort_order: int | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return value
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
            raise ValueError("Slug must be lowercase, ASCII, and hyphenated")
        return value

    @field_validator("color")
    @classmethod
    def validate_color(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise ValueError("Color must be a hex value like #6366f1")
        return value.lower()


class DocumentCategoryAssignRequest(BaseModel):
    category_id: str | None = None


class MascotUpdateRequest(BaseModel):
    model_config = {"protected_namespaces": ()}

    name: str | None = None
    model_3d_url: str | None = None
    voice_name: str | None = None
    voice_style: str | None = None
    personality_prompt: str | None = None
    is_default: bool | None = None

    @field_validator("voice_name")
    @classmethod
    def validate_voice_name(cls, value: str | None) -> str | None:
        if value is None or value in VALID_GEMINI_VOICES:
            return value
        valid = ", ".join(sorted(VALID_GEMINI_VOICES))
        raise ValueError(f"Invalid voice_name '{value}'. Valid voices: {valid}")


class KioskConfigResponse(BaseModel):
    idle_timeout_minutes: int = 10
    warning_duration_seconds: int = 60
    kiosk_mode: bool = True
    default_start_slug: str = "cong-chinh"
    tts_enabled_default: bool = True
