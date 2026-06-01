"""Seed DB locations from navigation graph nodes.

Creates missing Location rows for every non-junction graph node that has a slug.
Existing locations are left unchanged.
"""

import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from app.db.database import async_session
from app.db.tables import Location

GRAPH_PATH = BACKEND_ROOT / "data" / "nav_graph.json"


def _display_name(node: dict) -> str:
    if node.get("label"):
        return node["label"]
    if node.get("building"):
        return f"Toa {node['building']}"
    return node["id"]


def _description(node: dict) -> str:
    if node.get("type") == "entry":
        return "Cong chinh Khu 1 Dai hoc Tra Vinh"
    building = node.get("building") or node["id"]
    return f"Toa nha {building} - Khu 1 Dai hoc Tra Vinh"


async def seed() -> None:
    with open(GRAPH_PATH, "r", encoding="utf-8") as file:
        graph = json.load(file)

    nodes = [
        node
        for node in graph["nodes"]
        if node.get("type") != "junction" and node.get("slug")
    ]

    created = 0
    skipped = 0

    async with async_session() as session:
        for sort_order, node in enumerate(nodes):
            result = await session.execute(
                select(Location).where(Location.slug == node["slug"])
            )
            if result.scalar_one_or_none():
                skipped += 1
                print(f"SKIP {node['slug']} (exists)")
                continue

            location = Location(
                name=_display_name(node),
                slug=node["slug"],
                description=_description(node),
                intro_message="",
                status="inactive",
                is_start_node=False,
                background_url="",
                sort_order=sort_order,
            )
            session.add(location)
            created += 1
            print(f"ADD  {node['slug']} -> {location.name}")

        await session.commit()

    print(f"\nDone. Created {created}, skipped {skipped}, graph nodes {len(nodes)}.")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
