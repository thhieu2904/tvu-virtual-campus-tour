"""
Media Repository — Data access for media assets.
Layer 3 (Data Access): Only knows SQL/ORM, does NOT know HTTP.
"""

from uuid import UUID

from sqlalchemy import String, cast, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.tables import Media


async def get_by_location(
    db: AsyncSession,
    location_id: UUID,
    media_type: str | None = None,
    search_query: str | None = None,
) -> list[dict]:
    """
    Get all media assets for a location, optionally filtered by type and search query.

    Args:
        location_id: The UUID of the location.
        media_type: Optional filter — "image", "video", "gif", or "all"/None for all types.
        search_query: Optional search keyword to filter by caption or keywords.

    Returns:
        List of dicts with media info (id, type, url, caption, keywords, is_intro).
    """
    stmt = select(Media).where(Media.location_id == location_id)

    if media_type and media_type != "all":
        stmt = stmt.where(Media.type == media_type)

    if search_query:
        # Search in caption or JSON keywords casted to string
        search_term = f"%{search_query.lower()}%"
        stmt = stmt.where(
            or_(
                Media.caption.ilike(search_term),
                cast(Media.keywords, String).ilike(search_term)
            )
        )

    stmt = stmt.order_by(Media.sort_order)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        {
            "id": str(row.id),
            "type": row.type,
            "url": row.url,
            "caption": row.caption,
            "keywords": row.keywords or [],
            "is_intro": row.is_intro,
            "sort_order": row.sort_order,
        }
        for row in rows
    ]


async def get_by_location_slug(
    db: AsyncSession,
    slug: str,
    media_type: str | None = None,
) -> list[dict]:
    """
    Get all media assets for a location by slug.
    Joins with locations table to resolve slug → location_id.
    """
    from app.db.tables import Location

    stmt = (
        select(Media)
        .join(Location, Media.location_id == Location.id)
        .where(Location.slug == slug)
    )

    if media_type and media_type != "all":
        stmt = stmt.where(Media.type == media_type)

    stmt = stmt.order_by(Media.sort_order)

    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        {
            "id": str(row.id),
            "type": row.type,
            "url": row.url,
            "caption": row.caption,
            "keywords": row.keywords or [],
            "is_intro": row.is_intro,
            "sort_order": row.sort_order,
        }
        for row in rows
    ]
