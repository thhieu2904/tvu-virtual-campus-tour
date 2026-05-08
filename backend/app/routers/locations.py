"""
Locations router — Public endpoints for location data.
Layer 1 (HTTP): Parse request → call Service → return response.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services import location_service
from app.schemas.location import LocationsListResponse
from app.repositories import location_repo, media_repo

router = APIRouter()


@router.get("/locations", response_model=LocationsListResponse)
async def list_locations(db: AsyncSession = Depends(get_db)):
    """
    GET /api/locations
    Returns all locations with basic info for map rendering.
    """
    return await location_service.get_all_locations(db)


@router.get("/locations/{slug}")
async def get_location(slug: str, db: AsyncSession = Depends(get_db)):
    """
    GET /api/locations/{slug}
    Returns detailed info for a specific location.
    """
    location = await location_repo.get_by_slug(db, slug)
    if not location:
        return {"error": "Location not found", "slug": slug}
    return {
        "id": str(location.id),
        "name": location.name,
        "slug": location.slug,
        "description": location.description,
        "intro_message": location.intro_message,
        "intro_audio_url": location.intro_audio_url,
        "background_url": location.background_url,
    }


@router.get("/locations/{slug}/assets")
async def get_location_assets(
    slug: str,
    media_type: str | None = Query(None, description="Filter: image, video, gif, or all"),
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/locations/{slug}/assets?media_type=image
    Returns media assets for a location's Info Panel.
    """
    assets = await media_repo.get_by_location_slug(db, slug, media_type=media_type)
    return {"assets": assets, "total": len(assets)}


@router.get("/locations/{slug}/questions")
async def get_suggested_questions(slug: str):
    """
    GET /api/locations/{slug}/questions
    Returns suggested questions for a location.
    """
    # TODO: Call location_service.get_questions(slug)
    return {"questions": [], "message": "Not implemented yet"}

