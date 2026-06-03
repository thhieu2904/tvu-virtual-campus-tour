"""Idempotent migration for Admin Cache Phase 2A.

This script is intentionally reviewable and narrow. It creates the cache job,
log, and artifact tables used by the read-only Cache Console status API. It
does not touch existing entity tables, cache files, R2 objects, or chat data.
"""

import asyncio
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db.database import engine  # noqa: E402


UPGRADE_SQL = [
    "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
    (
        "CREATE TABLE IF NOT EXISTS cache_jobs ("
        "id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
        "job_type TEXT NOT NULL, "
        "scope TEXT NOT NULL, "
        "target_id UUID NULL, "
        "focus TEXT NULL, "
        "status TEXT NOT NULL DEFAULT 'queued', "
        "requested_by TEXT NULL, "
        "params JSONB NOT NULL DEFAULT '{}'::jsonb, "
        "detected_changes JSONB NOT NULL DEFAULT '{}'::jsonb, "
        "total_items INTEGER NOT NULL DEFAULT 0, "
        "processed_items INTEGER NOT NULL DEFAULT 0, "
        "failed_items INTEGER NOT NULL DEFAULT 0, "
        "error_message TEXT NULL, "
        "started_at TIMESTAMPTZ NULL, "
        "finished_at TIMESTAMPTZ NULL, "
        "created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
        "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
        ");"
    ),
    (
        "CREATE TABLE IF NOT EXISTS cache_job_logs ("
        "id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
        "job_id UUID NOT NULL REFERENCES cache_jobs(id) ON DELETE CASCADE, "
        "level TEXT NOT NULL, "
        "message TEXT NOT NULL, "
        "item_key TEXT NULL, "
        "payload JSONB NOT NULL DEFAULT '{}'::jsonb, "
        "created_at TIMESTAMPTZ NOT NULL DEFAULT now()"
        ");"
    ),
    (
        "CREATE TABLE IF NOT EXISTS cache_artifacts ("
        "id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
        "artifact_type TEXT NOT NULL, "
        "scope TEXT NOT NULL, "
        "target_id UUID NOT NULL, "
        "item_key TEXT NOT NULL, "
        "fingerprint TEXT NOT NULL, "
        "storage_url TEXT NULL, "
        "cache_key TEXT NULL, "
        "metadata JSONB NOT NULL DEFAULT '{}'::jsonb, "
        "created_at TIMESTAMPTZ NOT NULL DEFAULT now(), "
        "updated_at TIMESTAMPTZ NOT NULL DEFAULT now()"
        ");"
    ),
    (
        "DO $$ "
        "BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uix_cache_artifacts_type_item') THEN "
        "ALTER TABLE cache_artifacts ADD CONSTRAINT uix_cache_artifacts_type_item UNIQUE (artifact_type, item_key); "
        "END IF; "
        "END $$;"
    ),
    "CREATE INDEX IF NOT EXISTS idx_cache_jobs_status_created_at ON cache_jobs(status, created_at);",
    "CREATE INDEX IF NOT EXISTS idx_cache_jobs_scope_target_created_at ON cache_jobs(scope, target_id, created_at DESC);",
    "CREATE INDEX IF NOT EXISTS idx_cache_job_logs_job_created_at ON cache_job_logs(job_id, created_at);",
    "CREATE INDEX IF NOT EXISTS idx_cache_artifacts_scope_target_type ON cache_artifacts(scope, target_id, artifact_type);",
    "CREATE INDEX IF NOT EXISTS idx_cache_artifacts_updated_at ON cache_artifacts(updated_at DESC);",
]


async def run_migration() -> None:
    print("Applying Admin Cache Phase 2A migration...")
    async with engine.begin() as conn:
        for stmt in UPGRADE_SQL:
            await conn.execute(text(stmt))
    await engine.dispose()
    print("Admin Cache Phase 2A migration complete.")


if __name__ == "__main__":
    asyncio.run(run_migration())
