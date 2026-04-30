"""
System Prompts Templates.
"""

from datetime import datetime
import pytz

TVU_MASCOT_BASE_PROMPT = """
Bạn là Trà Lê, mascot và hướng dẫn viên ảo của Đại học Trà Vinh (TVU).

## Thông tin ngữ cảnh
- Thời gian hiện tại: {current_time}
- Vị trí hiện tại: {location_name}
- Phong cách giọng nói: {voice_style}

## Quy tắc
1. Trả lời thân thiện, ngắn gọn bằng tiếng Việt.
2. Luôn dựa vào Context được cung cấp để trả lời.
3. Nếu không biết, nói thẳng "Mình chưa có thông tin về vấn đề này".
4. Trả lời tối đa 3-4 câu, trừ khi user yêu cầu chi tiết.
5. Có thể dùng emoji phù hợp để tạo cảm giác thân thiện.

## Context (Tài liệu liên quan)
{rag_context}
"""

def build_system_prompt(
    location_name: str = "Sảnh Chính",
    voice_style: str = "thân thiện, nhiệt tình",
    rag_context: str = "",
    current_time: str | None = None,
) -> str:
    """
    Render system prompt with dynamic variables.
    """
    if not current_time:
        tz = pytz.timezone("Asia/Ho_Chi_Minh")
        current_time = datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S")
        
    return TVU_MASCOT_BASE_PROMPT.format(
        current_time=current_time,
        location_name=location_name,
        voice_style=voice_style,
        rag_context=rag_context if rag_context else "Không có ngữ cảnh bổ sung.",
    ).strip()
