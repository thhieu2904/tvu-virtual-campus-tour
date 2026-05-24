"""
Vector Repository — pgvector cosine similarity search.
Layer 3 (Data Access): Vector-only search for MVP.

Phase 1: Vector search only (cosine similarity via pgvector <=> operator).
Phase 2 (future): Add BM25 full-text search + RRF fusion.
"""

import logging
from uuid import UUID

from sqlalchemy import text as sql_text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def vector_search(
    session: AsyncSession,
    query_embedding: list[float],
    location_id: UUID | None = None,
    top_k: int = 5,
    threshold: float = 0.3,
) -> list[dict]:
    """
    Find most relevant document chunks using cosine similarity (pgvector).

    Location filtering:
    - location_id provided: search chunks for that location + global chunks (legacy support)
    - location_id = None: search ALL chunks (current global-document behavior)

    Returns list of dicts with: id, document_id, content, chunk_index, metadata, similarity
    """
    # Build the SQL query
    # pgvector <=> operator = cosine distance (0 = identical, 2 = opposite)
    # similarity = 1 - distance
    if location_id:
        sql = sql_text("""
            SELECT
                id,
                document_id,
                location_id,
                content,
                chunk_index,
                metadata,
                1 - (embedding <=> :query_embedding) AS similarity
            FROM document_chunks
            WHERE (location_id = :location_id OR location_id IS NULL)
              AND 1 - (embedding <=> :query_embedding) > :threshold
            ORDER BY embedding <=> :query_embedding
            LIMIT :top_k
        """)
        params = {
            "query_embedding": str(query_embedding),
            "location_id": str(location_id),
            "threshold": threshold,
            "top_k": top_k,
        }
    else:
        sql = sql_text("""
            SELECT
                id,
                document_id,
                location_id,
                content,
                chunk_index,
                metadata,
                1 - (embedding <=> :query_embedding) AS similarity
            FROM document_chunks
            WHERE 1 - (embedding <=> :query_embedding) > :threshold
            ORDER BY embedding <=> :query_embedding
            LIMIT :top_k
        """)
        params = {
            "query_embedding": str(query_embedding),
            "threshold": threshold,
            "top_k": top_k,
        }

    result = await session.execute(sql, params)
    rows = result.fetchall()

    chunks = []
    for row in rows:
        chunks.append({
            "id": str(row.id),
            "document_id": str(row.document_id),
            "location_id": str(row.location_id) if row.location_id else None,
            "content": row.content,
            "chunk_index": row.chunk_index,
            "metadata": row.metadata,
            "similarity": float(row.similarity),
        })

    logger.info(
        f"🔍 Vector search: {len(chunks)} results "
        f"(location={location_id}, top_k={top_k}, threshold={threshold})"
    )
    return chunks


# TODO Phase 2: Add BM25 full-text search + RRF fusion
# async def bm25_search(session, query_text, location_id, top_k): ...
# def rrf_fusion(vector_results, bm25_results, top_k, k=60): ...
# async def hybrid_search(session, query_embedding, query_text, location_id, top_k): ...
