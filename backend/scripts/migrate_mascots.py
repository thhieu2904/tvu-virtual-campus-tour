import asyncio
import sys
import os

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from sqlalchemy import text
from app.db.database import engine
async def run_migration():
    print("⏳ Connecting to Database...")
    try:
        async with engine.begin() as conn:
            print("👤 Seeding official mascots (Kaito + ViVy)...")
            await conn.execute(text("UPDATE locations SET mascot_id = NULL;"))
            await conn.execute(text("DELETE FROM mascots;"))
            await conn.execute(text("""
                INSERT INTO mascots (
                    name, slug, model_3d_url, voice_name, voice_style,
                    personality_prompt, is_default
                )
                VALUES
                (
                    'Kaito', 'kaito', 'mascots/kaito/model.glb',
                    'Puck', 'friendly, warm, and enthusiastic like a tour guide',
                    'Bạn là Kaito, hướng dẫn viên nam năng động của Đại học Trà Vinh. Giọng điệu của bạn thân thiện, vui vẻ, trẻ trung và nhiệt tình. Bạn nói chuyện tự nhiên như một anh sinh viên năm cuối đang giới thiệu trường cho đàn em.',
                    false
                ),
                (
                    'ViVy', 'vivy', 'mascots/vivy/model.glb',
                    'Leda', 'soft, cheerful, and youthful like a college student',
                    'Bạn là ViVy, đại sứ sinh viên nữ của Đại học Trà Vinh. Giọng điệu của bạn nhẹ nhàng, tươi tắn, mềm mại và năng động. Bạn nói chuyện như một cô bạn gái đáng yêu đang dẫn bạn đi tham quan trường.',
                    true
                );
            """))

            print("🔗 Linking locations to official mascots...")
            await conn.execute(text("""
                UPDATE locations SET mascot_id = (SELECT id FROM mascots WHERE slug = 'kaito')
                WHERE slug = 'c7-khoa-cntt';
            """))
            await conn.execute(text("""
                UPDATE locations SET mascot_id = (SELECT id FROM mascots WHERE slug = 'vivy')
                WHERE slug IN ('cong-chinh', 'b7-thu-vien', 'd5-giang-duong')
                   OR mascot_id IS NULL;
            """))

            print("🧹 Clearing legacy per-location document links...")
            await conn.execute(text("UPDATE documents SET location_id = NULL;"))
            await conn.execute(text("UPDATE document_chunks SET location_id = NULL;"))

            print("❓ Replacing suggested questions...")
            await conn.execute(text("DELETE FROM suggested_questions;"))
            await conn.execute(text("""
                INSERT INTO suggested_questions (location_id, question, sort_order) VALUES
                ((SELECT id FROM locations WHERE slug = 'cong-chinh'), 'Giới thiệu tổng quan về Đại học Trà Vinh', 1),
                ((SELECT id FROM locations WHERE slug = 'cong-chinh'), 'Trường có bao nhiêu ngành đào tạo?', 2),
                ((SELECT id FROM locations WHERE slug = 'cong-chinh'), 'Hướng dẫn các bước nhập học cho tân sinh viên', 3),
                ((SELECT id FROM locations WHERE slug = 'cong-chinh'), 'Đưa mình tới Thư viện nhé!', 4),
                ((SELECT id FROM locations WHERE slug = 'b7-thu-vien'), 'Thư viện mở cửa vào thời gian nào?', 1),
                ((SELECT id FROM locations WHERE slug = 'b7-thu-vien'), 'Sinh viên có thể sử dụng thư viện điện tử không?', 2),
                ((SELECT id FROM locations WHERE slug = 'b7-thu-vien'), 'Trường có chính sách học bổng nào?', 3),
                ((SELECT id FROM locations WHERE slug = 'b7-thu-vien'), 'Đưa mình sang Khoa Công nghệ Thông tin', 4),
                ((SELECT id FROM locations WHERE slug = 'c7-khoa-cntt'), 'Ngành Công nghệ thông tin học những gì?', 1),
                ((SELECT id FROM locations WHERE slug = 'c7-khoa-cntt'), 'Học phí nhóm ngành kỹ thuật là bao nhiêu?', 2),
                ((SELECT id FROM locations WHERE slug = 'c7-khoa-cntt'), 'Cơ hội việc làm ngành IT sau khi ra trường?', 3),
                ((SELECT id FROM locations WHERE slug = 'c7-khoa-cntt'), 'Đưa mình sang Giảng đường D5', 4),
                ((SELECT id FROM locations WHERE slug = 'd5-giang-duong'), 'Khu vực này thường tổ chức sự kiện gì?', 1),
                ((SELECT id FROM locations WHERE slug = 'd5-giang-duong'), 'Trường có những chính sách học bổng nào?', 2),
                ((SELECT id FROM locations WHERE slug = 'd5-giang-duong'), 'Trường có hợp tác quốc tế với nước nào?', 3),
                ((SELECT id FROM locations WHERE slug = 'd5-giang-duong'), 'Đưa mình về Cổng chính', 4);
            """))

            print("🗑️ Dropping old columns (voice_config, avatar_model_url)...")
            await conn.execute(text("ALTER TABLE locations DROP COLUMN IF EXISTS voice_config CASCADE;"))
            await conn.execute(text("ALTER TABLE locations DROP COLUMN IF EXISTS avatar_model_url CASCADE;"))
            
            print("✅ Mascot migration completed successfully!")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run_migration())
