"""
Pydantic schemas for Location endpoints (Request/Response DTOs).
"""

from pydantic import BaseModel, Field
from typing import List, Optional

class LinkDTO(BaseModel):
    toSlug: str
    label: str

class LocationNode(BaseModel):
    """Exact schema expected by Frontend Zustand store."""
    id: str
    name: str
    slug: str
    status: str
    mapX: float
    mapY: float
    isStartNode: bool
    description: str
    introMessage: str
    backgroundUrl: str
    suggestedQuestions: List[str]
    links: List[LinkDTO]

    class Config:
        from_attributes = True

class LocationsListResponse(BaseModel):
    locations: List[LocationNode]
