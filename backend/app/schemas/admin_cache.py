"""Schemas for Admin Cache admin endpoints."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

CacheScope = Literal["location", "mascot", "global"]
CacheFocus = Literal["voice", "questions", "prompt", "all", "overview"]
CacheStatus = Literal["valid", "stale", "missing", "running", "failed"]
CacheJobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]


class CacheEstimatedCost(BaseModel):
    tts_requests: int = 0
    rag_requests: int = 0


class CacheLatestJob(BaseModel):
    id: str
    job_type: str
    status: str
    focus: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CacheArtifactStatus(BaseModel):
    artifact_type: str
    item_key: str
    label: str
    status: Literal["valid", "stale", "missing"]
    current_fingerprint: str
    cached_fingerprint: str | None = None
    storage_url: str | None = None
    cache_key: str | None = None
    updated_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class CacheRuntimeState(BaseModel):
    qa_cache_entries: int
    tts_key_cache_loaded: bool
    tts_key_count: int
    tts_key_load_attempts: int
    tts_key_loaded_at: datetime | None = None
    tts_key_last_error: str | None = None


class CacheSummaryResponse(BaseModel):
    scope: CacheScope
    target_id: str | None = None
    focus: CacheFocus
    status: CacheStatus
    current_fingerprint: str | None = None
    cached_fingerprint: str | None = None
    affected_items: int = 0
    total_items: int = 0
    estimated_cost: CacheEstimatedCost = Field(default_factory=CacheEstimatedCost)
    latest_job: CacheLatestJob | None = None
    artifacts: list[CacheArtifactStatus] = Field(default_factory=list)
    runtime_cache: CacheRuntimeState
    target: dict[str, Any] | None = None
    dependent_locations: list[dict[str, Any]] = Field(default_factory=list)


class CacheJobCreateRequest(BaseModel):
    scope: CacheScope
    target_id: str | None = None
    focus: CacheFocus = "overview"
    dry_run: bool = True
    force: bool = False


class CacheJobLogResponse(BaseModel):
    id: str
    job_id: str
    level: Literal["info", "warning", "error"]
    message: str
    item_key: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class CacheJobResponse(BaseModel):
    id: str
    job_type: str
    scope: CacheScope
    target_id: str | None = None
    focus: str | None = None
    status: CacheJobStatus
    requested_by: str | None = None
    params: dict[str, Any] = Field(default_factory=dict)
    detected_changes: dict[str, Any] = Field(default_factory=dict)
    total_items: int = 0
    processed_items: int = 0
    failed_items: int = 0
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CacheJobDetailResponse(BaseModel):
    job: CacheJobResponse
    progress: float = 0
    logs: list[CacheJobLogResponse] = Field(default_factory=list)
    artifacts: list[CacheArtifactStatus] = Field(default_factory=list)
