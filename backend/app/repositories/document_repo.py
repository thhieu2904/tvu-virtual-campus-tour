"""
Document Repository — Data access for documents and document_chunks.
Layer 3 (Data Access): CRUD operations for RAG document management.
"""


async def insert_document(title: str, file_url: str, file_type: str, file_size: int, location_id: str | None) -> str:
    """Insert a new document record. Returns document_id."""
    # TODO: INSERT INTO documents (...) VALUES (...) RETURNING id
    return "placeholder-id"


async def update_status(document_id: str, status: str, chunk_count: int = 0, error_message: str | None = None):
    """Update document processing status."""
    # TODO: UPDATE documents SET status=:status, chunk_count=:count WHERE id=:id
    pass


async def insert_chunks(document_id: str, location_id: str | None, chunks: list[dict], embeddings: list[list[float]]):
    """Batch insert document chunks with embeddings into pgvector."""
    # TODO: INSERT INTO document_chunks (document_id, location_id, content, embedding, ...) VALUES ...
    pass


async def get_by_id(document_id: str) -> dict | None:
    """Get a single document by ID."""
    # TODO: SELECT * FROM documents WHERE id = :document_id
    return None


async def list_documents(location_id: str | None = None, status: str | None = None,
                          search: str | None = None, page: int = 1, limit: int = 10) -> dict:
    """List documents with filtering and pagination."""
    # TODO: SELECT with filters, pagination, JOIN locations for name
    return {"total": 0, "documents": []}


async def delete(document_id: str) -> int:
    """Delete document + chunks. Returns number of chunks deleted."""
    # TODO: DELETE FROM document_chunks WHERE document_id = :id; DELETE FROM documents WHERE id = :id
    return 0
