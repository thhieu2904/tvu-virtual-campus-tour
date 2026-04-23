import asyncio
import sys
import os

# Add the backend directory to sys.path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.db.database import engine
from app.db.tables import Base


UPGRADE_SQL = [
    # === timestamp without time zone -> timestamp with time zone (UTC) ===
    (
        "DO $$ "
        "BEGIN "
        "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'created_at' AND data_type = 'timestamp without time zone') THEN "
        "ALTER TABLE locations ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'updated_at' AND data_type = 'timestamp without time zone') THEN "
        "ALTER TABLE locations ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC'; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'created_at' AND data_type = 'timestamp without time zone') THEN "
        "ALTER TABLE documents ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'created_at' AND data_type = 'timestamp without time zone') THEN "
        "ALTER TABLE document_chunks ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'media' AND column_name = 'created_at' AND data_type = 'timestamp without time zone') THEN "
        "ALTER TABLE media ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'started_at' AND data_type = 'timestamp without time zone') THEN "
        "ALTER TABLE chat_sessions ALTER COLUMN started_at TYPE TIMESTAMPTZ USING started_at AT TIME ZONE 'UTC'; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_sessions' AND column_name = 'ended_at' AND data_type = 'timestamp without time zone') THEN "
        "ALTER TABLE chat_sessions ALTER COLUMN ended_at TYPE TIMESTAMPTZ USING ended_at AT TIME ZONE 'UTC'; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chat_messages' AND column_name = 'created_at' AND data_type = 'timestamp without time zone') THEN "
        "ALTER TABLE chat_messages ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'; "
        "END IF; "
        "END $$;"
    ),

    # === locations ===
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS avatar_model_url TEXT;",
    "ALTER TABLE locations ADD COLUMN IF NOT EXISTS sort_order INTEGER;",
    "ALTER TABLE locations ALTER COLUMN sort_order SET DEFAULT 0;",
    "UPDATE locations SET sort_order = 0 WHERE sort_order IS NULL;",
    "ALTER TABLE locations ALTER COLUMN sort_order SET NOT NULL;",
    "UPDATE locations SET background_url = '' WHERE background_url IS NULL;",
    "ALTER TABLE locations ALTER COLUMN background_url SET DEFAULT '';",
    "ALTER TABLE locations ALTER COLUMN background_url SET NOT NULL;",
    "UPDATE locations SET voice_config = '{\"voice_name\": \"Kore\"}'::json WHERE voice_config IS NULL;",
    "ALTER TABLE locations ALTER COLUMN voice_config SET DEFAULT '{\"voice_name\": \"Kore\"}'::json;",
    "ALTER TABLE locations ALTER COLUMN voice_config SET NOT NULL;",
    "UPDATE locations SET camera_config = '{}'::json WHERE camera_config IS NULL;",
    "ALTER TABLE locations ALTER COLUMN camera_config SET DEFAULT '{}'::json;",
    "ALTER TABLE locations ALTER COLUMN camera_config SET NOT NULL;",
    "UPDATE locations SET status = 'active' WHERE status IS NULL;",
    "ALTER TABLE locations ALTER COLUMN status SET NOT NULL;",
    "UPDATE locations SET is_start_node = FALSE WHERE is_start_node IS NULL;",
    "ALTER TABLE locations ALTER COLUMN is_start_node SET NOT NULL;",
    "UPDATE locations SET map_x = 0.0 WHERE map_x IS NULL;",
    "ALTER TABLE locations ALTER COLUMN map_x SET NOT NULL;",
    "UPDATE locations SET map_y = 0.0 WHERE map_y IS NULL;",
    "ALTER TABLE locations ALTER COLUMN map_y SET NOT NULL;",
    "UPDATE locations SET description = '' WHERE description IS NULL;",
    "ALTER TABLE locations ALTER COLUMN description SET NOT NULL;",
    "UPDATE locations SET intro_message = '' WHERE intro_message IS NULL;",
    "ALTER TABLE locations ALTER COLUMN intro_message SET NOT NULL;",

    # === location_links ===
    "ALTER TABLE location_links ALTER COLUMN label SET NOT NULL;",
    "ALTER TABLE location_links ALTER COLUMN path_points SET NOT NULL;",
    (
        "DELETE FROM location_links a USING location_links b "
        "WHERE a.id > b.id "
        "AND a.from_location_id = b.from_location_id "
        "AND a.to_location_id = b.to_location_id;"
    ),
    (
        "DO $$ "
        "BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uix_location_links_from_to') THEN "
        "ALTER TABLE location_links ADD CONSTRAINT uix_location_links_from_to UNIQUE (from_location_id, to_location_id); "
        "END IF; "
        "END $$;"
    ),

    # === suggested_questions ===
    "UPDATE suggested_questions SET sort_order = 0 WHERE sort_order IS NULL;",
    "ALTER TABLE suggested_questions ALTER COLUMN sort_order SET NOT NULL;",

    # === documents ===
    "UPDATE documents SET file_type = 'pdf' WHERE file_type IS NULL;",
    "ALTER TABLE documents ALTER COLUMN file_type SET NOT NULL;",
    "UPDATE documents SET file_size = 0 WHERE file_size IS NULL;",
    "ALTER TABLE documents ALTER COLUMN file_size SET NOT NULL;",
    "UPDATE documents SET status = 'pending' WHERE status IS NULL;",
    "ALTER TABLE documents ALTER COLUMN status SET NOT NULL;",
    "UPDATE documents SET chunk_count = 0 WHERE chunk_count IS NULL;",
    "ALTER TABLE documents ALTER COLUMN chunk_count SET NOT NULL;",

    # === document_chunks ===
    "UPDATE document_chunks SET chunk_index = 0 WHERE chunk_index IS NULL;",
    "ALTER TABLE document_chunks ALTER COLUMN chunk_index SET NOT NULL;",
    "UPDATE document_chunks SET metadata = '{}'::json WHERE metadata IS NULL;",
    "ALTER TABLE document_chunks ALTER COLUMN metadata SET DEFAULT '{}'::json;",
    "ALTER TABLE document_chunks ALTER COLUMN metadata SET NOT NULL;",

    # === media ===
    "ALTER TABLE media ADD COLUMN IF NOT EXISTS sort_order INTEGER;",
    "ALTER TABLE media ALTER COLUMN sort_order SET DEFAULT 0;",
    "UPDATE media SET sort_order = 0 WHERE sort_order IS NULL;",
    "ALTER TABLE media ALTER COLUMN sort_order SET NOT NULL;",
    "UPDATE media SET caption = '' WHERE caption IS NULL;",
    "ALTER TABLE media ALTER COLUMN caption SET NOT NULL;",
    "UPDATE media SET keywords = '[]'::json WHERE keywords IS NULL;",
    "ALTER TABLE media ALTER COLUMN keywords SET NOT NULL;",
    "UPDATE media SET is_intro = FALSE WHERE is_intro IS NULL;",
    "ALTER TABLE media ALTER COLUMN is_intro SET NOT NULL;",

    # === chat_sessions ===
    "UPDATE chat_sessions SET is_kiosk = FALSE WHERE is_kiosk IS NULL;",
    "ALTER TABLE chat_sessions ALTER COLUMN is_kiosk SET NOT NULL;",
    "UPDATE chat_sessions SET message_count = 0 WHERE message_count IS NULL;",
    "ALTER TABLE chat_sessions ALTER COLUMN message_count SET NOT NULL;",
    "UPDATE chat_sessions SET device_info = '' WHERE device_info IS NULL;",
    "ALTER TABLE chat_sessions ALTER COLUMN device_info SET NOT NULL;",

    # === chat_messages ===
    "UPDATE chat_messages SET input_type = 'text' WHERE input_type IS NULL;",
    "ALTER TABLE chat_messages ALTER COLUMN input_type SET NOT NULL;",

    # === FKs with on delete behavior ===
    (
        "DELETE FROM location_links "
        "WHERE from_location_id NOT IN (SELECT id FROM locations) "
        "OR to_location_id NOT IN (SELECT id FROM locations);"
    ),
    "UPDATE documents SET location_id = NULL WHERE location_id IS NOT NULL AND location_id NOT IN (SELECT id FROM locations);",
    "UPDATE document_chunks SET location_id = NULL WHERE location_id IS NOT NULL AND location_id NOT IN (SELECT id FROM locations);",
    "DELETE FROM media WHERE location_id NOT IN (SELECT id FROM locations);",
    "UPDATE chat_sessions SET start_location_id = NULL WHERE start_location_id IS NOT NULL AND start_location_id NOT IN (SELECT id FROM locations);",
    "UPDATE chat_messages SET location_id = NULL WHERE location_id IS NOT NULL AND location_id NOT IN (SELECT id FROM locations);",
    (
        "DO $$ "
        "BEGIN "
        "IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_links_from_location_id_fkey') THEN "
        "ALTER TABLE location_links DROP CONSTRAINT location_links_from_location_id_fkey; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'location_links_to_location_id_fkey') THEN "
        "ALTER TABLE location_links DROP CONSTRAINT location_links_to_location_id_fkey; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_location_id_fkey') THEN "
        "ALTER TABLE documents DROP CONSTRAINT documents_location_id_fkey; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_chunks_location_id_fkey') THEN "
        "ALTER TABLE document_chunks DROP CONSTRAINT document_chunks_location_id_fkey; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'media_location_id_fkey') THEN "
        "ALTER TABLE media DROP CONSTRAINT media_location_id_fkey; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_start_location_id_fkey') THEN "
        "ALTER TABLE chat_sessions DROP CONSTRAINT chat_sessions_start_location_id_fkey; "
        "END IF; "
        "IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_location_id_fkey') THEN "
        "ALTER TABLE chat_messages DROP CONSTRAINT chat_messages_location_id_fkey; "
        "END IF; "
        "END $$;"
    ),
    "ALTER TABLE location_links ADD CONSTRAINT location_links_from_location_id_fkey FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE CASCADE;",
    "ALTER TABLE location_links ADD CONSTRAINT location_links_to_location_id_fkey FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE CASCADE;",
    "ALTER TABLE documents ADD CONSTRAINT documents_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;",
    "ALTER TABLE document_chunks ADD CONSTRAINT document_chunks_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;",
    "ALTER TABLE media ADD CONSTRAINT media_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;",
    "ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_start_location_id_fkey FOREIGN KEY (start_location_id) REFERENCES locations(id) ON DELETE SET NULL;",
    "ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_location_id_fkey FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL;",
]

async def init_models():
    print("⏳ Đang kết nối tới Supabase Database...")
    try:
        async with engine.begin() as conn:
            # 1. Bật extension pgvector để lưu trữ trí tuệ nhân tạo
            print("📦 Đang kích hoạt extension pgvector...")
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            
            # 2. Xóa và tạo lại toàn bộ bảng (chỉ dùng cho lúc setup ban đầu)
            # await conn.run_sync(Base.metadata.drop_all) # Bỏ comment nếu muốn reset DB
            
            print("🏗️ Đang tạo các bảng dữ liệu...")
            await conn.run_sync(Base.metadata.create_all)

            print("🧩 Đang cập nhật schema hiện có (idempotent)...")
            for stmt in UPGRADE_SQL:
                await conn.execute(text(stmt))
            
            print("🔍 Đang khởi tạo Index Vector cho document_chunks...")
            await conn.execute(text("CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);"))
            
            print("✅ Xong! Toàn bộ Database Schema đã được khởi tạo thành công trên Supabase!")
    except Exception as e:
        print(f"❌ Lỗi: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(init_models())
