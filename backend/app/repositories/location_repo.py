"""
Location Repository — Data access for locations and location_links.
Layer 3 (Data Access): Only knows SQL/ORM, does NOT know HTTP.
"""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.db.tables import Location, LocationLink


async def get_by_id(db: AsyncSession, location_id: str | UUID) -> Location | None:
    """Get a single location by ID (UUID string or UUID object)."""
    if isinstance(location_id, str):
        location_id = UUID(location_id)
    result = await db.execute(
        select(Location)
        .where(Location.id == location_id)
        .options(selectinload(Location.mascot))
    )
    return result.scalar_one_or_none()


async def get_by_slug(db: AsyncSession, slug: str) -> Location | None:
    """Get a single location by slug."""
    result = await db.execute(
        select(Location).where(Location.slug == slug)
    )
    return result.scalar_one_or_none()


async def get_all_locations_node_data(db: AsyncSession) -> list[dict]:
    """
    Fetch all locations with their links and suggested questions.
    Returns them structured exactly as the frontend LocationNode interface.
    """
    # Eager load suggested_questions to avoid N+1 query problem
    stmt = select(Location).options(
        selectinload(Location.suggested_questions)
    ).order_by(Location.sort_order)
    
    result = await db.execute(stmt)
    locations = result.scalars().all()
    
    # Fetch all location links with the target slug
    link_stmt = select(LocationLink, Location.slug.label("to_slug")).join(
        Location, LocationLink.to_location_id == Location.id
    )
    link_result = await db.execute(link_stmt)
    links_data = link_result.all()
    
    # Map links by from_location_id
    links_by_from = {}
    for link_obj, to_slug in links_data:
        from_id = str(link_obj.from_location_id)
        if from_id not in links_by_from:
            links_by_from[from_id] = []
        links_by_from[from_id].append({
            "toSlug": to_slug,
            "label": link_obj.label
        })
        
    response_nodes = []
    for loc in locations:
        loc_id_str = str(loc.id)
        
        # Sort questions by sort_order
        sorted_qs = sorted(loc.suggested_questions, key=lambda q: q.sort_order)
        
        node = {
            "id": loc_id_str,
            "name": loc.name,
            "slug": loc.slug,
            "status": loc.status,
            "isStartNode": loc.is_start_node,
            "description": loc.description,
            "introMessage": loc.intro_message,
            "intro_audio_url": loc.intro_audio_url,
            "backgroundUrl": loc.background_url,
            "suggestedQuestions": [q.question for q in sorted_qs],
            "links": links_by_from.get(loc_id_str, [])
        }
        response_nodes.append(node)
        
    return response_nodes
