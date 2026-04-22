"""
Location Repository — Data access for locations and location_links.
Layer 3 (Data Access): Only knows SQL/ORM, does NOT know HTTP.
"""


async def get_all_locations() -> list[dict]:
    """Get all locations for map rendering."""
    # TODO: SELECT id, name, slug, status, map_x, map_y, is_start_node, background_url FROM locations
    return []


async def get_by_slug(slug: str) -> dict | None:
    """Get a single location with full details."""
    # TODO: SELECT * FROM locations WHERE slug = :slug
    # TODO: JOIN location_links for navigation data
    return None


async def get_links(location_id: str) -> list[dict]:
    """Get navigation links from a location."""
    # TODO: SELECT ll.*, l.name, l.slug FROM location_links ll JOIN locations l ON ll.to_location_id = l.id
    return []


async def update(location_id: str, data: dict) -> dict | None:
    """Update location metadata."""
    # TODO: UPDATE locations SET ... WHERE id = :location_id
    return None


async def get_summary_with_counts() -> list[dict]:
    """Get locations with document/asset counts for admin panel."""
    # TODO: SELECT l.*, COUNT(d.id) as doc_count, COUNT(m.id) as asset_count
    return []
