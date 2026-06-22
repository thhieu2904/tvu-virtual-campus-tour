"""
Tool Declarations — Gemini Function Calling tools for AI Agent.

Defines the tools that the AI Agent can use to:
- Navigate between locations (navigate_to)
- Display media on InfoPanel (show_media)
- Toggle the campus map overlay (toggle_map)
- Search documents in the knowledge base (search_documents)
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
        "Có thể tìm kiếm media cụ thể bằng cách trích xuất từ khóa từ câu hỏi của user. "
        "QUAN TRỌNG: Nếu user yêu cầu xem ảnh/video của một khu vực KHÁC với hiện tại, BẠN PHẢI GỌI ĐỒNG THỜI 2 tool cùng lúc: navigate_to (để đi tới đó) VÀ show_media (để mở ảnh)."
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
# Tool 4: Search documents (Global RAG)
# ─────────────────────────────────────────────
search_documents_decl = types.FunctionDeclaration(
    name="search_documents",
    description=(
        "Công cụ duy nhất để lấy thông tin thực tế và chi tiết về Đại học Trà Vinh (TVU), "
        "bao gồm học phí, điểm chuẩn, tuyển sinh, quy chế, chương trình đào tạo, học bổng, "
        "lịch sử, quy mô, thành tựu, cơ sở vật chất và các trường/khoa trực thuộc. "
        "BẮT BUỘC dùng cho mọi câu hỏi kiến thức về TVU; không tự trả lời từ kiến thức của mô hình."
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
# Tool 5 [PLACEHOLDER]: Search the web (Tavily)
# Phase 2 — Not included in AGENT_TOOLS yet
# ─────────────────────────────────────────────
search_web_decl = types.FunctionDeclaration(
    name="search_web",
    description=(
        "Tìm kiếm thông tin real-time trên website trường (tvu.edu.vn) và internet. "
        "Dùng khi cần thông tin thời sự: lịch thi, thông báo mới, sự kiện, "
        "hoặc khi tool search_documents không có kết quả."
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
        search_documents_decl,
        # search_web_decl,  # Phase 2: Uncomment to enable web search
    ]
)
