"""
Admin router — Protected endpoints for content management.
All endpoints require Supabase Auth (Bearer JWT token).
"""

import json
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select

from app.db.database import get_db
from app.db.tables import Location, Document, Media, Mascot, SuggestedQuestion
from app.dependencies import verify_supabase_token
from app.repositories import document_repo, location_repo
from app.services import ingest_service, storage_service
from app.schemas.document import IngestResponse, DocumentStatusResponse

router = APIRouter(dependencies=[Depends(verify_supabase_token)])


# ─── Dashboard ───────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_dashboard_stats():
    """GET /api/admin/stats — Dashboard statistics."""
    # TODO: Phase 6
    return {"message": "Not implemented yet"}


# ─── Locations ───────────────────────────────────────────────────────────────

@router.get("/locations")
async def get_locations(session: AsyncSession = Depends(get_db)):
    """GET /api/admin/locations — List all locations with document/media counts."""
    doc_count_sq = (
        select(Document.location_id, func.count(Document.id).label("doc_count"))
        .group_by(Document.location_id)
        .subquery()
    )
    media_count_sq = (
        select(Media.location_id, func.count(Media.id).label("media_count"))
        .group_by(Media.location_id)
        .subquery()
    )

    stmt = (
        select(
            Location,
            func.coalesce(doc_count_sq.c.doc_count, 0).label("doc_count"),
            func.coalesce(media_count_sq.c.media_count, 0).label("media_count"),
        )
        .outerjoin(doc_count_sq, Location.id == doc_count_sq.c.location_id)
        .outerjoin(media_count_sq, Location.id == media_count_sq.c.location_id)
        .order_by(Location.sort_order)
    )

    result = await session.execute(stmt)
    rows = result.all()

    return {
        "locations": [
            {
                "id": str(loc.id),
                "name": loc.name,
                "slug": loc.slug,
                "description": loc.description,
                "intro_message": loc.intro_message,
                "status": loc.status,
                "is_start_node": loc.is_start_node,
                "background_url": loc.background_url,
                "mascot_id": str(loc.mascot_id) if loc.mascot_id else None,
                "sort_order": loc.sort_order,
                "doc_count": doc_count,
                "media_count": media_count,
                "updated_at": loc.updated_at.isoformat() if loc.updated_at else None,
            }
            for loc, doc_count, media_count in rows
        ]
    }


@router.get("/locations/{location_id}")
async def get_location_detail(
    location_id: str,
    session: AsyncSession = Depends(get_db),
):
    """GET /api/admin/locations/{id} — Single location with suggested questions."""
    from sqlalchemy.orm import selectinload

    stmt = (
        select(Location)
        .where(Location.id == UUID(location_id))
        .options(selectinload(Location.suggested_questions))
    )
    result = await session.execute(stmt)
    loc = result.scalar_one_or_none()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    sorted_qs = sorted(loc.suggested_questions, key=lambda q: q.sort_order)

    return {
        "id": str(loc.id),
        "name": loc.name,
        "slug": loc.slug,
        "description": loc.description,
        "intro_message": loc.intro_message,
        "status": loc.status,
        "is_start_node": loc.is_start_node,
        "background_url": loc.background_url,
        "mascot_id": str(loc.mascot_id) if loc.mascot_id else None,
        "sort_order": loc.sort_order,
        "suggested_questions": [
            {"id": str(q.id), "question": q.question, "sort_order": q.sort_order}
            for q in sorted_qs
        ],
    }


@router.put("/locations/{location_id}")
async def update_location(
    location_id: str,
    session: AsyncSession = Depends(get_db),
    name: str = Form(...),
    description: str = Form(""),
    intro_message: str = Form(""),
    suggested_questions: str = Form("[]"),  # JSON array of strings
):
    """PUT /api/admin/locations/{id} — Update location metadata + questions."""
    loc = await location_repo.get_by_id(session, location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    # Update fields
    loc.name = name
    loc.description = description
    loc.intro_message = intro_message

    # Sync suggested questions: delete old → insert new
    stmt = select(SuggestedQuestion).where(SuggestedQuestion.location_id == loc.id)
    result = await session.execute(stmt)
    old_questions = result.scalars().all()
    for q in old_questions:
        await session.delete(q)

    try:
        questions_list = json.loads(suggested_questions)
    except json.JSONDecodeError:
        questions_list = []

    for idx, q_text in enumerate(questions_list):
        if q_text.strip():
            session.add(SuggestedQuestion(
                location_id=loc.id,
                question=q_text.strip(),
                sort_order=idx,
            ))

    await session.commit()
    return {"success": True, "id": str(loc.id)}


@router.patch("/locations/{location_id}/status")
async def toggle_location_status(
    location_id: str,
    session: AsyncSession = Depends(get_db),
):
    """PATCH /api/admin/locations/{id}/status — Toggle active/inactive."""
    loc = await location_repo.get_by_id(session, location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    new_status = "inactive" if loc.status == "active" else "active"
    loc.status = new_status
    await session.commit()
    return {"id": str(loc.id), "status": new_status}


@router.put("/locations/{location_id}/background")
async def upload_background(
    location_id: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
):
    """PUT /api/admin/locations/{id}/background — Upload 360° background image."""
    loc = await location_repo.get_by_id(session, location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    file_bytes = await file.read()
    filename = file.filename or "panorama.jpg"

    # Upload to R2
    r2_key = storage_service.build_background_key(filename, loc.slug)
    content_type = file.content_type or "image/jpeg"
    await storage_service.upload_file(file_bytes, r2_key, content_type)

    # Update DB
    loc.background_url = storage_service.get_public_url(r2_key)
    await session.commit()

    return {"success": True, "background_url": loc.background_url}


# ─── Documents (RAG) ─────────────────────────────────────────────────────────

@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def ingest_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    location_id: Optional[str] = Form(None),
    session: AsyncSession = Depends(get_db),
):
    """POST /api/admin/ingest — Upload PDF/DOCX → extract → chunk → embed."""
    file_bytes = await file.read()
    filename = file.filename or "document.pdf"

    try:
        ingest_service.validate_file(filename, len(file_bytes))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    loc_uuid: UUID | None = None
    loc_slug: str | None = None
    if location_id:
        location = await location_repo.get_by_id(session, location_id)
        if location:
            loc_uuid = location.id
            loc_slug = location.slug
        else:
            raise HTTPException(status_code=404, detail=f"Location {location_id} not found")

    doc_id = await ingest_service.start_ingestion(
        file_bytes=file_bytes, filename=filename, title=title,
        location_id=loc_uuid, location_slug=loc_slug,
    )

    background_tasks.add_task(
        ingest_service.process_document_background,
        document_id=doc_id, file_bytes=file_bytes,
        filename=filename, location_id=loc_uuid,
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
    """GET /api/admin/documents — List all documents with filtering."""
    loc_uuid = UUID(location_id) if location_id else None
    return await document_repo.list_documents(
        session, location_id=loc_uuid, status=status,
        search=search, page=page, limit=limit,
    )


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(
    document_id: str,
    session: AsyncSession = Depends(get_db),
):
    """GET /api/admin/documents/{id}/status — Check processing status."""
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
    """DELETE /api/admin/documents/{id} — Delete document + chunks + R2 file."""
    file_url = await document_repo.delete_with_chunks(session, UUID(document_id))
    if file_url is None:
        raise HTTPException(status_code=404, detail="Document not found")

    await storage_service.delete_file(file_url)
    return {"success": True, "deleted_file": file_url}


# ─── Media/Assets ─────────────────────────────────────────────────────────────

@router.get("/media")
async def list_media(
    location_id: Optional[str] = None,
    type: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
    session: AsyncSession = Depends(get_db),
):
    """GET /api/admin/media — List all media assets."""
    stmt = select(Media).order_by(Media.created_at.desc())

    if location_id:
        stmt = stmt.where(Media.location_id == UUID(location_id))
    if type and type != "all":
        stmt = stmt.where(Media.type == type)

    # Count
    count_q = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_q)).scalar() or 0

    # Paginate
    offset = (page - 1) * limit
    stmt = stmt.offset(offset).limit(limit)
    result = await session.execute(stmt)
    rows = result.scalars().all()

    return {
        "total": total,
        "media": [
            {
                "id": str(m.id),
                "location_id": str(m.location_id),
                "type": m.type,
                "url": m.url,
                "caption": m.caption,
                "keywords": m.keywords or [],
                "is_intro": m.is_intro,
                "sort_order": m.sort_order,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in rows
        ],
    }


@router.post("/media")
async def upload_media(
    file: UploadFile = File(...),
    caption: str = Form(""),
    keywords: str = Form("[]"),
    is_intro: bool = Form(False),
    location_id: str = Form(...),
    session: AsyncSession = Depends(get_db),
):
    """POST /api/admin/media — Upload media file to R2 + create DB record."""
    # Validate location exists
    loc = await location_repo.get_by_id(session, location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    file_bytes = await file.read()
    filename = file.filename or "media.jpg"
    content_type = file.content_type or "application/octet-stream"

    # Determine type
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ("mp4", "webm", "mov"):
        media_type = "video"
    elif ext == "gif":
        media_type = "gif"
    else:
        media_type = "image"

    # Upload to R2
    r2_key = storage_service.build_media_key(filename, loc.slug)
    await storage_service.upload_file(file_bytes, r2_key, content_type)
    public_url = storage_service.get_public_url(r2_key)

    # Parse keywords
    try:
        kw_list = json.loads(keywords)
    except json.JSONDecodeError:
        kw_list = []

    # Insert DB record
    media = Media(
        location_id=loc.id,
        type=media_type,
        url=public_url,
        caption=caption,
        keywords=kw_list,
        is_intro=is_intro,
    )
    session.add(media)
    await session.commit()
    await session.refresh(media)

    return {
        "id": str(media.id),
        "url": public_url,
        "type": media_type,
    }


@router.delete("/media/{media_id}")
async def delete_media(
    media_id: str,
    session: AsyncSession = Depends(get_db),
):
    """DELETE /api/admin/media/{id} — Delete media from R2 + DB."""
    result = await session.execute(
        select(Media).where(Media.id == UUID(media_id))
    )
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Extract R2 key from URL and delete
    url = media.url
    await storage_service.delete_file(url)

    await session.delete(media)
    await session.commit()
    return {"success": True}


# ─── Mascots ──────────────────────────────────────────────────────────────────

@router.get("/mascots")
async def list_mascots(session: AsyncSession = Depends(get_db)):
    """GET /api/admin/mascots — List all mascots."""
    result = await session.execute(
        select(Mascot).order_by(Mascot.created_at)
    )
    mascots = result.scalars().all()
    return {
        "mascots": [
            {
                "id": str(m.id),
                "name": m.name,
                "slug": m.slug,
                "model_3d_url": m.model_3d_url,
                "voice_name": m.voice_name,
                "voice_style": m.voice_style,
                "personality_prompt": m.personality_prompt,
                "is_default": m.is_default,
                "updated_at": m.updated_at.isoformat() if m.updated_at else None,
            }
            for m in mascots
        ]
    }


@router.put("/mascots/{mascot_id}")
async def update_mascot(
    mascot_id: str,
    session: AsyncSession = Depends(get_db),
    name: str = Form(...),
    voice_name: str = Form("Kore"),
    voice_style: str = Form(""),
    personality_prompt: str = Form(""),
):
    """PUT /api/admin/mascots/{id} — Update mascot metadata."""
    result = await session.execute(
        select(Mascot).where(Mascot.id == UUID(mascot_id))
    )
    mascot = result.scalar_one_or_none()
    if not mascot:
        raise HTTPException(status_code=404, detail="Mascot not found")

    mascot.name = name
    mascot.voice_name = voice_name
    mascot.voice_style = voice_style
    mascot.personality_prompt = personality_prompt
    await session.commit()

    return {"success": True, "id": str(mascot.id)}
