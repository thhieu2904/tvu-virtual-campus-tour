"""
Pydantic schemas for Location endpoints (Request/Response DTOs).
"""

from pydantic import BaseModel
from typing import Optional


class LocationResponse(BaseModel):
    """Location data returned to frontend."""

    id: str
    name: str
    slug: str
    status: str  # "active" | "inactive"
    map_x: float
    map_y: float
    is_start_node: bool = False
    background_url: Optional[str] = None


class LocationDetailResponse(LocationResponse):
    """Detailed location data with description and links."""

    description: str = ""
    intro_message: str = ""
    suggested_questions: list[str] = []
    links: list[dict] = []  # [{ to_slug, label }]


class LocationUpdateRequest(BaseModel):
    """PUT /api/admin/locations/{id} request body."""

    name: Optional[str] = None
    description: Optional[str] = None
    intro_message: Optional[str] = None
    suggested_questions: Optional[list[str]] = None
