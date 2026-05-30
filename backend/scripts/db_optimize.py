"""
DB Optimization — Quick-win fixes from audit.
Run once, then delete. Uses app.config for credentials (RULE 1).
"""
import asyncio
from app.db.database import async_session
from sqlalchemy import text

FIXES = [
    # Fix 1: IVFFlat → HNSW (better for < 100K rows, no tuning needed)
    "DROP INDEX IF EXISTS document_chunks_embedding_idx",
    "CREATE INDEX document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops)",

    # Fix 2: Missing indexes on chat_messages
    "CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC)",

    # Fix 3: Missing index on documents.status
    "CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)",

    # Fix 4: Server-side defaults (match ORM defaults)
    "ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'pending'",
    "ALTER TABLE documents ALTER COLUMN chunk_count SET DEFAULT 0",
    "ALTER TABLE documents ALTER COLUMN file_type SET DEFAULT 'pdf'",
    "ALTER TABLE documents ALTER COLUMN file_size SET DEFAULT 0",
]

async def run():
    async with async_session() as session:
        for sql in FIXES:
            try:
                await session.execute(text(sql))
                print(f"  ✅ {sql[:80]}")
            except Exception as e:
                print(f"  ❌ {sql[:80]} — {e}")
        await session.commit()
        print("\n=== All fixes applied ===")

if __name__ == "__main__":
    asyncio.run(run())
