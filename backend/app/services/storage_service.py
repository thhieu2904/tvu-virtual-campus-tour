"""
Storage Service — Cloudflare R2 file management (S3-compatible).
Handles upload/download/delete for documents, media, and backgrounds.

Folder structure on R2:
  documents/{location-slug}/{timestamp}_{filename}
  media/{location-slug}/{filename}
  backgrounds/{location-slug}/{filename}
"""

import asyncio
import logging
from datetime import datetime
from functools import lru_cache

import boto3
from botocore.config import Config as BotoConfig

from app.config import get_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _get_s3_client():
    """Lazy-init singleton S3 client for Cloudflare R2."""
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        config=BotoConfig(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
        ),
        region_name="auto",
    )


def _get_bucket() -> str:
    return get_settings().R2_BUCKET_NAME


async def upload_file(
    file_bytes: bytes,
    key: str,
    content_type: str = "application/octet-stream",
) -> str:
    """
    Upload a file to Cloudflare R2.
    Returns the object key (use get_public_url() to build full URL).

    Key format examples:
    - documents/thu-vien/2026-04-30_quy-che-dao-tao.pdf
    - media/khoa-cntt/anh-toan-canh.jpg
    - backgrounds/sanh-chinh/panorama.jpg
    """
    client = _get_s3_client()

    await asyncio.to_thread(
        client.put_object,
        Bucket=_get_bucket(),
        Key=key,
        Body=file_bytes,
        ContentType=content_type,
    )
    logger.info(f"📤 Uploaded to R2: {key} ({len(file_bytes)} bytes)")
    return key


async def delete_file(key: str) -> bool:
    """Delete a file from Cloudflare R2."""
    client = _get_s3_client()

    try:
        await asyncio.to_thread(
            client.delete_object,
            Bucket=_get_bucket(),
            Key=key,
        )
        logger.info(f"🗑️ Deleted from R2: {key}")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to delete {key}: {e}")
        return False


async def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate a presigned URL for temporary access."""
    client = _get_s3_client()

    url = await asyncio.to_thread(
        client.generate_presigned_url,
        "get_object",
        Params={"Bucket": _get_bucket(), "Key": key},
        ExpiresIn=expires_in,
    )
    return url


def build_document_key(filename: str, location_slug: str | None = None) -> str:
    """Build R2 key for a document file.

    Example: documents/thu-vien/2026-04-30_quy-che.pdf
             documents/general/2026-04-30_gioi-thieu-tvu.pdf
    """
    timestamp = datetime.now().strftime("%Y-%m-%d")
    folder = location_slug or "general"
    safe_name = filename.replace(" ", "-").lower()
    return f"documents/{folder}/{timestamp}_{safe_name}"


def build_media_key(filename: str, location_slug: str) -> str:
    """Build R2 key for a media file."""
    safe_name = filename.replace(" ", "-").lower()
    return f"media/{location_slug}/{safe_name}"


def build_background_key(filename: str, location_slug: str) -> str:
    """Build R2 key for a 360° background image."""
    safe_name = filename.replace(" ", "-").lower()
    return f"backgrounds/{location_slug}/{safe_name}"


def get_public_url(key: str) -> str:
    """Build the public URL for an R2 object.

    Note: Requires R2 bucket to have public access enabled,
    or use a custom domain / Cloudflare Worker for public serving.
    For now, returns the S3-style URL.
    """
    settings = get_settings()
    return f"{settings.R2_ENDPOINT_URL}/{_get_bucket()}/{key}"
