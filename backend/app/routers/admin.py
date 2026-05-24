"""Protected Admin API endpoints for content management."""

import json
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.tts_engine import CONTENT_TYPE_MP3, synthesize
from app.db.database import get_db
from app.db.tables import KioskConfig, Location, Mascot, Media
from app.dependencies import verify_supabase_token
from app.repositories import admin_location_repo, document_repo, location_repo, stats_repo
from app.schemas.admin import (
    KioskConfigResponse,
    LocationLinksUpdateRequest,
    LocationQuestionsUpdateRequest,
    LocationUpdateRequest,
    MascotUpdateRequest,
    MediaUpdateRequest,
)
from app.schemas.document import DocumentStatusResponse, IngestResponse
from app.services import ingest_service, storage_service

router = APIRouter(dependencies=[Depends(verify_supabase_token)])

DEFAULT_KIOSK_CONFIG = KioskConfigResponse().model_dump()


async def _read_payload(request: Request) -> dict[str, Any]:
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        return await request.json()
    if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
        form = await request.form()
        return dict(form)
    return {}


def _json_list(value: Any, fallback: list | None = None) -> list:
    if value is None:
        return fallback or []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else (fallback or [])
        except json.JSONDecodeError:
            return fallback or []
    return fallback or []


def _json_object(value: Any) -> dict | None:
    if value is None or isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            return None
    return None


def _as_uuid(value: str, label: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {label}") from exc


def _serialize_media(media: Media, location_name: str | None = None) -> dict:
    return {
        "id": str(media.id),
        "location_id": str(media.location_id),
        "location_name": location_name,
        "type": media.type,
        "url": media.url,
        "caption": media.caption,
        "keywords": media.keywords or [],
        "is_intro": media.is_intro,
        "sort_order": media.sort_order,
        "created_at": media.created_at.isoformat() if media.created_at else None,
    }


def _infer_media_type(filename: str, content_type: str | None, explicit_type: str | None = None) -> str:
    if explicit_type in {"image", "video", "gif"}:
        return explicit_type
    ext = Path(filename).suffix.lower()
    if ext in {".mp4", ".webm", ".mov"} or (content_type or "").startswith("video/"):
        return "video"
    if ext == ".gif":
        return "gif"
    return "image"


async def _get_location_or_404(session: AsyncSession, location_id: str) -> Location:
    loc = await location_repo.get_by_id(session, location_id)
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    return loc


# Dashboard and config


@router.get("/stats")
async def get_dashboard_stats(session: AsyncSession = Depends(get_db)):
    return await stats_repo.get_dashboard_stats(session)


@router.get("/config", response_model=KioskConfigResponse)
async def get_kiosk_config(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(KioskConfig))
    config = DEFAULT_KIOSK_CONFIG.copy()
    for item in result.scalars().all():
        config[item.key] = item.value
    return KioskConfigResponse(**config)


@router.put("/config", response_model=KioskConfigResponse)
async def update_kiosk_config(
    payload: KioskConfigResponse,
    session: AsyncSession = Depends(get_db),
):
    for key, value in payload.model_dump().items():
        existing = await session.get(KioskConfig, key)
        if existing:
            existing.value = value
        else:
            session.add(KioskConfig(key=key, value=value))
    await session.commit()
    return payload


# Locations


@router.get("/locations")
@router.get("/locations/summary")
async def get_locations(session: AsyncSession = Depends(get_db)):
    return {"locations": await admin_location_repo.list_location_summaries(session)}


@router.get("/locations/{location_id}")
async def get_location_detail(location_id: str, session: AsyncSession = Depends(get_db)):
    data = await admin_location_repo.get_location_detail(session, _as_uuid(location_id, "location_id"))
    if not data:
        raise HTTPException(status_code=404, detail="Location not found")
    return data


@router.put("/locations/{location_id}")
async def update_location(
    location_id: str,
    request: Request,
    session: AsyncSession = Depends(get_db),
):
    loc = await _get_location_or_404(session, location_id)
    raw_payload = await _read_payload(request)
    if "camera_config" in raw_payload:
        raw_payload["camera_config"] = _json_object(raw_payload.get("camera_config"))

    questions_payload = raw_payload.pop("suggested_questions", None)
    payload = LocationUpdateRequest(**raw_payload)
    await admin_location_repo.update_location(session, loc, payload)

    if questions_payload is not None:
        await admin_location_repo.replace_questions(
            session,
            loc,
            LocationQuestionsUpdateRequest(questions=_json_list(questions_payload)),
        )

    await session.commit()
    await session.refresh(loc)
    return {"success": True, "location": admin_location_repo.serialize_location(loc)}


@router.patch("/locations/{location_id}/status")
async def toggle_location_status(location_id: str, session: AsyncSession = Depends(get_db)):
    loc = await _get_location_or_404(session, location_id)
    loc.status = "inactive" if loc.status == "active" else "active"
    await session.commit()
    return {"id": str(loc.id), "status": loc.status}


@router.put("/locations/{location_id}/background")
async def upload_background(
    location_id: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
):
    loc = await _get_location_or_404(session, location_id)
    file_bytes = await file.read()
    filename = file.filename or "panorama.jpg"
    content_type = file.content_type or "image/jpeg"

    r2_key = storage_service.build_background_key(filename, loc.slug)
    await storage_service.upload_file(file_bytes, r2_key, content_type)
    loc.background_url = storage_service.get_public_url(r2_key)
    await session.commit()
    return {"success": True, "background_url": loc.background_url}


@router.post("/locations/{location_id}/regenerate-audio")
async def regenerate_location_audio(location_id: str, session: AsyncSession = Depends(get_db)):
    loc = await _get_location_or_404(session, location_id)
    if not loc.intro_message.strip():
        raise HTTPException(status_code=400, detail="intro_message is empty")

    voice_name = loc.mascot.voice_name if loc.mascot else None
    voice_style = loc.mascot.voice_style if loc.mascot else None
    result = await synthesize(loc.intro_message, voice_name=voice_name, voice_style=voice_style)

    extension = "mp3" if result.content_type == CONTENT_TYPE_MP3 else "wav"
    r2_key = storage_service.build_intro_key(loc.slug, extension)
    await storage_service.upload_file(result.audio_data, r2_key, result.content_type)
    loc.intro_audio_url = storage_service.get_public_url(r2_key)
    await session.commit()
    return {
        "success": True,
        "intro_audio_url": loc.intro_audio_url,
        "provider": result.provider,
        "cached": result.cached,
    }


@router.put("/locations/{location_id}/questions")
async def update_location_questions(
    location_id: str,
    payload: LocationQuestionsUpdateRequest,
    session: AsyncSession = Depends(get_db),
):
    loc = await _get_location_or_404(session, location_id)
    questions = await admin_location_repo.replace_questions(session, loc, payload)
    await session.commit()
    return {
        "success": True,
        "questions": [
            {"id": str(q.id), "question": q.question, "sort_order": q.sort_order}
            for q in questions
        ],
    }


@router.put("/locations/{location_id}/links")
async def update_location_links(
    location_id: str,
    payload: LocationLinksUpdateRequest,
    session: AsyncSession = Depends(get_db),
):
    loc = await _get_location_or_404(session, location_id)
    try:
        links = await admin_location_repo.replace_links(session, loc, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.commit()
    return {
        "success": True,
        "links": [
            {"id": str(link.id), "to_location_id": str(link.to_location_id), "label": link.label}
            for link in links
        ],
    }


# Documents


@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def ingest_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    session: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()
    filename = file.filename or "document.pdf"

    try:
        ingest_service.validate_file(filename, len(file_bytes))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    doc_id = await ingest_service.start_ingestion(
        file_bytes=file_bytes,
        filename=filename,
        title=title,
    )

    background_tasks.add_task(
        ingest_service.process_document_background,
        document_id=doc_id,
        file_bytes=file_bytes,
        filename=filename,
    )
    return IngestResponse(document_id=str(doc_id), status="pending")


@router.get("/documents")
async def list_documents(
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 10,
    session: AsyncSession = Depends(get_db),
):
    return await document_repo.list_documents(
        session,
        status=status,
        search=search,
        page=max(page, 1),
        limit=max(min(limit, 100), 1),
    )


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
async def get_document_status(document_id: str, session: AsyncSession = Depends(get_db)):
    doc = await document_repo.get_by_id(session, _as_uuid(document_id, "document_id"))
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return DocumentStatusResponse(
        status=doc.status,
        chunk_count=doc.chunk_count,
        error_message=doc.error_message,
    )


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, session: AsyncSession = Depends(get_db)):
    file_url = await document_repo.delete_with_chunks(session, _as_uuid(document_id, "document_id"))
    if file_url is None:
        raise HTTPException(status_code=404, detail="Document not found")

    await storage_service.delete_file(file_url)
    await session.commit()
    return {"success": True, "deleted_file": file_url}


# Media


@router.get("/media")
async def list_media(
    location_id: str | None = None,
    type: str | None = None,
    page: int = 1,
    limit: int = 50,
    session: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Media, Location.name.label("location_name"))
        .join(Location, Media.location_id == Location.id)
        .order_by(Media.created_at.desc())
    )
    if location_id:
        stmt = stmt.where(Media.location_id == _as_uuid(location_id, "location_id"))
    if type and type != "all":
        stmt = stmt.where(Media.type == type)

    count_q = select(func.count()).select_from(stmt.subquery())
    total = (await session.execute(count_q)).scalar() or 0
    offset = (max(page, 1) - 1) * max(min(limit, 100), 1)
    result = await session.execute(stmt.offset(offset).limit(max(min(limit, 100), 1)))
    return {
        "total": total,
        "media": [_serialize_media(media, location_name) for media, location_name in result.all()],
    }


@router.post("/media")
async def upload_media(
    file: UploadFile = File(...),
    caption: str = Form(""),
    keywords: str = Form("[]"),
    is_intro: bool = Form(False),
    location_id: str = Form(...),
    sort_order: int = Form(0),
    type: str | None = Form(None),
    session: AsyncSession = Depends(get_db),
):
    loc = await _get_location_or_404(session, location_id)
    file_bytes = await file.read()
    filename = file.filename or "media"
    content_type = file.content_type or "application/octet-stream"
    media_type = _infer_media_type(filename, content_type, type)

    r2_key = storage_service.build_media_key(filename, loc.slug)
    await storage_service.upload_file(file_bytes, r2_key, content_type)
    public_url = storage_service.get_public_url(r2_key)

    media = Media(
        location_id=loc.id,
        type=media_type,
        url=public_url,
        caption=caption,
        keywords=_json_list(keywords),
        is_intro=is_intro,
        sort_order=sort_order,
    )
    session.add(media)
    await session.commit()
    await session.refresh(media)
    return _serialize_media(media, loc.name)


@router.put("/media/{media_id}")
async def update_media(
    media_id: str,
    payload: MediaUpdateRequest,
    session: AsyncSession = Depends(get_db),
):
    media = await session.get(Media, _as_uuid(media_id, "media_id"))
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(media, field, value)
    await session.commit()
    await session.refresh(media)
    return _serialize_media(media)


@router.delete("/media/{media_id}")
async def delete_media(media_id: str, session: AsyncSession = Depends(get_db)):
    media = await session.get(Media, _as_uuid(media_id, "media_id"))
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    deleted_url = media.url
    await storage_service.delete_file(deleted_url)
    await session.delete(media)
    await session.commit()
    return {"success": True, "deleted_file": deleted_url}


# Mascots


@router.get("/mascots")
async def list_mascots(session: AsyncSession = Depends(get_db)):
    location_count_sq = (
        select(Location.mascot_id, func.count(Location.id).label("location_count"))
        .where(Location.mascot_id.is_not(None))
        .group_by(Location.mascot_id)
        .subquery()
    )
    result = await session.execute(
        select(Mascot, func.coalesce(location_count_sq.c.location_count, 0).label("location_count"))
        .outerjoin(location_count_sq, Mascot.id == location_count_sq.c.mascot_id)
        .order_by(Mascot.created_at)
    )
    return {
        "mascots": [
            {
                "id": str(mascot.id),
                "name": mascot.name,
                "slug": mascot.slug,
                "model_3d_url": mascot.model_3d_url,
                "voice_name": mascot.voice_name,
                "voice_style": mascot.voice_style,
                "personality_prompt": mascot.personality_prompt,
                "is_default": mascot.is_default,
                "location_count": location_count,
                "updated_at": mascot.updated_at.isoformat() if mascot.updated_at else None,
            }
            for mascot, location_count in result.all()
        ]
    }


@router.put("/mascots/{mascot_id}")
async def update_mascot(
    mascot_id: str,
    request: Request,
    session: AsyncSession = Depends(get_db),
):
    mascot = await session.get(Mascot, _as_uuid(mascot_id, "mascot_id"))
    if not mascot:
        raise HTTPException(status_code=404, detail="Mascot not found")

    payload = MascotUpdateRequest(**await _read_payload(request))
    fields = payload.model_dump(exclude_unset=True)
    if fields.get("is_default") is True:
        result = await session.execute(select(Mascot).where(Mascot.id != mascot.id, Mascot.is_default.is_(True)))
        for other in result.scalars().all():
            other.is_default = False

    for field, value in fields.items():
        setattr(mascot, field, value)
    await session.commit()
    return {"success": True, "id": str(mascot.id)}
