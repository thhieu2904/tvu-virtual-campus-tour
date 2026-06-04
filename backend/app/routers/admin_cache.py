"""Admin Cache endpoints for summary and in-process cache jobs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.cache import qa_cache_store, tts_key_cache
from app.db.database import get_db
from app.db.tables import CacheArtifact, CacheJob, CacheJobLog, Location, Mascot
from app.dependencies import verify_supabase_token
from app.schemas.admin_cache import (
    CacheArtifactStatus,
    CacheEstimatedCost,
    CacheJobCreateRequest,
    CacheJobDetailResponse,
    CacheJobLogResponse,
    CacheJobResponse,
    CacheLatestJob,
    CacheRuntimeState,
    CacheSummaryResponse,
)
from app.services import cache_fingerprint_service as fingerprints
from app.services import cache_worker

router = APIRouter(dependencies=[Depends(verify_supabase_token)])


def _as_uuid(value: str | None, label: str) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {label}") from exc


def _runtime_state() -> CacheRuntimeState:
    tts_snapshot = tts_key_cache.snapshot()
    return CacheRuntimeState(
        qa_cache_entries=len(qa_cache_store),
        tts_key_cache_loaded=bool(tts_snapshot["loaded"]),
        tts_key_count=int(tts_snapshot["count"]),
        tts_key_load_attempts=int(tts_snapshot["load_attempts"]),
        tts_key_loaded_at=tts_snapshot["loaded_at"],
        tts_key_last_error=tts_snapshot["last_error"],
    )


def _job_to_response(job: CacheJob) -> CacheJobResponse:
    return CacheJobResponse(
        id=str(job.id),
        job_type=job.job_type,
        scope=job.scope,
        target_id=str(job.target_id) if job.target_id else None,
        focus=job.focus,
        status=job.status,
        requested_by=job.requested_by,
        params=job.params or {},
        detected_changes=job.detected_changes or {},
        total_items=job.total_items,
        processed_items=job.processed_items,
        failed_items=job.failed_items,
        error_message=job.error_message,
        started_at=job.started_at,
        finished_at=job.finished_at,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _log_to_response(log: CacheJobLog) -> CacheJobLogResponse:
    return CacheJobLogResponse(
        id=str(log.id),
        job_id=str(log.job_id),
        level=log.level,
        message=log.message,
        item_key=log.item_key,
        payload=log.payload or {},
        created_at=log.created_at,
    )


async def _latest_job(
    session: AsyncSession,
    scope: str,
    target_id: UUID | None,
    focus: str,
) -> CacheLatestJob | None:
    stmt = select(CacheJob).where(CacheJob.scope == scope)
    if target_id is None:
        stmt = stmt.where(CacheJob.target_id.is_(None))
    else:
        stmt = stmt.where(CacheJob.target_id == target_id)
    if focus != "overview":
        stmt = stmt.where(CacheJob.focus == focus)
    stmt = stmt.order_by(CacheJob.created_at.desc()).limit(1)
    job = (await session.execute(stmt)).scalar_one_or_none()
    if not job:
        return None
    return CacheLatestJob(
        id=str(job.id),
        job_type=job.job_type,
        status=job.status,
        focus=job.focus,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


async def _logs_for_job(session: AsyncSession, job_id: UUID, limit: int = 100) -> list[CacheJobLogResponse]:
    result = await session.execute(
        select(CacheJobLog)
        .where(CacheJobLog.job_id == job_id)
        .order_by(CacheJobLog.created_at.desc())
        .limit(limit)
    )
    logs = [_log_to_response(log) for log in result.scalars().all()]
    return list(reversed(logs))


async def _load_artifacts(
    session: AsyncSession,
    items: Iterable[fingerprints.CacheFingerprintItem],
) -> dict[tuple[str, str], CacheArtifact]:
    item_list = list(items)
    if not item_list:
        return {}

    # Use exact (artifact_type, item_key) pair matching to avoid cross-join
    # that would fetch extra rows when types and keys don't correspond 1:1.
    pair_conditions = [
        and_(
            CacheArtifact.artifact_type == item.artifact_type,
            CacheArtifact.item_key == item.item_key,
        )
        for item in item_list
    ]
    result = await session.execute(
        select(CacheArtifact).where(or_(*pair_conditions))
    )
    return {
        (artifact.artifact_type, artifact.item_key): artifact
        for artifact in result.scalars().all()
    }


async def _artifact_statuses(
    session: AsyncSession,
    items: list[fingerprints.CacheFingerprintItem],
) -> list[CacheArtifactStatus]:
    artifact_map = await _load_artifacts(session, items)
    statuses: list[CacheArtifactStatus] = []
    for item in items:
        artifact = artifact_map.get((item.artifact_type, item.item_key))
        if artifact is None:
            status = "missing"
            cached_fingerprint = None
            storage_url = None
            cache_key = item.qa_cache_key
            updated_at = None
            metadata = item.metadata or {}
        else:
            cached_fingerprint = artifact.fingerprint
            status = "valid" if cached_fingerprint == item.fingerprint else "stale"
            storage_url = artifact.storage_url
            cache_key = artifact.cache_key or item.qa_cache_key
            updated_at = artifact.updated_at
            metadata = {**(item.metadata or {}), **(artifact.metadata_ or {})}

        statuses.append(
            CacheArtifactStatus(
                artifact_type=item.artifact_type,
                item_key=item.item_key,
                label=item.label,
                status=status,
                current_fingerprint=item.fingerprint,
                cached_fingerprint=cached_fingerprint,
                storage_url=storage_url,
                cache_key=cache_key,
                updated_at=updated_at,
                metadata=metadata,
            )
        )
    return statuses


def _summary_status(artifacts: list[CacheArtifactStatus], latest_job: CacheLatestJob | None) -> str:
    if latest_job and latest_job.status in {"queued", "running"}:
        return "running"
    if latest_job and latest_job.status == "failed":
        return "failed"
    if not artifacts:
        return "valid"
    invalid = [item for item in artifacts if item.status != "valid"]
    if not invalid:
        return "valid"
    if len(invalid) == len(artifacts) and all(item.status == "missing" for item in invalid):
        return "missing"
    return "stale"


def _estimate_cost(artifacts: list[CacheArtifactStatus], focus: str) -> CacheEstimatedCost:
    invalid = [item for item in artifacts if item.status != "valid"]
    tts_requests = 0
    for item in invalid:
        if item.artifact_type == "location_intro_audio":
            tts_requests += 2
        elif item.artifact_type in {"intro_audio", "qa_audio"}:
            tts_requests += 1
    rag_requests = 0
    if focus in {"questions", "prompt", "all", "overview"}:
        rag_requests = sum(1 for item in invalid if item.artifact_type == "qa_answer")
    return CacheEstimatedCost(tts_requests=tts_requests, rag_requests=rag_requests)


def _cached_fingerprint(artifacts: list[CacheArtifactStatus]) -> str | None:
    values = {item.cached_fingerprint for item in artifacts if item.cached_fingerprint}
    return values.pop() if len(values) == 1 else None


def _summary_fingerprint(items: list[fingerprints.CacheFingerprintItem]) -> str | None:
    if not items:
        return None
    return fingerprints.fingerprint_payload(
        {
            "kind": "cache_summary",
            "items": [
                {
                    "artifact_type": item.artifact_type,
                    "item_key": item.item_key,
                    "fingerprint": item.fingerprint,
                }
                for item in items
            ],
        }
    )


def _target_location(location: Location) -> dict:
    return {
        "id": str(location.id),
        "name": location.name,
        "slug": location.slug,
        "mascot_id": str(location.mascot_id) if location.mascot_id else None,
        "mascot_name": location.mascot.name if location.mascot else None,
        "question_count": len(location.suggested_questions or []),
    }


def _target_mascot(mascot: Mascot) -> dict:
    return {
        "id": str(mascot.id),
        "name": mascot.name,
        "slug": mascot.slug,
        "voice_name": mascot.voice_name,
        "voice_style": mascot.voice_style,
        "is_default": mascot.is_default,
    }


async def _location_summary(
    session: AsyncSession,
    target_id: UUID,
    focus: str,
) -> CacheSummaryResponse:
    result = await session.execute(
        select(Location)
        .where(Location.id == target_id)
        .options(selectinload(Location.suggested_questions), selectinload(Location.mascot))
    )
    location = result.scalar_one_or_none()
    if not location:
        raise HTTPException(status_code=404, detail="Không tìm thấy địa điểm")

    items = []
    intro_item = fingerprints.build_location_intro_item(location)
    if intro_item:
        items.append(intro_item)
    items.extend(fingerprints.build_location_qa_items(location))
    if focus == "voice":
        items = [item for item in items if item.artifact_type in {"location_intro_audio", "qa_audio"}]
    elif focus in {"questions", "prompt"}:
        items = [item for item in items if item.artifact_type in {"qa_answer", "qa_audio"}]
    elif focus in {"all", "overview"}:
        items = [item for item in items if item.artifact_type in {"location_intro_audio", "qa_answer", "qa_audio"}]

    artifacts = await _artifact_statuses(session, items)
    latest_job = await _latest_job(session, "location", target_id, focus)
    return CacheSummaryResponse(
        scope="location",
        target_id=str(target_id),
        focus=focus,
        status=_summary_status(artifacts, latest_job),
        current_fingerprint=_summary_fingerprint(items),
        cached_fingerprint=_cached_fingerprint(artifacts),
        affected_items=sum(1 for item in artifacts if item.status != "valid"),
        total_items=len(artifacts),
        estimated_cost=_estimate_cost(artifacts, focus),
        latest_job=latest_job,
        artifacts=artifacts,
        runtime_cache=_runtime_state(),
        target=_target_location(location),
    )


async def _dependent_locations(session: AsyncSession, mascot: Mascot) -> list[Location]:
    result = await session.execute(
        select(Location)
        .where(Location.mascot_id == mascot.id, Location.status == "active")
        .options(selectinload(Location.suggested_questions), selectinload(Location.mascot))
        .order_by(Location.sort_order, Location.name)
    )
    return list(result.scalars().all())


async def _mascot_summary(
    session: AsyncSession,
    target_id: UUID,
    focus: str,
) -> CacheSummaryResponse:
    mascot = await session.get(Mascot, target_id)
    if not mascot:
        raise HTTPException(status_code=404, detail="Không tìm thấy đại sứ ảo")

    items = [fingerprints.build_mascot_intro_item(mascot)]
    locations = await _dependent_locations(session, mascot)
    for location in locations:
        location_items = []
        location_intro_item = fingerprints.build_location_intro_item(location)
        if location_intro_item:
            location_items.append(location_intro_item)
        location_items.extend(fingerprints.build_location_qa_items(location))
        if focus == "voice":
            items.extend(item for item in location_items if item.artifact_type in {"location_intro_audio", "qa_audio"})
        elif focus in {"questions", "prompt"}:
            items.extend(item for item in location_items if item.artifact_type in {"qa_answer", "qa_audio"})
        elif focus in {"all", "overview"}:
            items.extend(location_items)

    artifacts = await _artifact_statuses(session, items)
    latest_job = await _latest_job(session, "mascot", target_id, focus)
    return CacheSummaryResponse(
        scope="mascot",
        target_id=str(target_id),
        focus=focus,
        status=_summary_status(artifacts, latest_job),
        current_fingerprint=_summary_fingerprint(items),
        cached_fingerprint=_cached_fingerprint(artifacts),
        affected_items=sum(1 for item in artifacts if item.status != "valid"),
        total_items=len(artifacts),
        estimated_cost=_estimate_cost(artifacts, focus),
        latest_job=latest_job,
        artifacts=artifacts,
        runtime_cache=_runtime_state(),
        target=_target_mascot(mascot),
        dependent_locations=[
            {
                "id": str(location.id),
                "name": location.name,
                "slug": location.slug,
                "question_count": len(location.suggested_questions or []),
                "dependency": "assigned",
            }
            for location in locations
        ],
    )


async def _global_summary(session: AsyncSession, focus: str) -> CacheSummaryResponse:
    # 1. Fetch all active locations with preloaded questions and mascots
    loc_res = await session.execute(
        select(Location)
        .where(Location.status == "active")
        .options(selectinload(Location.suggested_questions), selectinload(Location.mascot))
    )
    locations = list(loc_res.scalars().all())

    # 2. Fetch all mascots
    mas_res = await session.execute(select(Mascot))
    mascots = list(mas_res.scalars().all())

    # 3. Build fingerprint items for the entire system
    items = []
    for mascot in mascots:
        items.append(fingerprints.build_mascot_intro_item(mascot))

    for location in locations:
        loc_intro = fingerprints.build_location_intro_item(location)
        if loc_intro:
            items.append(loc_intro)
        items.extend(fingerprints.build_location_qa_items(location))

    # Apply focus filters
    if focus == "voice":
        items = [item for item in items if item.artifact_type in {"intro_audio", "location_intro_audio", "qa_audio"}]
    elif focus in {"questions", "prompt"}:
        items = [item for item in items if item.artifact_type in {"qa_answer", "qa_audio"}]

    # 4. Calculate statuses using the optimized bulk query
    artifacts = await _artifact_statuses(session, items)
    latest_job = await _latest_job(session, "global", None, focus)

    affected_items = sum(1 for item in artifacts if item.status != "valid")
    total_items = len(artifacts)

    return CacheSummaryResponse(
        scope="global",
        target_id=None,
        focus=focus,
        status=_summary_status(artifacts, latest_job),
        current_fingerprint=_summary_fingerprint(items),
        cached_fingerprint=_cached_fingerprint(artifacts),
        affected_items=affected_items,
        total_items=total_items,
        estimated_cost=_estimate_cost(artifacts, focus),
        latest_job=latest_job,
        artifacts=artifacts,
        runtime_cache=_runtime_state(),
        target={"locations_count": len(locations), "mascots_count": len(mascots)},
    )


async def _summary_for_request(
    session: AsyncSession,
    scope: str,
    target_id: UUID | None,
    focus: str,
) -> CacheSummaryResponse:
    if scope == "location":
        if not target_id:
            raise HTTPException(status_code=400, detail="Cần target_id cho phạm vi địa điểm")
        return await _location_summary(session, target_id, focus)
    if scope == "mascot":
        if not target_id:
            raise HTTPException(status_code=400, detail="Cần target_id cho phạm vi đại sứ ảo")
        return await _mascot_summary(session, target_id, focus)
    return await _global_summary(session, focus)


async def _job_detail(
    session: AsyncSession,
    job: CacheJob,
    log_limit: int = 100,
) -> CacheJobDetailResponse:
    logs = await _logs_for_job(session, job.id, log_limit)
    artifacts: list[CacheArtifactStatus] = []
    if job.scope in {"location", "mascot"}:
        try:
            summary = await _summary_for_request(session, job.scope, job.target_id, job.focus or "overview")
            artifacts = summary.artifacts
        except HTTPException:
            artifacts = []
    progress = 0 if job.total_items <= 0 else min(1, job.processed_items / job.total_items)
    return CacheJobDetailResponse(
        job=_job_to_response(job),
        progress=progress,
        logs=logs,
        artifacts=artifacts,
    )


async def _has_running_job(
    session: AsyncSession,
    scope: str,
    target_id: UUID | None,
) -> CacheJob | None:
    stmt = select(CacheJob).where(
        CacheJob.scope == scope,
        CacheJob.status.in_(["queued", "running"]),
    )
    if target_id is None:
        stmt = stmt.where(CacheJob.target_id.is_(None))
    else:
        stmt = stmt.where(CacheJob.target_id == target_id)
    stmt = stmt.order_by(CacheJob.created_at.desc()).limit(1)
    return (await session.execute(stmt)).scalar_one_or_none()


def _detected_changes(summary: CacheSummaryResponse, force: bool) -> dict:
    artifacts = [
        artifact.model_dump(mode="json")
        for artifact in summary.artifacts
        if force or artifact.status != "valid"
    ]
    return {
        "summary_status": summary.status,
        "affected_items": len(artifacts),
        "total_items": summary.total_items,
        "estimated_cost": summary.estimated_cost.model_dump(),
        "artifacts": artifacts,
    }


@router.post("/jobs", response_model=CacheJobDetailResponse)
async def create_cache_job(
    payload: CacheJobCreateRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
    user: dict = Depends(verify_supabase_token),
):
    target_id = _as_uuid(payload.target_id, "target_id")
    requested_by = user.get("email") or user.get("id") or None

    summary = await _summary_for_request(session, payload.scope, target_id, payload.focus)
    detected_changes = _detected_changes(summary, payload.force)
    total_items = int(detected_changes["affected_items"])

    if not payload.dry_run:
        running_job = await _has_running_job(session, payload.scope, target_id)
        if running_job:
            raise HTTPException(status_code=409, detail=f"Cache job already running: {running_job.id}")

    job = CacheJob(
        job_type=cache_worker.job_type_for(payload.scope, payload.focus),
        scope=payload.scope,
        target_id=target_id,
        focus=payload.focus,
        status="succeeded" if payload.dry_run or total_items == 0 else "queued",
        requested_by=requested_by,
        params={"dry_run": payload.dry_run, "force": payload.force},
        detected_changes=detected_changes,
        total_items=total_items,
        processed_items=total_items if payload.dry_run or total_items == 0 else 0,
        failed_items=0,
    )
    session.add(job)
    await session.flush()

    if payload.dry_run:
        await cache_worker.add_job_log(
            session,
            job.id,
            "info",
            f"Kiểm tra trước hoàn tất: {total_items} artifact bị ảnh hưởng.",
        )
    elif total_items == 0:
        await cache_worker.add_job_log(
            session,
            job.id,
            "info",
            "Không có artifact cần cập nhật hoặc chưa có; job kết thúc mà không rebuild.",
        )
    else:
        await cache_worker.add_job_log(
            session,
            job.id,
            "info",
            f"Đã đưa vào hàng chờ rebuild cache với {total_items} artifact bị ảnh hưởng.",
        )

    await session.commit()
    await session.refresh(job)

    if not payload.dry_run and total_items > 0:
        background_tasks.add_task(cache_worker.run_cache_job, str(job.id))

    return await _job_detail(session, job)


@router.get("/jobs/{job_id}", response_model=CacheJobDetailResponse)
async def get_cache_job(
    job_id: str,
    session: AsyncSession = Depends(get_db),
):
    job = await session.get(CacheJob, _as_uuid(job_id, "job_id"))
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy cache job")
    return await _job_detail(session, job)


@router.get("/jobs/{job_id}/logs", response_model=list[CacheJobLogResponse])
async def get_cache_job_logs(
    job_id: str,
    limit: int = 100,
    session: AsyncSession = Depends(get_db),
):
    parsed_job_id = _as_uuid(job_id, "job_id")
    if not await session.get(CacheJob, parsed_job_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy cache job")
    return await _logs_for_job(session, parsed_job_id, max(1, min(limit, 500)))


@router.post("/jobs/{job_id}/cancel", response_model=CacheJobDetailResponse)
async def cancel_cache_job(
    job_id: str,
    session: AsyncSession = Depends(get_db),
):
    parsed_job_id = _as_uuid(job_id, "job_id")
    job = await session.get(CacheJob, parsed_job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Không tìm thấy cache job")
    if job.status not in {"queued", "running"}:
        raise HTTPException(status_code=400, detail=f"Không thể hủy job ở trạng thái {job.status}")
    job.status = "cancelled"
    job.updated_at = datetime.now(timezone.utc)
    # Signal the worker in-memory for faster cooperative cancellation
    cache_worker.mark_job_cancelled(str(parsed_job_id))
    await cache_worker.add_job_log(session, job.id, "warning", "Admin đã yêu cầu hủy job.")
    await session.commit()
    await session.refresh(job)
    return await _job_detail(session, job)


@router.get("/summary", response_model=CacheSummaryResponse)
async def get_cache_summary(
    scope: str = Query("global", pattern="^(location|mascot|global)$"),
    target_id: str | None = None,
    focus: str = Query("overview", pattern="^(voice|questions|prompt|all|overview)$"),
    session: AsyncSession = Depends(get_db),
):
    parsed_target_id = _as_uuid(target_id, "target_id")
    return await _summary_for_request(session, scope, parsed_target_id, focus)
