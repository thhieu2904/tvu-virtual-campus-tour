"""
Admin router — Protected endpoints for content management.
Layer 1 (HTTP): All endpoints require X-Admin-Key header.
"""

from fastapi import APIRouter, Depends, UploadFile, File, Form
from typing import Optional

from app.dependencies import verify_admin_key

router = APIRouter(dependencies=[Depends(verify_admin_key)])


# === Dashboard ===
@router.get("/stats")
async def get_dashboard_stats():
    """
    GET /api/admin/stats
    Returns dashboard statistics (sessions, messages, charts data).
    """
    # TODO: Call stats_service.get_dashboard_stats()
    return {"message": "Not implemented yet"}


# === Locations ===
@router.get("/locations/summary")
async def get_locations_summary():
    """
    GET /api/admin/locations/summary
    Returns all locations with document/asset counts.
    """
    # TODO: Call location_service.get_locations_summary()
    return {"locations": []}


@router.put("/locations/{location_id}")
async def update_location(location_id: str):
    """
    PUT /api/admin/locations/{id}
    Update location metadata (name, description, intro_message, questions).
    """
    # TODO: Call location_service.update_location(location_id, data)
    return {"message": "Not implemented yet"}


@router.put("/locations/{location_id}/background")
async def upload_background(
    location_id: str,
    file: UploadFile = File(...),
):
    """
    PUT /api/admin/locations/{id}/background
    Upload new 360° background image for a location.
    """
    # TODO: Call storage_service.upload_background(location_id, file)
    return {"message": "Not implemented yet"}


# === Documents (RAG) ===
@router.post("/ingest")
async def ingest_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    location_id: Optional[str] = Form(None),
):
    """
    POST /api/admin/ingest
    Upload PDF/DOCX → extract → chunk → embed → store in pgvector.
    Returns immediately with status 'pending', processes in background.
    """
    # TODO: Call ingest_service.start_ingestion(file, title, location_id)
    return {"document_id": "placeholder", "status": "pending"}


@router.get("/documents")
async def list_documents(
    location_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
):
    """
    GET /api/admin/documents?location_id=&status=&search=&page=&limit=
    List all documents with filtering and pagination.
    """
    # TODO: Call document_service.list_documents(filters)
    return {"total": 0, "documents": []}


@router.get("/documents/{document_id}/status")
async def get_document_status(document_id: str):
    """
    GET /api/admin/documents/{id}/status
    Check processing status of a document.
    """
    # TODO: Call document_service.get_status(document_id)
    return {"status": "pending", "chunk_count": 0}


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str):
    """
    DELETE /api/admin/documents/{id}
    Delete document + chunks + file from R2.
    """
    # TODO: Call document_service.delete(document_id)
    return {"success": True}


# === Media/Assets ===
@router.post("/media")
async def upload_media(
    file: UploadFile = File(...),
    caption: str = Form(""),
    keywords: str = Form("[]"),
    is_intro: bool = Form(False),
    location_id: str = Form(...),
):
    """
    POST /api/admin/media
    Upload media (image/video/gif) for Info Panel display.
    """
    # TODO: Call media_service.upload(file, metadata)
    return {"id": "placeholder", "url": "", "type": "image"}


@router.get("/media")
async def list_media(
    location_id: Optional[str] = None,
    type: Optional[str] = None,
    is_intro: Optional[bool] = None,
    page: int = 1,
    limit: int = 10,
):
    """
    GET /api/admin/media?location_id=&type=&is_intro=&page=&limit=
    List all media assets with filtering.
    """
    # TODO: Call media_service.list_media(filters)
    return {"total": 0, "media": []}


@router.delete("/media/{media_id}")
async def delete_media(media_id: str):
    """
    DELETE /api/admin/media/{id}
    Delete media file from R2 and database.
    """
    # TODO: Call media_service.delete(media_id)
    return {"success": True}
