import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import async_session
from app.db.tables import Mascot, Location, SuggestedQuestion
from sqlalchemy import select, delete

async def seed_data():
    print("🚀 Bắt đầu tạo 2 Mascot và Câu hỏi gợi ý...")
    
    async with async_session() as session:
        # Xóa các mascot cũ
        result = await session.execute(select(Location))
        locations = result.scalars().all()
        for loc in locations:
            loc.mascot_id = None
        await session.flush()
        await session.execute(delete(Mascot))
        # Xóa câu hỏi gợi ý cũ
        await session.execute(delete(SuggestedQuestion))
        await session.commit()
        
        # Lấy danh sách location
        result = await session.execute(select(Location))
        locations = result.scalars().all()
        loc_dict = {l.slug: l for l in locations}
        
        # 1. Khởi tạo 2 Mascot chính thức
        m_kaito = Mascot(
            name="Kaito",
            slug="kaito",
            model_3d_url="mascots/kaito/model.glb",
            voice_name="Puck",
            voice_style="friendly, warm, and enthusiastic like a tour guide",
            personality_prompt="Bạn là Kaito, hướng dẫn viên nam năng động của Đại học Trà Vinh. Giọng điệu của bạn thân thiện, vui vẻ, trẻ trung và nhiệt tình. Bạn nói chuyện tự nhiên như một anh sinh viên năm cuối đang giới thiệu trường cho đàn em.",
            is_default=False
        )
        
        m_vivy = Mascot(
            name="ViVy",
            slug="vivy",
            model_3d_url="mascots/vivy/model.glb",
            voice_name="Leda",
            voice_style="soft, cheerful, and youthful like a college student",
            personality_prompt="Bạn là ViVy, đại sứ sinh viên nữ của Đại học Trà Vinh. Giọng điệu của bạn nhẹ nhàng, tươi tắn, mềm mại và năng động. Bạn nói chuyện như một cô bạn gái đáng yêu đang dẫn bạn đi tham quan trường.",
            is_default=True
        )
        
        session.add_all([m_kaito, m_vivy])
        await session.flush()
        
        questions_to_add = []

        # 2. Gán mascot và câu hỏi cho Cổng Chính
        loc_sanh = loc_dict.get("cong-chinh")
        if loc_sanh:
            loc_sanh.mascot_id = m_vivy.id
            questions_to_add.extend([
                SuggestedQuestion(location_id=loc_sanh.id, question="Giới thiệu tổng quan về Đại học Trà Vinh", sort_order=1),
                SuggestedQuestion(location_id=loc_sanh.id, question="Trường có bao nhiêu ngành đào tạo?", sort_order=2),
                SuggestedQuestion(location_id=loc_sanh.id, question="Hướng dẫn các bước nhập học cho tân sinh viên", sort_order=3),
                SuggestedQuestion(location_id=loc_sanh.id, question="Đưa mình tới Thư viện nhé!", sort_order=4),
            ])

        # 3. Gán mascot và câu hỏi cho Khoa CNTT
        loc_it = loc_dict.get("c7-khoa-cntt")
        if loc_it:
            loc_it.mascot_id = m_kaito.id
            questions_to_add.extend([
                SuggestedQuestion(location_id=loc_it.id, question="Ngành Công nghệ thông tin học những gì?", sort_order=1),
                SuggestedQuestion(location_id=loc_it.id, question="Học phí nhóm ngành kỹ thuật là bao nhiêu?", sort_order=2),
                SuggestedQuestion(location_id=loc_it.id, question="Cơ hội việc làm ngành IT sau khi ra trường?", sort_order=3),
                SuggestedQuestion(location_id=loc_it.id, question="Đưa mình sang Giảng đường D5", sort_order=4),
            ])

        # 4. Gán mascot và câu hỏi cho Thư viện
        loc_lib = loc_dict.get("b7-thu-vien")
        if loc_lib:
            loc_lib.mascot_id = m_vivy.id
            questions_to_add.extend([
                SuggestedQuestion(location_id=loc_lib.id, question="Thư viện mở cửa vào thời gian nào?", sort_order=1),
                SuggestedQuestion(location_id=loc_lib.id, question="Sinh viên có thể sử dụng thư viện điện tử không?", sort_order=2),
                SuggestedQuestion(location_id=loc_lib.id, question="Trường có chính sách học bổng nào?", sort_order=3),
                SuggestedQuestion(location_id=loc_lib.id, question="Đưa mình sang Khoa Công nghệ Thông tin", sort_order=4),
            ])

        # 5. Gán mascot và câu hỏi cho Giảng đường D5
        loc_event = loc_dict.get("d5-giang-duong")
        if loc_event:
            loc_event.mascot_id = m_vivy.id
            questions_to_add.extend([
                SuggestedQuestion(location_id=loc_event.id, question="Khu vực này thường tổ chức sự kiện gì?", sort_order=1),
                SuggestedQuestion(location_id=loc_event.id, question="Trường có những chính sách học bổng nào?", sort_order=2),
                SuggestedQuestion(location_id=loc_event.id, question="Trường có hợp tác quốc tế với nước nào?", sort_order=3),
                SuggestedQuestion(location_id=loc_event.id, question="Đưa mình về Cổng chính", sort_order=4),
            ])
            
        session.add_all(questions_to_add)
        await session.commit()
        print("✅ Đã tạo thành công 2 Mascot và 16 câu hỏi gợi ý cho các khu vực!")

if __name__ == "__main__":
    asyncio.run(seed_data())
