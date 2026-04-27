# TVU Virtual Campus Tour - Architecture Notes

## Hệ thống Pathfinding (A* vs Precomputed)
*   **Thực trạng:** Trên màn hình Kiosk (Frontend), hoàn toàn không có thuật toán tìm đường (A*) nào chạy trực tiếp.
*   **Lý do:** Bản đồ của trường là tĩnh (các tòa nhà, con đường không thay đổi). Việc tính toán A* real-time trên Kiosk mỗi khi người dùng thao tác là lãng phí tài nguyên CPU và có thể gây lag UI.
*   **Giải pháp (Precomputed Paths):** 
    *   Thuật toán A* chỉ chạy ở phía **Backend** thông qua script `precompute_paths.py`.
    *   Mỗi khi bản đồ thay đổi, admin/dev chạy script này. Nó sẽ giải toàn bộ các tuyến đường có thể đi được và xuất ra file `paths.json`.
    *   **Frontend (Kiosk):** Chỉ việc tải file `paths.json` này. Khi người dùng chọn điểm đến, Frontend chỉ lấy mảng tọa độ `[tọa độ 1, tọa độ 2, ...]` có sẵn và chạy animation vẽ đường. Nhanh, mượt và không tốn chi phí tính toán.

## Quản lý dữ liệu bản đồ (JSON)
*   **Source of Truth:** Duy nhất nằm ở `backend/data/nav_graph.json`. Đây là dữ liệu gốc định nghĩa toàn bộ node, edge, tọa độ của bản đồ.
*   **Tại sao lại có file ở Frontend (`frontend/src/data/nav_graph.json`)?**
    *   Hiện tại (Dev Mode), công cụ Map Editor nằm ở Frontend cần đọc trực tiếp cấu trúc đồ thị để hiển thị và cho phép chỉnh sửa. Do chưa có API backend hoàn chỉnh, chúng ta dùng một bản copy tĩnh.
*   **Quy trình chuẩn khi lên Production:**
    1.  Admin mở Map Editor (Frontend) -> gọi `API GET /api/map` để lấy `nav_graph.json` từ Backend.
    2.  Admin chỉnh sửa tọa độ, kéo thả đường đi.
    3.  Admin bấm Lưu -> Frontend gọi `API POST /api/map` gửi JSON mới về Backend.
    4.  Backend nhận data, ghi đè vào `backend/data/nav_graph.json`.
    5.  Backend tự động trigger script A* (`precompute_paths.py`) để tạo lại `paths.json`.
    6.  Kiosk tự động nhận đường đi mới nhất mà không cần cập nhật code.

## Cập nhật quan trọng: Single Source of Truth
*   **Vấn đề:** Trước đây tọa độ (x, y) bị lưu ở cả `nav_graph.json` và Database (`locations.map_x`, `locations.map_y`). Điều này gây phân mảnh dữ liệu.
*   **Quyết định:** Đã xóa bỏ hoàn toàn các cột tọa độ trong Database. 
*   **Kết quả:** File `nav_graph.json` chính thức là **nguồn dữ liệu duy nhất (Single Source of Truth)** cho mọi tọa độ trên bản đồ. Database chỉ còn lưu thông tin nội dung (Metadata).

## Nhiệm vụ tiếp theo: Alternative Paths (Tuyến đường phụ)
*   **Mục tiêu:** Cung cấp cho người dùng nhiều hơn một sự lựa chọn đường đi (ví dụ: đường ngắn nhất và đường vòng ngắm cảnh).
*   **Kế hoạch thực hiện:**
    1.  **Backend:** Nâng cấp thuật toán trong `precompute_paths.py`. Sau khi tìm đường ngắn nhất (Path 1), ta sẽ tăng trọng số (penalty) cho các cạnh đó và chạy lại A* để tìm đường khác (Path 2).
    2.  **Frontend:** Cập nhật Kiosk để hiển thị cả 2 đường: 
        *   Đường chính: Nét liền, nổi bật.
        *   Đường phụ: Nét đứt (dashed), mờ hơn.
    3.  **Dữ liệu:** Cấu trúc `paths.json` sẽ được mở rộng để chứa mảng các con đường cho mỗi cặp điểm đến.
