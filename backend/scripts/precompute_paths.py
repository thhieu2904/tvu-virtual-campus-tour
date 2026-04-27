"""
A* Pathfinding on Navigation Graph (not grid).
Reads nav_graph.json, computes shortest paths between all active destinations.
Outputs paths.json for Frontend rendering.
"""
import asyncio
import heapq
import json
import math
import sys
import os
from pathlib import Path

# Setup paths
BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import select
from app.db.database import async_session
from app.db.tables import Location, LocationLink


def load_graph():
    """Load navigation graph from JSON."""
    graph_path = BACKEND_ROOT / "data" / "nav_graph.json"
    with open(graph_path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_adjacency(graph_data):
    """Build adjacency list from nodes and edges."""
    nodes = {n["id"]: n for n in graph_data["nodes"]}
    adj = {n_id: [] for n_id in nodes}

    for edge in graph_data["edges"]:
        from_id = edge["from"]
        to_id = edge["to"]
        cost = edge.get("cost", 1.0)

        # Auto-calculate cost from coordinates if cost is 0
        if cost == 0.0:
            n1 = nodes[from_id]
            n2 = nodes[to_id]
            cost = math.hypot(n2["x"] - n1["x"], n2["y"] - n1["y"])

        adj[from_id].append((to_id, cost))
        if edge.get("bidirectional", True):
            adj[to_id].append((from_id, cost))

    return nodes, adj


def astar_graph(nodes, adj, start_id, goal_id):
    """A* on graph. Returns list of node IDs forming the shortest path."""
    if start_id not in nodes or goal_id not in nodes:
        return None

    goal = nodes[goal_id]

    def heuristic(node_id):
        n = nodes[node_id]
        return math.hypot(goal["x"] - n["x"], goal["y"] - n["y"])

    # Priority queue: (f_score, node_id)
    open_set = [(heuristic(start_id), start_id)]
    came_from = {}
    g_score = {start_id: 0.0}

    while open_set:
        _, current = heapq.heappop(open_set)

        if current == goal_id:
            # Reconstruct path
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            return list(reversed(path))

        for neighbor, cost in adj.get(current, []):
            tentative_g = g_score[current] + cost
            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f = tentative_g + heuristic(neighbor)
                heapq.heappush(open_set, (f, neighbor))

    return None  # No path found


SLUG_TO_NODE = {
    "cong-chinh": "welcome",
    "thu-vien": "b7_front",
    "khoa-cntt": "c7_front",
    "d5-nha-hoc": "d5_front",
}


async def async_main():
    print("📊 Loading navigation graph...")
    graph_data = load_graph()
    nodes, adj = build_adjacency(graph_data)
    print(f"   {len(nodes)} nodes, {len(graph_data['edges'])} edges loaded.")

    print("🔗 Connecting to database...")
    async with async_session() as db:
        try:
            # Batch load
            loc_result = await db.execute(select(Location))
            all_locations = {str(loc.id): loc for loc in loc_result.scalars().all()}

            link_result = await db.execute(select(LocationLink))
            links = link_result.scalars().all()

            print(f"   {len(links)} links, {len(all_locations)} locations from DB.\n")

            paths_output = {}
            success_count = 0

            for link in links:
                from_loc = all_locations.get(str(link.from_location_id))
                to_loc = all_locations.get(str(link.to_location_id))

                if not from_loc or not to_loc:
                    continue

                from_slug = from_loc.slug
                to_slug = to_loc.slug

                # Map DB slug → graph node ID
                from_node = SLUG_TO_NODE.get(from_slug)
                to_node = SLUG_TO_NODE.get(to_slug)

                if not from_node or not to_node:
                    print(f"  ⚠️  {from_slug} or {to_slug} not mapped in SLUG_TO_NODE!")
                    continue

                if from_node not in nodes or to_node not in nodes:
                    print(f"  ⚠️  {from_node} or {to_node} not found in nav_graph.json!")
                    continue

                print(f"  🧭 {from_loc.name} → {to_loc.name}")

                path_ids = astar_graph(nodes, adj, from_node, to_node)
                link_key = f"{from_slug}_to_{to_slug}"

                if path_ids:
                    # Convert node IDs → coordinates (percentage-based for SVG)
                    path_points = []
                    for nid in path_ids:
                        n = nodes[nid]
                        path_points.append({
                            "x": round(n["x"], 2),
                            "y": round(n["y"], 2),
                            "node": nid
                        })

                    paths_output[link_key] = path_points
                    success_count += 1

                    route_str = " → ".join(nid for nid in path_ids)
                    print(f"     ✅ {len(path_ids)} nodes: {route_str}")
                else:
                    print(f"     ❌ No path found!")
                    paths_output[link_key] = []

            # Write to paths.json
            paths_file = BACKEND_ROOT / "data" / "paths.json"
            with open(paths_file, "w", encoding="utf-8") as f:
                json.dump(paths_output, f, indent=2, ensure_ascii=False)

            print(f"\n✅ {success_count}/{len(links)} paths computed.")
            print(f"📁 Saved to {paths_file}")

        except Exception as e:
            print(f"❌ Error: {e}")
            import traceback
            traceback.print_exc()


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
