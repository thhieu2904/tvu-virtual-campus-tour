"""
Ingest Service — Document processing pipeline.
Layer 2 (Business Logic): extract text → chunk → embed → store.
"""

from pathlib import Path


async def start_ingestion(file_bytes: bytes, filename: str, title: str, location_id: str | None) -> str:
    """
    Orchestrate document ingestion (runs in BackgroundTasks):
    1. Upload file to Cloudflare R2
    2. Insert document record (status='pending')
    3. Extract text (PDF/DOCX)
    4. Chunk text (MarkdownSemanticChunker, ~1500 tokens, 200 overlap)
    5. Batch embed chunks (Gemini Embedding, 100/batch)
    6. Store chunks + vectors in pgvector
    7. Update status to 'ready'
    """
    # TODO: Implement full pipeline
    return "placeholder-document-id"


async def process_document_background(document_id: str, file_bytes: bytes, filename: str, location_id: str | None):
    """
    Background task: called by FastAPI BackgroundTasks.
    Does NOT block the HTTP response.
    """
    try:
        # TODO: Implement steps 3-7 from start_ingestion
        # await document_repo.update_status(document_id, 'processing')
        #
        # ext = Path(filename).suffix.lower()
        # pages = extract_text(ext, file_bytes)
        # chunks = chunk_text(pages)
        # embeddings = await gemini_service.embed_batch([c["text"] for c in chunks])
        # await document_repo.insert_chunks(document_id, location_id, chunks, embeddings)
        # await document_repo.update_status(document_id, 'ready', chunk_count=len(chunks))
        pass
    except Exception as e:
        # await document_repo.update_status(document_id, 'error', error_message=str(e))
        print(f"❌ Failed processing {filename}: {e}")
