"""Upload local Cong Chinh images to R2 and insert missing DB media rows.

This script is intentionally narrow: it only syncs image media for the
`cong-chinh` location from the expected R2 media folder plus image files in the
repository root.
"""

from __future__ import annotations

import argparse
import asyncio
import mimetypes
import re
import sys
import unicodedata
from pathlib import Path

from sqlalchemy import func, select

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.db.database import async_session  # noqa: E402
from app.db.tables import Location, Media  # noqa: E402
from app.services import storage_service  # noqa: E402

LOCATION_SLUG = "cong-chinh"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
R2_MEDIA_PREFIX = f"locations/{LOCATION_SLUG}/media/"


def _slugify_filename(filename: str) -> str:
    stem = Path(filename).stem
    suffix = Path(filename).suffix.lower()
    normalized = unicodedata.normalize("NFKD", stem)
    ascii_stem = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    ascii_stem = ascii_stem.replace("đ", "d").replace("Đ", "D").lower()
    ascii_stem = re.sub(r"[^a-z0-9]+", "-", ascii_stem).strip("-")
    return f"{ascii_stem or 'image'}{suffix}"


def _caption_from_key(key: str) -> str:
    stem = Path(key).stem.replace("-", " ").replace("_", " ").strip()
    return stem[:1].upper() + stem[1:] if stem else "Cổng chính"


def _is_image_key(key: str) -> bool:
    return Path(key).suffix.lower() in IMAGE_EXTENSIONS


def _list_r2_keys_for_prefix(prefix: str) -> list[str]:
    client = storage_service._get_s3_client()
    bucket = storage_service._get_bucket()
    keys: list[str] = []
    continuation_token = None

    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix}
        if continuation_token:
            kwargs["ContinuationToken"] = continuation_token

        response = client.list_objects_v2(**kwargs)
        for obj in response.get("Contents", []):
            key = obj["Key"]
            keys.append(key)

        if not response.get("IsTruncated"):
            break
        continuation_token = response["NextContinuationToken"]

    return sorted(set(keys))


def _list_r2_image_keys() -> list[str]:
    bucket = storage_service._get_bucket()
    prefixes = [
        f"locations/{LOCATION_SLUG}/",
        f"{bucket}/locations/{LOCATION_SLUG}/",
    ]
    keys: list[str] = []
    for prefix in prefixes:
        prefix_keys = _list_r2_keys_for_prefix(prefix)
        print(f"r2 objects under {prefix}: {len(prefix_keys)}")
        for key in prefix_keys:
            if key.startswith(R2_MEDIA_PREFIX) or key.startswith(f"{bucket}/{R2_MEDIA_PREFIX}"):
                if _is_image_key(key):
                    keys.append(key)
                else:
                    print(f"skip non-image media object: {key}")
            else:
                print(f"skip non-media object: {key}")
    return sorted(set(keys))


def _canonical_media_key(key: str) -> str:
    bucket_prefix = f"{storage_service._get_bucket()}/"
    if key.startswith(bucket_prefix):
        return key[len(bucket_prefix):]
    return key


def _local_root_images() -> list[Path]:
    return sorted(
        path
        for path in REPO_DIR.iterdir()
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )


async def _upload_local_images(paths: list[Path], execute: bool) -> list[str]:
    uploaded_keys: list[str] = []
    for path in paths:
        key = f"{R2_MEDIA_PREFIX}{_slugify_filename(path.name)}"
        content_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        exists = await storage_service.file_exists(key)
        if execute and not exists:
            await storage_service.upload_file(path.read_bytes(), key, content_type)
        uploaded_keys.append(key)
        state = "exists" if exists else ("uploaded" if execute else "would-upload")
        print(f"{state}: {path.name} -> {key}")
    return uploaded_keys


async def _sync_media_rows(keys: list[str], execute: bool) -> None:
    async with async_session() as session:
        location = (
            await session.execute(select(Location).where(Location.slug == LOCATION_SLUG))
        ).scalar_one_or_none()
        if not location:
            raise RuntimeError(f"Location not found: {LOCATION_SLUG}")

        existing_urls = set(
            (
                await session.execute(
                    select(Media.url).where(Media.location_id == location.id)
                )
            )
            .scalars()
            .all()
        )
        max_sort_order = (
            await session.execute(
                select(func.coalesce(func.max(Media.sort_order), 0)).where(
                    Media.location_id == location.id
                )
            )
        ).scalar_one()

        missing_keys: list[str] = []
        for key in sorted(set(keys)):
            url = storage_service.get_public_url(_canonical_media_key(key))
            if url not in existing_urls:
                missing_keys.append(key)

        print(f"location: {location.name} ({location.id})")
        print(f"existing media rows: {len(existing_urls)}")
        print(f"missing image rows: {len(missing_keys)}")

        for index, key in enumerate(missing_keys, start=1):
            media = Media(
                location_id=location.id,
                type="gif" if Path(key).suffix.lower() == ".gif" else "image",
                url=storage_service.get_public_url(_canonical_media_key(key)),
                caption=_caption_from_key(key),
                keywords=["cổng chính", "cong chinh"],
                is_intro=False,
                sort_order=max_sort_order + index,
            )
            print(f"{'insert' if execute else 'would-insert'}: {media.sort_order} {media.url}")
            if execute:
                session.add(media)

        if execute:
            await session.commit()


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true", help="Upload files and insert DB rows")
    args = parser.parse_args()

    local_paths = _local_root_images()
    print(f"local root images: {len(local_paths)}")
    for path in local_paths:
        print(f"local: {path.name}")

    local_keys = await _upload_local_images(local_paths, execute=args.execute)
    r2_keys = _list_r2_image_keys()
    print(f"total r2 image keys found: {len(r2_keys)}")
    for key in r2_keys:
        print(f"r2: {key}")

    await _sync_media_rows([*r2_keys, *local_keys], execute=args.execute)


if __name__ == "__main__":
    asyncio.run(main())
