import asyncio
import sys
import os

# Add the backend directory to sys.path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select
from app.db.database import engine, async_session
from app.db.tables import Location, LocationLink, SuggestedQuestion

async def seed_data():
    print("⏳ Connecting to Database to seed demo data...")
    async with async_session() as db:
        try:
            # Check if already seeded
            result = await db.execute(select(Location))
            if result.scalars().first():
                print("⚠️ Database already contains locations. Skipping seed.")
                return

            print("🌱 Seeding DEMO LOCATIONS into Supabase...")

            loc1 = Location(
                name="Cổng chính TVU",
                slug="cong-chinh",
                status="active",
                is_start_node=True,
                description="Cổng chính Đại học Trà Vinh - Khu 1",
                intro_message="Chào mừng bạn đến với Đại học Trà Vinh! Mình là Trợ lý ảo TVU. Bạn muốn tham quan khu vực nào?",
                background_url="/demo/gate_giua_cong.jpg",
                sort_order=1
            )
            
            loc2 = Location(
                name="Thư viện TVU",
                slug="thu-vien",
                status="active",
                is_start_node=False,
                description="Thư viện trung tâm Đại học Trà Vinh",
                intro_message="Đây là Thư viện trung tâm TVU! Nơi đây phục vụ hơn 20,000 sinh viên với hàng ngàn đầu sách và tài liệu điện tử.",
                background_url="/demo/c7_middle.jpg",
                sort_order=2
            )
            
            loc3 = Location(
                name="Khoa CNTT",
                slug="khoa-cntt",
                status="active",
                is_start_node=False,
                description="Khoa Công nghệ Thông tin - Tòa C7",
                intro_message="Chào mừng bạn đến Khoa Công nghệ Thông tin! Khoa CNTT là một trong những khoa mạnh nhất của TVU.",
                background_url="/demo/c7_them.jpg",
                sort_order=3
            )
            
            db.add_all([loc1, loc2, loc3])
            await db.flush()  # To get the IDs

            # Add Links
            link1 = LocationLink(from_location_id=loc1.id, to_location_id=loc2.id, label="Đi tới Thư viện")
            link2 = LocationLink(from_location_id=loc1.id, to_location_id=loc3.id, label="Đi tới Khoa CNTT")
            link3 = LocationLink(from_location_id=loc2.id, to_location_id=loc1.id, label="Quay lại Cổng chính")
            link4 = LocationLink(from_location_id=loc2.id, to_location_id=loc3.id, label="Đi tới Khoa CNTT")
            link5 = LocationLink(from_location_id=loc3.id, to_location_id=loc1.id, label="Quay lại Cổng chính")
            link6 = LocationLink(from_location_id=loc3.id, to_location_id=loc2.id, label="Đi tới Thư viện")
            db.add_all([link1, link2, link3, link4, link5, link6])

            # Add Suggested Questions
            qs1 = SuggestedQuestion(location_id=loc1.id, question="Giới thiệu về trường TVU", sort_order=1)
            qs2 = SuggestedQuestion(location_id=loc1.id, question="Đưa mình tới Thư viện", sort_order=2)
            qs3 = SuggestedQuestion(location_id=loc1.id, question="Có ngành CNTT không?", sort_order=3)
            qs4 = SuggestedQuestion(location_id=loc2.id, question="Giờ mở cửa thư viện?", sort_order=1)
            qs5 = SuggestedQuestion(location_id=loc2.id, question="Có WiFi không?", sort_order=2)
            qs6 = SuggestedQuestion(location_id=loc2.id, question="Đưa mình tới Khoa CNTT", sort_order=3)
            qs7 = SuggestedQuestion(location_id=loc3.id, question="Ngành CNTT học gì?", sort_order=1)
            qs8 = SuggestedQuestion(location_id=loc3.id, question="Học phí bao nhiêu?", sort_order=2)
            qs9 = SuggestedQuestion(location_id=loc3.id, question="Cơ hội việc làm sau tốt nghiệp?", sort_order=3)
            db.add_all([qs1, qs2, qs3, qs4, qs5, qs6, qs7, qs8, qs9])

            await db.commit()
            print("✅ Demo data seeded successfully!")
        except Exception as e:
            print(f"❌ Error seeding data: {e}")
        finally:
            await engine.dispose()

if __name__ == "__main__":
    asyncio.run(seed_data())
