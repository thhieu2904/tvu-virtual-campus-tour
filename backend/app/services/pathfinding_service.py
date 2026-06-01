"""
Pathfinding Service — A* algorithm on Navigation Graph.

Layer 2 (Service): Contains business logic for pathfinding.
Loads nav_graph.json once, runs A* on-demand.
"""

import heapq
import json
import math
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel

BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
GRAPH_PATH = BACKEND_ROOT / "data" / "nav_graph.json"


# ─── Response models ───


class PathStep(BaseModel):
    """A single step in the A* exploration (for visualization)."""
    action: str  # "explore" | "add_frontier" | "update_frontier"
    node_id: str
    node_label: str
    g: float
    f: float
    detail: str


class PathResult(BaseModel):
    """Result of an A* pathfinding query."""
    found: bool
    path: list[str]  # node IDs
    coordinates: list[dict[str, Any]]  # [{x, y, node}]
    total_cost: float
    explored_count: int
    total_nodes: int
    computation_ms: float
    steps: list[PathStep]  # for visualization


class GraphData(BaseModel):
    """Full navigation graph for frontend rendering."""
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    active_destinations: list[str]  # slugs


# ─── Graph singleton ───

_graph_cache: dict[str, Any] | None = None
_nodes_cache: dict[str, dict] | None = None
_adj_cache: dict[str, list[tuple[str, float]]] | None = None


def _load_graph() -> dict[str, Any]:
    """Load nav_graph.json (cached in memory)."""
    global _graph_cache
    if _graph_cache is None:
        with open(GRAPH_PATH, "r", encoding="utf-8") as f:
            _graph_cache = json.load(f)
    return _graph_cache


def _build_adjacency() -> tuple[dict[str, dict], dict[str, list[tuple[str, float]]]]:
    """Build adjacency list from graph (cached in memory)."""
    global _nodes_cache, _adj_cache
    if _nodes_cache is not None and _adj_cache is not None:
        return _nodes_cache, _adj_cache

    graph = _load_graph()
    nodes = {n["id"]: n for n in graph["nodes"]}
    adj: dict[str, list[tuple[str, float]]] = {n_id: [] for n_id in nodes}

    for edge in graph["edges"]:
        from_id = edge["from"]
        to_id = edge["to"]
        cost = edge.get("cost", 0.0)

        # Auto-calculate cost from coordinates if missing/zero
        if cost == 0.0:
            n1, n2 = nodes[from_id], nodes[to_id]
            cost = math.hypot(n2["x"] - n1["x"], n2["y"] - n1["y"])

        adj[from_id].append((to_id, cost))
        if edge.get("bidirectional", True):
            adj[to_id].append((from_id, cost))

    _nodes_cache = nodes
    _adj_cache = adj
    return nodes, adj


def _get_label(node: dict) -> str:
    """Human-readable label for a node."""
    return node.get("label") or node.get("building") or node["id"]


def _slug_to_node_id(slug: str) -> str | None:
    """Find node ID by slug. Returns None if not found."""
    nodes, _ = _build_adjacency()
    for node in nodes.values():
        if node.get("slug") == slug:
            return node["id"]
    return None


# ─── Public API ───


def get_graph(active_slugs: list[str] | None = None) -> GraphData:
    """
    Return full graph data for frontend rendering.
    If active_slugs provided, merge active status from DB.
    """
    graph = _load_graph()
    nodes, _ = _build_adjacency()

    output_nodes = []
    for node in graph["nodes"]:
        node_out = {**node}
        # Override active status from DB if provided
        if active_slugs is not None and node.get("slug"):
            node_out["active"] = node["slug"] in active_slugs
        output_nodes.append(node_out)

    active_dests = [
        n.get("slug", "")
        for n in output_nodes
        if n.get("active") and n.get("slug")
    ]

    return GraphData(
        nodes=output_nodes,
        edges=graph["edges"],
        active_destinations=active_dests,
    )


def find_path(
    from_slug: str,
    to_slug: str,
    include_steps: bool = False,
) -> PathResult:
    """
    Run A* pathfinding between two locations (by slug).
    Returns path, cost, and optional visualization steps.
    """
    nodes, adj = _build_adjacency()
    start_id = _slug_to_node_id(from_slug)
    goal_id = _slug_to_node_id(to_slug)

    if not start_id or not goal_id:
        return PathResult(
            found=False, path=[], coordinates=[], total_cost=0,
            explored_count=0, total_nodes=len(nodes),
            computation_ms=0, steps=[],
        )

    t0 = time.perf_counter()
    steps: list[PathStep] = []
    goal_node = nodes[goal_id]

    def heuristic(node_id: str) -> float:
        n = nodes[node_id]
        return math.hypot(goal_node["x"] - n["x"], goal_node["y"] - n["y"])

    # A* algorithm
    open_set: list[tuple[float, str]] = [(heuristic(start_id), start_id)]
    came_from: dict[str, str] = {}
    g_score: dict[str, float] = {start_id: 0.0}
    closed: set[str] = set()

    while open_set:
        f_current, current = heapq.heappop(open_set)

        if current in closed:
            continue
        closed.add(current)

        current_g = g_score[current]
        current_node = nodes[current]

        if include_steps:
            steps.append(PathStep(
                action="explore",
                node_id=current,
                node_label=_get_label(current_node),
                g=round(current_g, 2),
                f=round(f_current, 2),
                detail=f"Explore: {_get_label(current_node)} (g={current_g:.1f}, f={f_current:.1f})",
            ))

        # Goal reached
        if current == goal_id:
            elapsed_ms = (time.perf_counter() - t0) * 1000

            # Reconstruct path
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()

            coordinates = [
                {"x": round(nodes[nid]["x"], 2), "y": round(nodes[nid]["y"], 2), "node": nid}
                for nid in path
            ]

            return PathResult(
                found=True,
                path=path,
                coordinates=coordinates,
                total_cost=round(current_g, 2),
                explored_count=len(closed),
                total_nodes=len(nodes),
                computation_ms=round(elapsed_ms, 3),
                steps=steps,
            )

        # Expand neighbors
        for neighbor, cost in adj.get(current, []):
            if neighbor in closed:
                continue

            tentative_g = current_g + cost
            if tentative_g < g_score.get(neighbor, float("inf")):
                was_in_open = neighbor in g_score
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                h = heuristic(neighbor)
                f = tentative_g + h
                heapq.heappush(open_set, (f, neighbor))

                if include_steps:
                    neighbor_node = nodes[neighbor]
                    action = "update_frontier" if was_in_open else "add_frontier"
                    steps.append(PathStep(
                        action=action,
                        node_id=neighbor,
                        node_label=_get_label(neighbor_node),
                        g=round(tentative_g, 2),
                        f=round(f, 2),
                        detail=(
                            f"{'Update' if was_in_open else 'Frontier+'}: "
                            f"{_get_label(neighbor_node)} via {_get_label(current_node)} "
                            f"(g={tentative_g:.1f}, h={h:.1f}, f={f:.1f})"
                        ),
                    ))

    # No path found
    elapsed_ms = (time.perf_counter() - t0) * 1000
    return PathResult(
        found=False, path=[], coordinates=[], total_cost=0,
        explored_count=len(closed), total_nodes=len(nodes),
        computation_ms=round(elapsed_ms, 3), steps=steps,
    )
