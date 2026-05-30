"""
Document Repository — Data access for documents and document_chunks.
Layer 3 (Data Access): CRUD operations for RAG document management.
All functions receive an AsyncSession as the first argument.
"""

import logging
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.tables import Document, DocumentChunk

logger = logging.getLogger(__name__)


async def insert_document(
    session: AsyncSession,
    title: str,
    file_url: str,
    file_type: str,
    file_size: int,
    category_id: UUID | None = None,
) -> UUID:
    """Insert a new document record. Returns document_id (UUID)."""
    doc = Document(
        title=title,
        file_url=file_url,
        file_type=file_type,
        file_size=file_size,
        location_id=None,
        category_id=category_id,
        status="pending",
    )
    session.add(doc)
    await session.flush()  # Generate UUID without committing
    logger.info(f"📄 Created document record: {doc.id} — {title}")
    return doc.id


async def update_status(
    session: AsyncSession,
    document_id: UUID,
    status: str,
    chunk_count: int | None = None,
    error_message: str | None = None,
):
    """Update document processing status.

    chunk_count is only written when explicitly provided (not None),
    so retrying a document won't accidentally reset its chunk count.
    """
    values: dict = {"status": status, "error_message": error_message}
    if chunk_count is not None:
        values["chunk_count"] = chunk_count

    stmt = (
        update(Document)
        .where(Document.id == document_id)
        .values(**values
        )
    )
    await session.execute(stmt)
    logger.info(f"📋 Document {document_id} status → {status} (chunks: {chunk_count})")


async def insert_chunks(
    session: AsyncSession,
    document_id: UUID,
    location_id: UUID | None,
    chunks: list[dict],
    embeddings: list[list[float]],
):
    """Batch insert document chunks with embeddings into pgvector.

    Args:
        chunks: list of dicts from chunker, each with:
            - text_content: str
            - chunk_index: int
            - token_count: int
            - metadata: dict
        embeddings: list of 768-dim float vectors, same length as chunks
    """
    if len(chunks) != len(embeddings):
        raise ValueError(
            f"Mismatch: {len(chunks)} chunks but {len(embeddings)} embeddings"
        )

    chunk_objects = []
    for chunk, embedding in zip(chunks, embeddings):
        chunk_objects.append(
            DocumentChunk(
                document_id=document_id,
                location_id=location_id,
                content=chunk["text_content"],
                chunk_index=chunk["chunk_index"],
                metadata_=chunk.get("metadata", {}),
                embedding=embedding,
            )
        )

    session.add_all(chunk_objects)
    await session.flush()
    logger.info(
        f"💾 Inserted {len(chunk_objects)} chunks for document {document_id}"
    )


async def get_by_id(session: AsyncSession, document_id: UUID) -> Document | None:
    """Get a single document by ID."""
    result = await session.execute(
        select(Document).where(Document.id == document_id)
    )
    return result.scalar_one_or_none()


async def list_documents(
    session: AsyncSession,
    status: str | None = None,
    search: str | None = None,
    category_id: UUID | None = None,
    uncategorized: bool = False,
    page: int = 1,
    limit: int = 10,
) -> dict:
    """List documents with filtering and pagination."""
    query = select(Document).options(selectinload(Document.category)).order_by(Document.created_at.desc())

    if status:
        query = query.where(Document.status == status)
    if search:
        query = query.where(Document.title.ilike(f"%{search}%"))
    if uncategorized:
        query = query.where(Document.category_id.is_(None))
    elif category_id:
        query = query.where(Document.category_id == category_id)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await session.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)
    result = await session.execute(query)
    documents = result.scalars().all()

    return {
        "total": total,
        "documents": [
            {
                "id": str(doc.id),
                "title": doc.title,
                "file_url": doc.file_url,
                "file_type": doc.file_type,
                "file_size": doc.file_size,
                "location_id": str(doc.location_id) if doc.location_id else None,
                "category_id": str(doc.category_id) if doc.category_id else None,
                "category_name": doc.category.name if doc.category else None,
                "category_color": doc.category.color if doc.category else None,
                "chunk_count": doc.chunk_count,
                "status": doc.status,
                "error_message": doc.error_message,
                "created_at": doc.created_at.isoformat() if doc.created_at else None,
            }
            for doc in documents
        ],
    }


async def delete_with_chunks(session: AsyncSession, document_id: UUID) -> str | None:
    """Delete document + its chunks. Returns file_url for R2 cleanup.

    Chunks are cascade-deleted via ORM relationship.
    """
    doc = await get_by_id(session, document_id)
    if not doc:
        return None

    file_url = doc.file_url
    await session.delete(doc)
    await session.flush()
    logger.info(f"🗑️ Deleted document {document_id} + chunks")
    return file_url


async def update_category(
    session: AsyncSession,
    document_id: UUID,
    category_id: UUID | None,
) -> Document | None:
    """Assign or clear a document category."""
    doc = await get_by_id(session, document_id)
    if not doc:
        return None

    doc.category_id = category_id
    await session.flush()
    return doc
