"""
Navigation API — Public endpoints for map data and pathfinding.

GET /api/nav/graph  → Full navigation graph (nodes + edges + active status)
GET /api/nav/path   → A* pathfinding between two locations
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.db.tables import Location
from app.services import pathfinding_service

router = APIRouter()


@router.get("/graph")
async def get_navigation_graph(session: AsyncSession = Depends(get_db)):
    """
    Return the full navigation graph with active status from DB.
    Frontend calls this once on load to render the map.
    """
    # Get active slugs from DB (source of truth for active/inactive)
    result = await session.execute(
        select(Location.slug).where(Location.status == "active")
    )
    active_slugs = [row[0] for row in result.all()]

    graph = pathfinding_service.get_graph(active_slugs=active_slugs)
    return graph.model_dump()


@router.get("/path")
async def find_path(
    from_slug: str = Query(..., alias="from", description="Start location slug"),
    to_slug: str = Query(..., alias="to", description="Goal location slug"),
    include_steps: bool = Query(False, description="Include A* visualization steps"),
):
    """
    Run A* pathfinding between two locations.
    Returns the shortest path with coordinates for map rendering.
    Set include_steps=true for A* visualization (step-by-step exploration).
    """
    result = pathfinding_service.find_path(
        from_slug=from_slug,
        to_slug=to_slug,
        include_steps=include_steps,
    )
    return result.model_dump()
