"""
Admin router — Protected endpoints for content management.
Layer 1 (HTTP): All endpoints require X-Admin-Key header.
"""

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.dependencies import verify_admin_key
from app.repositories import document_repo, location_repo
from app.services import ingest_service, storage_service
from app.schemas.document import IngestResponse, DocumentStatusResponse

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
@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def ingest_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    location_id: Optional[str] = Form(None),
    session: AsyncSession = Depends(get_db),
):
    """
    POST /api/admin/ingest
    Upload PDF/DOCX → extract → chunk → embed → store in pgvector.
    Returns immediately with status 'pending', processes in background.
    """
    # Read file bytes
    file_bytes = await file.read()
    filename = file.filename or "document.pdf"

    # Validate file
    try:
        ingest_service.validate_file(filename, len(file_bytes))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Resolve location UUID and slug
    loc_uuid: UUID | None = None
    loc_slug: str | None = None
    if location_id:
        location = await location_repo.get_by_id(session, location_id)
        if location:
            loc_uuid = location.id
            loc_slug = location.slug
        else:
            raise HTTPException(status_code=404, detail=f"Location {location_id} not found")

    # Stage 1: Upload to R2 + create DB record
    doc_id = await ingest_service.start_ingestion(
        file_bytes=file_bytes,
        filename=filename,
        title=title,
        location_id=loc_uuid,
        location_slug=loc_slug,
    )

    # Stage 2: Schedule background processing
    background_tasks.add_task(
        ingest_service.process_document_background,
        document_id=doc_id,
        file_bytes=file_bytes,
        filename=filename,
        location_id=loc_uuid,
    )

    return IngestResponse(document_id=str(doc_id), status="pending")


@router.get("/documents")
async def list_documents(
    location_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 10,
    session: AsyncSession = Depends(get_db),
):
    """
    GET /api/admin/documents?location_id=&status=&search=&page=&limit=
    List all documents with filtering and pagination.
    """
    loc_uuid = UUID(location_id) if location_id else None
    return await document_repo.list_documents(
        session,
        location_id=loc_uuid,
        status=status,
        search=search,
        page=page,
        limit=limit,
    )


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: str,
    session: AsyncSession = Depends(get_db),
):
    """
    GET /api/admin/documents/{id}/status
    Check processing status of a document.
    """
    doc = await document_repo.get_by_id(session, UUID(document_id))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentStatusResponse(
        status=doc.status,
        chunk_count=doc.chunk_count,
        error_message=doc.error_message,
    )


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    session: AsyncSession = Depends(get_db),
):
    """
    DELETE /api/admin/documents/{id}
    Delete document + chunks + file from R2.
    """
    file_url = await document_repo.delete_with_chunks(session, UUID(document_id))
    if file_url is None:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete from R2 (best-effort, don't fail if R2 delete fails)
    await storage_service.delete_file(file_url)

    return {"success": True, "deleted_file": file_url}


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
