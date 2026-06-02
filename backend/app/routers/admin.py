"""Protected Admin API endpoints for content management."""

import base64
import itertools
import json
import shutil
import time
from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import tts_engine
from app.ai.tts_engine import CONTENT_TYPE_MP3, CONTENT_TYPE_WAV, synthesize
from app.cache import tts_key_cache
from app.db.database import get_db
from app.db.tables import KioskConfig, Location, Mascot, Media
from app.dependencies import verify_supabase_token
from app.repositories import admin_location_repo, category_repo, document_repo, location_repo, stats_repo
from app.schemas.admin import (
    DocumentCategoryAssignRequest,
    DocumentCategoryCreateRequest,
    DocumentCategoryUpdateRequest,
    KioskConfigResponse,
    LocationLinksUpdateRequest,
    LocationQuestionsUpdateRequest,
    LocationUpdateRequest,
    MascotUpdateRequest,
    MascotVoicePreviewRequest,
    MediaUpdateRequest,
)
from app.schemas.document import DocumentStatusResponse, IngestResponse
from app.services import ingest_service, pathfinding_service, storage_service

router = APIRouter(dependencies=[Depends(verify_supabase_token)])

DEFAULT_KIOSK_CONFIG = KioskConfigResponse().model_dump()
BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
PATHS_PATH = BACKEND_ROOT / "data" / "paths.json"
PATHS_BACKUP_PATH = BACKEND_ROOT / "data" / "paths_backup.json"


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


def _as_optional_uuid(value: str | None, label: str) -> UUID | None:
    if not value:
        return None
    return _as_uuid(value, label)


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
async def get_dashboard_stats(
    period: str = "week",
    cursor: str | None = None,
    session: AsyncSession = Depends(get_db),
):
    return await stats_repo.get_dashboard_stats(session, period=period, cursor=cursor)


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
    next_status = "inactive" if loc.status == "active" else "active"
    if next_status == "active" and not loc.background_url.strip():
        raise HTTPException(
            status_code=400,
            detail="Cần upload ảnh 360° trước khi bật địa điểm.",
        )
    loc.status = next_status
    await session.commit()
    return {"id": str(loc.id), "status": loc.status}


@router.post("/nav/regenerate-paths")
async def regenerate_navigation_paths(session: AsyncSession = Depends(get_db)):
    """
    Regenerate static path coordinates for all active ordered location pairs.
    The runtime A* API still computes fresh paths on demand; this file is a
    fallback/preview asset for the map renderer.
    """
    started = time.perf_counter()
    pathfinding_service.reset_cache()
    result = await session.execute(
        select(Location.slug)
        .where(Location.status == "active")
        .order_by(Location.sort_order, Location.name)
    )
    active_slugs = [row[0] for row in result.all()]

    paths_output: dict[str, list[dict[str, Any]]] = {}
    failed_pairs: list[dict[str, str]] = []

    for from_slug, to_slug in itertools.permutations(active_slugs, 2):
        path_result = pathfinding_service.find_path(from_slug, to_slug)
        key = f"{from_slug}_to_{to_slug}"
        if path_result.found:
            paths_output[key] = path_result.coordinates
        else:
            failed_pairs.append({"from": from_slug, "to": to_slug})

    if PATHS_PATH.exists():
        shutil.copy2(PATHS_PATH, PATHS_BACKUP_PATH)

    temp_path = PATHS_PATH.with_suffix(".tmp")
    with open(temp_path, "w", encoding="utf-8") as file:
        json.dump(paths_output, file, ensure_ascii=False, indent=2)
        file.write("\n")
    temp_path.replace(PATHS_PATH)

    pathfinding_service.reset_cache()
    total_ms = round((time.perf_counter() - started) * 1000, 3)

    return {
        "success": True,
        "active_count": len(active_slugs),
        "paths_computed": len(paths_output),
        "paths_failed": len(failed_pairs),
        "failed_pairs": failed_pairs,
        "total_ms": total_ms,
        "paths_file": str(PATHS_PATH),
        "backup_file": str(PATHS_BACKUP_PATH) if PATHS_BACKUP_PATH.exists() else None,
    }


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
    personality_prompt = loc.mascot.personality_prompt if loc.mascot else None
    result = await synthesize(
        loc.intro_message,
        voice_name=voice_name,
        voice_style=voice_style,
        personality_prompt=personality_prompt,
    )

    extension = "mp3" if result.content_type == CONTENT_TYPE_MP3 else "wav"
    r2_key = storage_service.build_intro_key(loc.slug, extension)
    await storage_service.upload_file(
        result.audio_data,
        r2_key,
        result.content_type,
        cache_control="no-cache, no-store, must-revalidate",
    )
    loc.intro_audio_url = f"{storage_service.get_public_url(r2_key)}?v={int(time.time())}"
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


# Document Categories


@router.get("/categories")
async def list_categories(session: AsyncSession = Depends(get_db)):
    return {"categories": await category_repo.list_categories(session)}


@router.post("/categories")
async def create_category(
    payload: DocumentCategoryCreateRequest,
    session: AsyncSession = Depends(get_db),
):
    try:
        category = await category_repo.create_category(session, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.commit()
    await session.refresh(category)
    return category_repo.serialize_category(category, 0)


@router.put("/categories/{category_id}")
async def update_category(
    category_id: str,
    payload: DocumentCategoryUpdateRequest,
    session: AsyncSession = Depends(get_db),
):
    category = await category_repo.get_by_id(session, _as_uuid(category_id, "category_id"))
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    try:
        category = await category_repo.update_category(session, category, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await session.commit()
    await session.refresh(category)
    return category_repo.serialize_category(category)


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, session: AsyncSession = Depends(get_db)):
    category = await category_repo.get_by_id(session, _as_uuid(category_id, "category_id"))
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    await category_repo.delete_category(session, category)
    await session.commit()
    return {"success": True, "deleted_category": category_id}


# Documents


@router.post("/ingest", response_model=IngestResponse, status_code=202)
async def ingest_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    category_id: str | None = Form(None),
    session: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()
    filename = file.filename or "document.pdf"

    try:
        ingest_service.validate_file(filename, len(file_bytes))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    try:
        doc_id = await ingest_service.start_ingestion(
            file_bytes=file_bytes,
            filename=filename,
            title=title,
            category_id=_as_optional_uuid(category_id, "category_id"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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
    category_id: str | None = None,
    uncategorized: bool = False,
    page: int = 1,
    limit: int = 10,
    session: AsyncSession = Depends(get_db),
):
    parsed_category_id = _as_optional_uuid(category_id, "category_id")
    return await document_repo.list_documents(
        session,
        status=status,
        search=search,
        category_id=parsed_category_id,
        uncategorized=uncategorized,
        page=max(page, 1),
        limit=max(min(limit, 100), 1),
    )


@router.patch("/documents/{document_id}/category")
async def update_document_category(
    document_id: str,
    payload: DocumentCategoryAssignRequest,
    session: AsyncSession = Depends(get_db),
):
    parsed_category_id = _as_optional_uuid(payload.category_id, "category_id")
    if parsed_category_id and not await category_repo.get_by_id(session, parsed_category_id):
        raise HTTPException(status_code=404, detail="Category not found")

    doc = await document_repo.update_category(
        session,
        _as_uuid(document_id, "document_id"),
        parsed_category_id,
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    await session.commit()
    return {
        "success": True,
        "id": str(doc.id),
        "category_id": str(doc.category_id) if doc.category_id else None,
    }


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

    # Fetch location names per mascot for the admin UI
    loc_result = await session.execute(
        select(Location.mascot_id, Location.name)
        .where(Location.mascot_id.is_not(None))
        .order_by(Location.name)
    )
    location_names_map: dict[str, list[str]] = {}
    for mascot_id, loc_name in loc_result.all():
        location_names_map.setdefault(str(mascot_id), []).append(loc_name)

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
                "location_names": location_names_map.get(str(mascot.id), []),
                "updated_at": mascot.updated_at.isoformat() if mascot.updated_at else None,
            }
            for mascot, location_count in result.all()
        ]
    }


@router.post("/mascots/voice-preview")
async def preview_mascot_voice(payload: MascotVoicePreviewRequest):
    name = payload.name.strip() or "Đại sứ ảo"
    preview_text = (
        f"Xin chào, mình là {name}. "
        "Mình sẽ đồng hành cùng bạn trong chuyến tham quan Đại học Trà Vinh hôm nay."
    )
    voice = payload.voice_name or "Leda"
    style = payload.voice_style or ""
    persona = payload.personality_prompt or ""
    cache_key = tts_engine._cache_key(preview_text, voice, style, persona)
    r2_candidates = [
        (f"tts-cache/{cache_key}.wav", CONTENT_TYPE_WAV),
        (f"tts-cache/{cache_key}.mp3", CONTENT_TYPE_MP3),
    ]

    try:
        for r2_key, content_type in r2_candidates:
            if tts_key_cache.loaded:
                exists = tts_key_cache.contains(r2_key)
            else:
                exists = await storage_service.file_exists(r2_key)
                if exists:
                    tts_key_cache.add(r2_key)
            if exists:
                return {
                    "audio_url": storage_service.get_public_url(r2_key),
                    "provider": "r2-cache",
                    "cached": True,
                    "content_type": content_type,
                    "storage_key": r2_key,
                }
    except Exception:
        # R2 HEAD can fail in local/dev environments. Preview should still work via synthesize fallback.
        pass

    try:
        result = await synthesize(
            preview_text,
            voice_name=voice,
            voice_style=style,
            personality_prompt=persona,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Không thể tạo giọng đọc mẫu") from exc

    extension = "mp3" if result.content_type == CONTENT_TYPE_MP3 else "wav"
    r2_key = f"tts-cache/{cache_key}.{extension}"
    try:
        await storage_service.upload_file(
            file_bytes=result.audio_data,
            key=r2_key,
            content_type=result.content_type,
            cache_control="public, max-age=31536000, immutable",
        )
        tts_key_cache.add(r2_key)
        return {
            "audio_url": storage_service.get_public_url(r2_key),
            "provider": result.provider,
            "cached": result.cached,
            "content_type": result.content_type,
            "storage_key": r2_key,
        }
    except Exception:
        data = base64.b64encode(result.audio_data).decode("ascii")
        return {
            "audio_url": f"data:{result.content_type};base64,{data}",
            "provider": result.provider,
            "cached": result.cached,
            "content_type": result.content_type,
            "storage_key": None,
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

    try:
        payload = MascotUpdateRequest(**await _read_payload(request))
    except ValidationError as exc:
        detail = "; ".join(error["msg"] for error in exc.errors())
        raise HTTPException(status_code=400, detail=detail) from exc
    fields = payload.model_dump(exclude_unset=True)
    if fields.get("is_default") is True:
        result = await session.execute(select(Mascot).where(Mascot.id != mascot.id, Mascot.is_default.is_(True)))
        for other in result.scalars().all():
            other.is_default = False

    for field, value in fields.items():
        setattr(mascot, field, value)
    await session.commit()
    return {"success": True, "id": str(mascot.id)}
