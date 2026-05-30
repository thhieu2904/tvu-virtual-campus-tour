"""
Ingest Service — Document processing pipeline.
Layer 2 (Business Logic): extract text → chunk → embed → store.

The pipeline runs in 2 stages:
  1. start_ingestion() — called from HTTP handler, validates + uploads + creates DB record
  2. process_document_background() — runs as BackgroundTask, does the heavy lifting

IMPORTANT: process_document_background() creates its OWN DB session because
BackgroundTasks runs AFTER the HTTP response, when the request's session is closed.
"""

import logging
from pathlib import Path
from uuid import UUID

from app.db.database import async_session
from app.db.tables import DocumentCategory
from app.services.extractors import TextExtractor
from app.services.chunker import MarkdownSemanticChunker
from app.services import storage_service
from app.repositories import document_repo
from app.ai.embedding_engine import embed_batch

logger = logging.getLogger(__name__)

# Allowed file types and max size
ALLOWED_EXTENSIONS = {".pdf", ".docx"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Singleton instances (stateless, reusable)
_extractor = TextExtractor()
_chunker = MarkdownSemanticChunker(chunk_size=1500, chunk_overlap=200, min_chunk_tokens=200)


def validate_file(filename: str, file_size: int):
    """Validate file type and size. Raises ValueError on invalid."""
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(ALLOWED_EXTENSIONS)
        raise ValueError(f"Unsupported file type '{ext}'. Allowed: {allowed}")
    if file_size > MAX_FILE_SIZE:
        max_mb = MAX_FILE_SIZE / (1024 * 1024)
        raise ValueError(f"File too large ({file_size} bytes). Max: {max_mb}MB")


async def start_ingestion(
    file_bytes: bytes,
    filename: str,
    title: str,
    category_id: UUID | None = None,
) -> UUID:
    """
    Stage 1: Create document record in DB + upload file to R2.
    Called from the HTTP handler. Returns document_id for tracking.

    The actual processing (extract → chunk → embed) happens in
    process_document_background() which is scheduled as a BackgroundTask.
    """
    file_size = len(file_bytes)
    file_type = Path(filename).suffix.lower().lstrip(".")

    # Validate
    validate_file(filename, file_size)

    async with async_session() as session:
        category_slug = "uncategorized"
        if category_id:
            category = await session.get(DocumentCategory, category_id)
            if not category:
                raise ValueError("Category not found")
            category_slug = category.slug

        # Upload to R2
        r2_key = storage_service.build_document_key(filename, category_slug=category_slug)
        content_type = "application/pdf" if file_type == "pdf" else (
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        await storage_service.upload_file(file_bytes, r2_key, content_type)

        # Insert document record
        doc_id = await document_repo.insert_document(
            session,
            title=title,
            file_url=r2_key,
            file_type=file_type,
            file_size=file_size,
            category_id=category_id,
        )
        await session.commit()

    logger.info(f"📋 Ingestion started: {doc_id} — {filename}")
    return doc_id


async def process_document_background(
    document_id: UUID,
    file_bytes: bytes,
    filename: str,
):
    """
    Stage 2: Background task — extract → chunk → embed → store.

    Creates its own DB session because BackgroundTasks runs AFTER
    the HTTP response, when the request's DB session is already closed.
    """
    logger.info(f"🔄 Background processing started: {document_id}")

    async with async_session() as session:
        try:
            # Step 1: Mark as processing
            await document_repo.update_status(session, document_id, "processing")
            await session.commit()

            # Step 2: Extract text from file
            logger.info(f"  📄 Step 2: Extracting text from '{filename}'")
            pages = _extractor.extract(file_bytes, file_name=filename)
            if not pages:
                raise RuntimeError(f"No text extracted from '{filename}'")

            # Step 3: Chunk into semantic sections
            logger.info(f"  ✂️ Step 3: Chunking {len(pages)} pages")
            document_metadata = {
                "file_name": filename,
                "document_id": str(document_id),
            }
            chunks = _chunker.chunk_pages(pages, document_metadata)
            if not chunks:
                raise RuntimeError(f"No chunks produced from '{filename}'")

            # Step 4: Embed all chunks (Gemini batch embedding)
            logger.info(f"  🧠 Step 4: Embedding {len(chunks)} chunks")
            chunk_texts = [c["text_content"] for c in chunks]
            embeddings = await embed_batch(chunk_texts)

            # Step 5: Store chunks + embeddings in pgvector
            logger.info(f"  💾 Step 5: Inserting {len(chunks)} chunks into DB")
            await document_repo.insert_chunks(
                session, document_id, None, chunks, embeddings
            )

            # Step 6: Mark as ready
            await document_repo.update_status(
                session, document_id, "ready", chunk_count=len(chunks)
            )
            await session.commit()

            logger.info(
                f"  ✅ Pipeline complete: {len(chunks)} chunks, "
                f"{len(pages)} pages for '{filename}'"
            )

        except Exception as e:
            await session.rollback()
            logger.error(f"❌ Failed processing {filename}: {e}")

            # Update status to error in a fresh transaction
            try:
                await document_repo.update_status(
                    session, document_id, "error", error_message=str(e)
                )
                await session.commit()
            except Exception as e2:
                logger.error(f"❌ Failed to update error status: {e2}")
