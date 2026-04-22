"""
Locations router — Public endpoints for location data.
Layer 1 (HTTP): Parse request → call Service → return response.
"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/locations")
async def list_locations():
    """
    GET /api/locations
    Returns all locations with basic info for map rendering.
    """
    # TODO: Call location_service.get_all_locations()
    return {"locations": [], "message": "Not implemented yet"}


@router.get("/locations/{slug}")
async def get_location(slug: str):
    """
    GET /api/locations/{slug}
    Returns detailed info for a specific location.
    """
    # TODO: Call location_service.get_location_by_slug(slug)
    return {"slug": slug, "message": "Not implemented yet"}


@router.get("/locations/{slug}/assets")
async def get_location_assets(slug: str):
    """
    GET /api/locations/{slug}/assets
    Returns media assets for a location's Info Panel.
    """
    # TODO: Call media_service.get_assets_by_location(slug)
    return {"assets": [], "message": "Not implemented yet"}


@router.get("/locations/{slug}/questions")
async def get_suggested_questions(slug: str):
    """
    GET /api/locations/{slug}/questions
    Returns suggested questions for a location.
    """
    # TODO: Call location_service.get_questions(slug)
    return {"questions": [], "message": "Not implemented yet"}
