import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import async_session
from app.db.tables import Mascot, Location, SuggestedQuestion
from sqlalchemy import select, delete

async def seed_data():
    print("🚀 Bắt đầu tạo 4 Mascot và Câu hỏi gợi ý...")
    
    async with async_session() as session:
        # Xóa các mascot cũ
        await session.execute(delete(Mascot))
        # Xóa câu hỏi gợi ý cũ
        await session.execute(delete(SuggestedQuestion))
        await session.commit()
        
        # Lấy danh sách location
        result = await session.execute(select(Location))
        locations = result.scalars().all()
        loc_dict = {l.slug: l for l in locations}
        
        # 1. Khởi tạo 4 Mascot
        m_sanh = Mascot(
            name="ViVy",
            slug="vivy-sanh",
            model_3d_url="/mascots/character_1.glb",
            voice_name="Kore",
            voice_style="Friendly, welcoming, and clear",
            personality_prompt="Bạn là ViVy, đại sứ nhiệt tình của Đại học Trà Vinh. Giọng điệu của bạn vui vẻ, thân thiện, và hiếu khách như một hướng dẫn viên chuyên nghiệp.",
            is_default=True
        )
        
        m_it = Mascot(
            name="Kaito",
            slug="kaito-it",
            model_3d_url="/mascots/character_1.glb",
            voice_name="Puck",
            voice_style="Dynamic, fast-paced, and tech-savvy",
            personality_prompt="Bạn là Kaito, chuyên gia công nghệ tại Khoa CNTT (Tòa C7). Giọng điệu của bạn năng động, trẻ trung, tự tin, mang đậm chất dân IT.",
            is_default=False
        )
        
        m_lib = Mascot(
            name="Nhã Uyên",
            slug="nha-uyen-lib",
            model_3d_url="/mascots/character_1.glb",
            voice_name="Leda",
            voice_style="Calm, warm, and academic",
            personality_prompt="Bạn là Nhã Uyên, thủ thư đáng yêu tại Thư viện TVU (Tòa B7). Giọng điệu của bạn trầm ấm, nhỏ nhẹ, điềm đạm và truyền cảm hứng đọc sách.",
            is_default=False
        )
        
        m_event = Mascot(
            name="Bảo Trân",
            slug="bao-tran-event",
            model_3d_url="/mascots/character_1.glb",
            voice_name="Zephyr",
            voice_style="Professional, loud, and formal",
            personality_prompt="Bạn là Bảo Trân, MC duyên dáng tại Hội trường D5. Giọng điệu của bạn dõng dạc, rành mạch, chuyên nghiệp và lịch sự.",
            is_default=False
        )
        
        session.add_all([m_sanh, m_it, m_lib, m_event])
        await session.flush()
        
        questions_to_add = []

        # 2. Gán mascot và câu hỏi cho Cổng Chính
        loc_sanh = loc_dict.get("cong-chinh")
        if loc_sanh:
            loc_sanh.mascot_id = m_sanh.id
            questions_to_add.extend([
                SuggestedQuestion(location_id=loc_sanh.id, question="Giới thiệu tổng quan về Đại học Trà Vinh", sort_order=1),
                SuggestedQuestion(location_id=loc_sanh.id, question="Trường có bao nhiêu ngành đào tạo?", sort_order=2),
                SuggestedQuestion(location_id=loc_sanh.id, question="Hướng dẫn các bước nhập học cho tân sinh viên", sort_order=3),
                SuggestedQuestion(location_id=loc_sanh.id, question="Đưa mình tới Thư viện nhé!", sort_order=4),
            ])

        # 3. Gán mascot và câu hỏi cho Khoa CNTT
        loc_it = loc_dict.get("c7-khoa-cntt")
        if loc_it:
            loc_it.mascot_id = m_it.id
            questions_to_add.extend([
                SuggestedQuestion(location_id=loc_it.id, question="Ngành Công nghệ thông tin học những gì?", sort_order=1),
                SuggestedQuestion(location_id=loc_it.id, question="Học phí nhóm ngành kỹ thuật là bao nhiêu?", sort_order=2),
                SuggestedQuestion(location_id=loc_it.id, question="Cơ hội việc làm ngành IT sau khi ra trường?", sort_order=3),
            ])

        # 4. Gán mascot và câu hỏi cho Thư viện
        loc_lib = loc_dict.get("b7-thu-vien")
        if loc_lib:
            loc_lib.mascot_id = m_lib.id
            questions_to_add.extend([
                SuggestedQuestion(location_id=loc_lib.id, question="Thư viện mở cửa vào thời gian nào?", sort_order=1),
                SuggestedQuestion(location_id=loc_lib.id, question="Sinh viên có thể sử dụng thư viện điện tử không?", sort_order=2),
                SuggestedQuestion(location_id=loc_lib.id, question="Đưa mình sang Khoa Công nghệ Thông tin", sort_order=3),
            ])

        # 5. Gán mascot và câu hỏi cho Giảng đường D5
        loc_event = loc_dict.get("d5-giang-duong")
        if loc_event:
            loc_event.mascot_id = m_event.id
            questions_to_add.extend([
                SuggestedQuestion(location_id=loc_event.id, question="Khu vực này thường tổ chức sự kiện gì?", sort_order=1),
                SuggestedQuestion(location_id=loc_event.id, question="Trường có những chính sách học bổng nào?", sort_order=2),
            ])
            
        session.add_all(questions_to_add)
        await session.commit()
        print("✅ Đã tạo thành công 4 Mascot và Câu hỏi gợi ý cho các khu vực!")

if __name__ == "__main__":
    asyncio.run(seed_data())
