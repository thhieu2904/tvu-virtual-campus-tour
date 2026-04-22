"""
Vector Repository — Hybrid search (Vector + BM25 + RRF Fusion).
Layer 3 (Data Access): pgvector similarity search + full-text search.
"""


async def hybrid_search(
    query_embedding: list[float],
    query_text: str,
    location_id: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    """
    Hybrid search combining:
    1. Vector cosine similarity (pgvector) — semantic matching
    2. BM25 full-text search (PostgreSQL ts_vector) — keyword matching
    3. RRF Fusion — merge results avoiding duplicates

    Filters by location_id:
    - If location_id is provided: search only chunks for that location + global chunks (location_id IS NULL)
    - If location_id is None (Sảnh Chính): search all chunks

    Returns top_k most relevant chunks with scores.
    """
    # TODO: Implement hybrid search
    # vector_results = await _vector_search(query_embedding, location_id, top_k * 2)
    # bm25_results = await _bm25_search(query_text, location_id, top_k * 2)
    # fused = _rrf_fusion(vector_results, bm25_results, top_k)
    return []


async def _vector_search(embedding: list[float], location_id: str | None, limit: int) -> list[dict]:
    """Cosine similarity search on pgvector."""
    # TODO: SELECT *, 1 - (embedding <=> :query_embedding) AS score
    #       FROM document_chunks WHERE location_id = :lid OR location_id IS NULL
    #       ORDER BY embedding <=> :query_embedding LIMIT :limit
    return []


async def _bm25_search(query_text: str, location_id: str | None, limit: int) -> list[dict]:
    """PostgreSQL full-text search."""
    # TODO: SELECT *, ts_rank(to_tsvector('simple', content), plainto_tsquery('simple', :query)) AS score
    #       FROM document_chunks WHERE ... ORDER BY score DESC LIMIT :limit
    return []


def _rrf_fusion(vector_results: list[dict], bm25_results: list[dict], top_k: int, k: int = 60) -> list[dict]:
    """
    Reciprocal Rank Fusion: score = sum(1 / (k + rank_i)) for each result set.
    Combines vector and BM25 results, deduplicates by chunk_id.
    """
    scores: dict[str, float] = {}
    for rank, item in enumerate(vector_results):
        scores[item["id"]] = scores.get(item["id"], 0) + 1 / (k + rank + 1)
    for rank, item in enumerate(bm25_results):
        scores[item["id"]] = scores.get(item["id"], 0) + 1 / (k + rank + 1)

    # Merge and sort
    all_items = {item["id"]: item for item in vector_results + bm25_results}
    sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)[:top_k]
    return [all_items[id_] for id_ in sorted_ids if id_ in all_items]
