import asyncio
import os
import sys
import logging
from pathlib import Path

# Thêm đường dẫn backend vào sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import text

from app.db.database import async_session
from app.db.tables import Document, DocumentChunk
from app.services.chunker import MarkdownSemanticChunker
from app.ai.embedding_engine import embed_batch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

V2_DOCS_DIR = Path(__file__).parent.parent.parent / "assets" / "docs-rag" / "processed" / "v2"

# Sử dụng chunker giống ingest_service
_chunker = MarkdownSemanticChunker(chunk_size=1500, chunk_overlap=200, min_chunk_tokens=200)

async def ingest_v2():
    logger.info("🚀 Starting RAG v2 Ingestion Pipeline")
    
    if not V2_DOCS_DIR.exists():
        logger.error(f"❌ Directory not found: {V2_DOCS_DIR}")
        return

    async with async_session() as session:
        # 1. Truncate old data
        logger.info("🗑️ Cleaning up old vector data (TRUNCATE)...")
        # CASCADE sẽ xóa cả chunks khi documents bị xóa
        await session.execute(text("TRUNCATE TABLE documents CASCADE;"))
        await session.commit()
        logger.info("✅ Database cleaned.")

        # 2. Process each markdown file
        md_files = list(V2_DOCS_DIR.glob("*.md"))
        if not md_files:
            logger.error("❌ No markdown files found.")
            return

        total_chunks_inserted = 0

        for filepath in md_files:
            filename = filepath.name
            logger.info(f"📄 Processing: {filename}")
            
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()

            # Create document record
            from uuid import uuid4
            doc_id = uuid4()
            
            new_doc = Document(
                id=doc_id,
                title=filename.replace(".md", "").replace("_", " "),
                file_url=f"v2/{filename}",
                file_type="md",
                file_size=len(content.encode('utf-8')),
                status="processing",
                location_id=None # Global context
            )
            session.add(new_doc)
            await session.commit()

            try:
                # 3. Chunk
                pages = [{"text": content}]
                document_metadata = {"file_name": filename, "document_id": str(doc_id)}
                
                chunks = _chunker.chunk_pages(pages, document_metadata)
                if not chunks:
                    logger.warning(f"⚠️ No chunks generated for {filename}")
                    new_doc.status = "ready"
                    new_doc.chunk_count = 0
                    await session.commit()
                    continue

                # 4. Embed in batches
                logger.info(f"  🧠 Embedding {len(chunks)} chunks...")
                chunk_texts = [c["text_content"] for c in chunks]
                embeddings = await embed_batch(chunk_texts)

                # 5. Insert chunks
                db_chunks = []
                for i, chunk in enumerate(chunks):
                    meta = chunk["metadata"]
                    meta["token_count"] = chunk["token_count"]
                    db_chunks.append(DocumentChunk(
                        document_id=doc_id,
                        location_id=None,
                        chunk_index=chunk["chunk_index"],
                        content=chunk["text_content"],
                        embedding=embeddings[i],
                        metadata_=meta
                    ))
                
                session.add_all(db_chunks)
                
                # Update status
                new_doc.status = "ready"
                new_doc.chunk_count = len(chunks)
                await session.commit()
                
                total_chunks_inserted += len(chunks)
                logger.info(f"  ✅ Saved {len(chunks)} chunks for {filename}")

            except Exception as e:
                await session.rollback()
                logger.error(f"❌ Failed to process {filename}: {e}")
                
                # Mark as error
                new_doc.status = "error"
                session.add(new_doc) # Re-add to session to update
                await session.commit()

        logger.info(f"🎉 RAG v2 Ingestion Complete! Total chunks: {total_chunks_inserted}")

if __name__ == "__main__":
    asyncio.run(ingest_v2())
