import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.database import async_session
from app.db.tables import Location
from sqlalchemy import select

async def update_intros():
    print("🚀 Bắt đầu cập nhật Intro Message...")
    
    intros = {
        "b7-thu-vien": "Chào bạn, mình là Nhã Uyên! Chào mừng bạn đến với Thư viện trung tâm TVU - trái tim tri thức của trường. Nơi đây là không gian học tập lý tưởng phục vụ hơn 20,000 sinh viên với thiết kế hiện đại, xanh mát cùng hàng ngàn đầu sách và tài liệu số phong phú. Rất vui được hỗ trợ bạn tìm kiếm tri thức nhé!",
        "c7-khoa-cntt": "Hello bạn! Kaito đây. Chào mừng bạn đến với Khoa Công nghệ Thông tin - Tòa C7! Nơi ươm mầm các tài năng công nghệ với cơ sở vật chất hiện đại, và là một trong những khoa mũi nhọn tự hào đạt kiểm định chất lượng quốc tế ABET của Hoa Kỳ. Cùng mình khám phá thế giới số nhé!",
        "cong-chinh": "Chào mừng bạn đến với Đại học Trà Vinh (TVU) - Ngôi trường xanh thân thiện mang đến cơ hội học tập chất lượng cho cộng đồng! Mình là ViVy, đại sứ ảo của trường, rất vui được đồng hành cùng bạn. Bạn muốn bắt đầu hành trình tham quan từ khu vực nào?",
        "d5-giang-duong": "Chào mừng bạn đến với Hội trường D5! Mình là Bảo Trân. Đây là không gian sự kiện lớn nhất TVU với sức chứa hơn 1.000 chỗ ngồi. D5 là nơi gắn liền với những kỷ niệm rực rỡ nhất: từ khoảnh khắc tự hào trong lễ trao bằng tốt nghiệp, cho đến những sự kiện lịch sử của trường. Cùng mình khám phá không gian tuyệt vời này nhé!"
    }
    
    async with async_session() as session:
        result = await session.execute(select(Location))
        locations = result.scalars().all()
        
        updated_count = 0
        for loc in locations:
            if loc.slug in intros:
                loc.intro_message = intros[loc.slug]
                updated_count += 1
                print(f"✅ Đã cập nhật intro cho {loc.slug}")
                
        await session.commit()
        print(f"🎉 Đã hoàn thành cập nhật {updated_count} khu vực!")

if __name__ == "__main__":
    asyncio.run(update_intros())
