"""
Tool Declarations — Gemini Function Calling tools for AI Agent.

Defines the tools that the AI Agent can use to:
- Navigate between locations (navigate_to)
- Display media on InfoPanel (show_media)
- Toggle the campus map overlay (toggle_map)
- Search location-specific documents (search_local)
- Search global/university-wide documents (search_global)
- [Placeholder] Search the web (search_web) — Phase 2

Usage:
    from app.ai.tools import AGENT_TOOLS
    config = types.GenerateContentConfig(tools=[AGENT_TOOLS], ...)
"""

from google.genai import types

# ─────────────────────────────────────────────
# Tool 1: Navigate to another location
# ─────────────────────────────────────────────
navigate_to_decl = types.FunctionDeclaration(
    name="navigate_to",
    description=(
        "Dẫn người dùng tới một địa điểm khác trong khuôn viên trường. "
        "Gọi khi user muốn đi tham quan nơi khác, hoặc khi AI gợi ý di chuyển. "
        "CHỈ dùng slug có trong danh sách hợp lệ được cung cấp trong system prompt."
    ),
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "location_slug": types.Schema(
                type=types.Type.STRING,
                description="Slug của địa điểm đích. Phải nằm trong danh sách slug hợp lệ.",
            ),
        },
        required=["location_slug"],
    ),
)

# ─────────────────────────────────────────────
# Tool 2: Show media on InfoPanel
# ─────────────────────────────────────────────
show_media_decl = types.FunctionDeclaration(
    name="show_media",
    description=(
        "Mở InfoPanel để hiển thị hình ảnh hoặc video giới thiệu địa điểm hiện tại. "
        "Gọi khi user hỏi về hình ảnh, video, hoặc muốn xem trực quan về nơi đang tham quan. "
        "Có thể tìm kiếm media cụ thể bằng cách trích xuất từ khóa từ câu hỏi của user."
    ),
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "media_type": types.Schema(
                type=types.Type.STRING,
                description="Loại media muốn hiển thị: 'video', 'image', hoặc 'all'.",
                enum=["video", "image", "all"],
            ),
            "search_query": types.Schema(
                type=types.Type.STRING,
                description="Từ khóa tìm kiếm media (ví dụ: 'phòng máy tính', 'thực hành'). Bỏ trống nếu muốn xem toàn bộ.",
            )
        },
        required=["media_type"],
    ),
)

# ─────────────────────────────────────────────
# Tool 3: Toggle campus map overlay
# ─────────────────────────────────────────────
toggle_map_decl = types.FunctionDeclaration(
    name="toggle_map",
    description=(
        "Mở hoặc đóng bản đồ tổng thể khuôn viên trường. "
        "Gọi khi user hỏi về vị trí, khoảng cách, bố cục khuôn viên, "
        "hoặc muốn xem bản đồ."
    ),
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "state": types.Schema(
                type=types.Type.STRING,
                description="'open' để mở bản đồ, 'close' để đóng.",
                enum=["open", "close"],
            ),
        },
        required=["state"],
    ),
)

# ─────────────────────────────────────────────
# Tool 4: Search LOCAL documents (location-specific)
# ─────────────────────────────────────────────
search_local_decl = types.FunctionDeclaration(
    name="search_local",
    description=(
        "Tìm kiếm thông tin chi tiết về ĐỊA ĐIỂM ĐANG ĐỨNG "
        "(phòng lab, thiết bị, lịch hoạt động, cơ sở vật chất, đặc điểm riêng...). "
        "Dùng khi user hỏi về nơi đang tham quan và Context có sẵn KHÔNG đủ để trả lời."
    ),
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "query": types.Schema(
                type=types.Type.STRING,
                description="Câu truy vấn tìm kiếm bằng tiếng Việt, viết lại ngắn gọn từ câu hỏi của user.",
            ),
        },
        required=["query"],
    ),
)

# ─────────────────────────────────────────────
# Tool 5: Search GLOBAL documents (university-wide)
# ─────────────────────────────────────────────
search_global_decl = types.FunctionDeclaration(
    name="search_global",
    description=(
        "Tìm kiếm thông tin CHUNG toàn trường: học phí, điểm chuẩn, quy chế đào tạo, "
        "chương trình đào tạo, lịch trình, chính sách sinh viên, tuyển sinh, "
        "hoặc bất kỳ thông tin nào KHÔNG liên quan đến địa điểm đang đứng. "
        "Dùng khi Context có sẵn KHÔNG đủ để trả lời câu hỏi mang tính toàn trường."
    ),
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "query": types.Schema(
                type=types.Type.STRING,
                description="Câu truy vấn tìm kiếm bằng tiếng Việt, viết lại ngắn gọn từ câu hỏi của user.",
            ),
        },
        required=["query"],
    ),
)

# ─────────────────────────────────────────────
# Tool 6 [PLACEHOLDER]: Search the web (Tavily)
# Phase 2 — Not included in AGENT_TOOLS yet
# ─────────────────────────────────────────────
search_web_decl = types.FunctionDeclaration(
    name="search_web",
    description=(
        "Tìm kiếm thông tin real-time trên website trường (tvu.edu.vn) và internet. "
        "Dùng khi cần thông tin thời sự: lịch thi, thông báo mới, sự kiện, "
        "hoặc khi cả search_local và search_global đều không có kết quả."
    ),
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "query": types.Schema(
                type=types.Type.STRING,
                description="Câu truy vấn tìm kiếm bằng tiếng Việt.",
            ),
        },
        required=["query"],
    ),
)


# ═════════════════════════════════════════════
# Combined Tool object — passed to Gemini config
# ═════════════════════════════════════════════
# NOTE: search_web_decl is NOT included — it's a Phase 2 placeholder.
# To enable, add it to the function_declarations list below.
AGENT_TOOLS = types.Tool(
    function_declarations=[
        navigate_to_decl,
        show_media_decl,
        toggle_map_decl,
        search_local_decl,
        search_global_decl,
        # search_web_decl,  # Phase 2: Uncomment to enable web search
    ]
)
