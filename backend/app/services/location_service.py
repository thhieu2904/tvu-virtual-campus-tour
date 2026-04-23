"""
Location Service — Business logic for locations.
Layer 2 (Service): Orchestrates data between repos and formatting.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories import location_repo
from app.schemas.location import LocationsListResponse, LocationNode

async def get_all_locations(db: AsyncSession) -> LocationsListResponse:
    """Fetch all locations and structure them for the frontend."""
    raw_nodes = await location_repo.get_all_locations_node_data(db)
    
    # Validate and convert using Pydantic
    nodes = [LocationNode(**node_data) for node_data in raw_nodes]
    
    return LocationsListResponse(locations=nodes)
