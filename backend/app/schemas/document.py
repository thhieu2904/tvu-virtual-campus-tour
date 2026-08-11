"""
Pydantic schemas for Document/Ingest endpoints (Request/Response DTOs).
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class IngestResponse(BaseModel):
    """POST /api/admin/ingest response."""

    document_id: str
    status: str  # "pending"


class DocumentResponse(BaseModel):
    """Document item in list response."""

    id: str
    title: str
    file_url: str
    file_type: str  # "pdf" | "docx"
    file_size: int  # bytes
    location_id: Optional[str] = None
    location_name: Optional[str] = None
    chunk_count: int = 0
    status: str  # "pending" | "processing" | "ready" | "error"
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None


class DocumentStatusResponse(BaseModel):
    """GET /api/admin/documents/{id}/status response."""

    status: str
    chunk_count: int = 0
    error_message: Optional[str] = None
