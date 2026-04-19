# 🗺️ Kịch bản Trải nghiệm Người dùng (User Journey & Edge Cases)

**Dự án:** TVU Virtual Campus Tour
**Phiên bản:** 1.1

Tài liệu này mô tả chi tiết luồng trải nghiệm của người dùng khi tương tác với hệ thống Kiosk, bao gồm các kịch bản chuẩn (Happy Path) và các kịch bản xử lý rủi ro (Edge Cases).

---

## 🟢 PHẦN 1: KỊCH BẢN CHUẨN (HAPPY PATH)

### 1. Trạng thái Nghỉ (Standby / Kiosk Mode)
- **Màn hình:** Phát video/hình ảnh giới thiệu nhẹ nhàng (Screensaver) về TVU.
- **UI:** Hiện dòng chữ lớn nhấp nháy *"Chạm vào màn hình để bắt đầu tham quan"* hoặc *"Xin chào, chạm để trò chuyện"*.
- **Hành động user:** Chạm 1 lần vào bất kỳ đâu trên màn hình.

### 2. Khởi động (Onboarding)
- **Loading:** Hiện logo TVU + thanh progress bar trong khi tải ảnh 360° và model Avatar lần đầu tiên (có thể mất 2-5 giây tuỳ mạng).
- **Màn hình:** Chuyển ngay (motion blur) vào không gian ảnh **360° Thư viện (B7)**.
- **Avatar 3D (Bên trái):** Xuất hiện theo cấu hình Mascot riêng của B7 (VD: Giọng AOEDE - Thân thiện, nhẹ nhàng). Kết hợp animation `waving` (vẫy tay) và `talking`.
- **Audio (Avatar):** Nhờ cơ chế SSE Streaming, tốc độ phản hồi mục tiêu **dưới 10 giây** ở điều kiện mạng ổn định. *"Xin chào! Mình là Trợ lý ảo của Đại học Trà Vinh. Bạn có thể mở bản đồ ở góc trên bên trái để xem trường mình, hoặc hỏi mình bất cứ điều gì nhé!"*
- **Info Panel (Bên phải):** Tự động phát video Giới thiệu chung về TVU.
- **First-time Guidance:** Sau khi Avatar nói xong 2-3 giây, minimap ở góc trái nhấp nháy nhẹ **1 lần duy nhất** kèm tooltip mũi tên: *"Chạm vào đây để mở bản đồ"*. Tooltip tự biến mất sau 5 giây hoặc sau khi user chạm vào bất kỳ đâu.
- **Trạng thái hệ thống:** Chuyển sang `Idle` (chờ đợi), bật Microphone thu âm 15-30 giây. Khung chat hiện gợn sóng báo hiệu đang lắng nghe.

### 3. Tương tác Hỏi đáp tại chỗ (RAG - Q&A)
- **User nói (hoặc bấm):** *"Cho em hỏi trường có ngành Công nghệ thông tin không?"*
- **Hệ thống:**
  1. Micro chuyển sang "Đang xử lý".
  2. Avatar chuyển sang trạng thái `Thinking` (chống cằm/đưa tay lên mặt).
  3. LLM xử lý và trả về API.
- **Phản hồi (Sentence Streaming):**
  1. Avatar chuyển sang `Talking`. Ngay khi câu đầu tiên được tách ra, audio phát lập tức: *"Có nha! Ngành CNTT là một trong số những ngành mũi nhọn..."*, lúc này câu thứ hai vẫn đang được render ngầm, giúp luồng nói liên tục, mượt mà và không có độ trễ chữ đi trước tiếng theo sau.
  2. Info Panel dừng video, chuyển sang hiển thị chùm ảnh sinh viên CNTT thực hành và text tóm tắt. Cảm xúc giọng đọc thay đổi năng động dựa trên audio tags (VD: `[excited]`).
  3. Có nút Chip gợi ý bên dưới: `Đưa tôi tới Khoa CNTT`.

### 4. Di chuyển cảnh (Navigation / View Change)
**Cách trigger:** 
- User bấm vào nút ở Mini-map có chữ "Khoa CNTT" (có hiệu ứng nháy sáng).
- Hoặc User bấm vào nút Chip gợi ý.
- Hoặc User nói: *"Đi tới đó luôn đi"*.
**Chuyển cảnh (Áp dụng Kiến trúc Mesh Graph & Map 2D Animation):**
- Màn hình ảnh 360° mờ đi (Fade out) nhường không gian cho **bản đồ 2D toàn cảnh campus trường TVU** (`bảng đồ ver2.png`).
- Hệ thống lấy mảng `path_points` trong Graph của hai node và vẽ một **đường line màu đỏ/cam chạy uốn lượn qua các khoé đường chính xác** từ điểm xuất phát tới điểm đích trên mặt bản đồ (Sử dụng kỹ thuật SVG Animation).
- **Audio (Voice):** *"Tuyệt vời! Hành trình đi bộ qua khoa Công nghệ thông tin sẽ mất một xíu nhé, đi theo mình!"*.
- Sau khi đường line chạy chạm tới điểm đích (hoạt ảnh kéo dài tầm 1.5s), màn hình lập tức phóng to (Zoom-in) mạnh vào toà nhà đích trên bản đồ 2D.
- Hoàn tất Zoom, toàn bộ cảnh lật mở (transition) vào không gian **360° của địa điểm mới**. 
- **Intro Camera Panning:** Thay vì nhìn thẳng ngay lập tức, Camera sẽ đặt tại một hướng cảnh quan đẹp (VD: Bờ hồ) tĩnh lặng 1-2 giây. Sau đó tự động quét (Pan) lướt một góc dựa trên `camera_config` trong Database đi ngang qua mặt tiền công trình đích.
- **Delayed Spawn Avatar & UI (Location-Aware Mascot):** Ngay khi camera quét xong và chốt hạ tại cửa chính, Avatar 3D mới bắt đầu thao tác đứng lên đón khách kèm lời chào. **Đặc biệt:** Cơ chế TTS tải config âm thanh Độc quyền cho Node này (VD: Giọng AOEDE - Thân thiện, nhí nhảnh ở Thư viện). Lúc này Info Menu và Chat log mới mờ dần hiện ra đệm theo lời nói.

*(Tính năng bổ sung) Chế độ Ngắm cảnh (Clean UI):* Ở bất cứ lúc nào, người dùng có thể nhấp vào nút `[Thu gọn giao diện]` (icon con mắt) trên màn hình để ẩn Info Panel, Avatar và thanh Chat bar. Hệ thống trả lại 100% không gian màn hình sạch sẽ để thỏa mãn việc chiêm ngưỡng ảnh 360°. Nhấp lại lần nữa để khôi phục.

### 5. Kết thúc phiên (Session Reset)

#### 5a. Kết thúc chủ động (User hoặc AI tự kết thúc)
**Cách trigger:**
- **Nút UI:** Chạm vào nút `[⏻ Kết thúc]` nhỏ gọn ở góc trên phải màn hình.
- **Giọng nói:** User nói *"Cảm ơn, tạm biệt"* hoặc *"Xong rồi"* → Gemini Function Calling nhận diện intent → gọi tool `end_session()`.
- **AI tự kết thúc:** Trong một số ngữ cảnh tự nhiên (VD: user nói *"Mình biết đủ rồi, cảm ơn nha"*), Gemini cũng có thể tự quyết định gọi `end_session()` mà không cần user nói chính xác cụm từ "tạm biệt".

**Xử lý:**
1. Avatar chuyển animation vẫy tay chào: *"Rất vui được giúp bạn! Chúc bạn một ngày tuyệt vời, hẹn gặp lại nhé!"*
2. Giao diện Fade out mượt mà về **Màn hình Standby** (Thư viện B7 — start node).
3. **Bảo mật + dữ liệu cải tiến:** Dọn sạch lịch sử chat hiển thị trên UI, cache tạm của phiên hiện tại và reset toàn bộ state local về ban đầu. Dữ liệu hội thoại vẫn được lưu ở backend theo dạng ẩn danh để phục vụ phân tích và cải thiện ứng dụng.

#### 5b. Kết thúc bị động (Timeout tự động)
**Tình huống:** Người dùng đã rời đi hoặc hệ thống nhàn rỗi (Idle) không có tương tác trong 3-5 phút (cấu hình qua Admin).
**Xử lý (Luồng 2 bước bảo vệ):**
1. **Bước 1 - Cảnh báo (Are you still there?):** Sau khi hết thời gian Timeout, hệ thống bật lên một Modal/Popup mờ nhẹ màn hình hiện tại (kèm đồng hồ đếm ngược 30s/60s).
   - **Text:** *"Bạn còn ở đó không? Phiên tham quan sẽ kết thúc sau 30 giây."*
   - **Âm thanh:** Phát tiếng tít/ping nhẹ để thu hút sự chú ý.
   - **Tương tác:** Có 2 nút `[Tiếp tục tham quan]` và `[Kết thúc ngay]`. Nếu người dùng chạm vào màn hình hoặc bấm Tiếp tục, Modal đóng và làm mới (reset) thời gian đếm nhàn rỗi.
2. **Bước 2 - Đóng phiên (Reset thật sự):** Nếu đếm ngược hết 30s mà không có tương tác, hoặc người dùng chủ động bấm "Kết thúc ngay".
   - Avatar vẫy tay: *"Cảm ơn bạn đã trải nghiệm. Chào tạm biệt!"*.
   - Giao diệnFade out (mờ dần) về lại Màn hình Standby.
  - **Bảo mật + dữ liệu cải tiến:** Xoá toàn bộ context/hiển thị tại client để người tiếp theo dùng phiên mới hoàn toàn; log hội thoại ẩn danh ở backend vẫn được giữ để tối ưu chất lượng hệ thống.

---

## 🔴 PHẦN 2: CÁC KỊCH BẢN XỬ LÝ NGOẠI LỆ (EDGE CASES)

### Kịch bản 2.1: Môi trường quá ồn / Nghe không hiểu (Audio Fallback)
**Tình huống:** Kiosk đặt tại sảnh sự kiện rất ồn, dẫn đến Speech-to-Text bị lỗi liên tục, hoặc bắt chữ sai hoàn toàn (Confidence < 0.3).
**Xử lý (Hệ thống Frontend):**
- Theo dõi nếu lỗi nhận diện lặp lại sau 3-5 giây. Nút Micro vô hiệu hóa tạm thời.
- Avatar chuyển anim `Shrug` (lắc đầu nhẹ/nhún vai).
- Audio phát: *"Ở đây hơi ồn, mình nghe chưa rõ. Bạn có thể nói lại to hơn chút xíu, hoặc **chọn các câu hỏi gợi ý ngay trên màn hình** giúp mình nhé!"*
- **UI UX:** Các nút "Chips" Gợi ý câu hỏi hoặc nút Đi tới địa điểm sẽ **phóng to nhẹ (pulse)** để hướng sự chú ý của người dùng vào việc **Chạm chạm** thay vì ép họ phải tiếp tục nói.

### Kịch bản 2.2: Người dùng trêu đùa / Hỏi lạc đề (Out-of-domain)
**Tình huống:** Thử thách AI bằng các câu không liên quan *(VD: "Tối nay ăn gì?", "Trường có bạn nữ nào xinh không?").*
**Xử lý (LLM Prompting & Routing):**
- Được quy định chặt chẽ trong System Prompt không được bịa chuyện (Hallucination) hoặc trả lời cứng nhắc kiểu robot.
- LLM trả về mã phân loại `OUT_OF_DOMAIN`.
- Avatar chuyển anim xua tay hoặc cười nhẹ.
- Audio phát vòng lặp (random fallback lines): *"Câu này khó quá! Trọng tâm của mình là đưa bạn đi tham quan Đại học Trà Vinh thôi. Bạn có muốn mình giới thiệu độ xịn của Thư viện trường không?"*
- Info Panel hiện ảnh Khuôn viên trường đẹp nhất.

### Kịch bản 3.1: Yêu cầu đến Khu vực đang xây dựng (Inactive Node)
**Tình huống:** Người dùng tò mò tìm thấy trên Minimap "Khu C8", dù Node này đang xám màu có icon 🔒, người dùng vẫn bấm hoặc cố tình ra lệnh giọng nói: *"Cho tôi tới Khu C8 coi đi"*.
**Xử lý (Frontend Check & Fallback):**
- Backend trả về intent định đi tới C8 `{"navigate_to": "khu-c8"}`.
- Frontend check mảng cấu hình `AVAILABLE_LOCATIONS` và thấy C8 đang `inactive`. Chặn ngay việc load Background.
- Avatar lắc đầu nhẹ.
- Audio phát: *"Tiếc quá, Khu C8 hiện vẫn đang được nâng cấp nên mình chưa thể đưa bạn tới đó được. Thay vào đó, mình đưa bạn sang Thư viện hoặc Khoa CNTT nha?"*

---

## 🔵 PHẦN 3: GIẢI PHÁP UI/UX CHO BẢN ĐỒ (MINIMAP)

### 3.1 Cơ chế 2 trạng thái: Thu nhỏ (Collapsed) ↔ Mở rộng (Expanded)

**Trạng thái Thu nhỏ (Collapsed - Mặc định):**
- Bản đồ nằm gọn ở **góc trên trái** màn hình, kích thước nhỏ (khoảng 120x120px).
- Chỉ hiển thị **1 chấm sáng tĩnh** đánh dấu vị trí hiện tại của người dùng. Không có hiệu ứng ping, không nhấp nháy liên tục.
- **Không thể tương tác với node** ở trạng thái này (quá nhỏ để bấm chính xác trên Kiosk cảm ứng).
- Chạm vào minimap → chuyển sang trạng thái Mở rộng.

**Trạng thái Mở rộng (Expanded - Overlay):**
- Bản đồ **zoom mượt** từ góc nhỏ ra thành overlay toàn màn hình (phía sau mờ nhẹ ảnh 360°).
- Lúc này các node hiển thị rõ ràng:
  - **Active Node:** Chấm tròn to, màu cam TVU, có **tên label** hiện rõ bên cạnh (VD: "Khoa CNTT"). Khi hover/chạm giữ thì phát sáng nhẹ (glow) 1 lần rồi dừng.
  - **Inactive Node:** Xám mờ 50%, kèm icon khoá 🔒. Chạm vào hiện tooltip *"Khu vực đang xây dựng"*.
  - **Vị trí hiện tại:** Chấm sáng có viền pulse nhẹ để phân biệt với các node khác.
- **Lần đầu mở map:** Chạy 1 lần duy nhất animation highlight lướt qua tất cả node active (giúp user nắm tổng quan), sau đó dừng hẳn.
- Chạm vào node active → trigger chuyển cảnh (Navigation). Chạm ra ngoài hoặc bấm nút ✕ → thu nhỏ minimap lại.

### 3.2 Phím tắt không cần mở Map
- Luôn gắn các nút **Location Chips** ở thanh Chat Bar (VD: `[Khoa CNTT]` `[Thư viện]`). Người dùng lười mở map vẫn có thể One-click điều hướng hoặc ra lệnh giọng nói.

### 3.3 Xử lý tải tài nguyên (Loading States)
- Khi đang tải ảnh 360° hoặc model Avatar (lần đầu hoặc khi chuyển cảnh), hiển thị **Loading overlay** với logo TVU + thanh progress.
- Nếu tải thất bại (mất mạng, R2 lỗi): Hiện thông báo thân thiện *"Mạng đang hơi chậm, bạn chờ mình một xíu nhé!"* kèm nút **Thử lại**.

---
*Ghi chú: Bản nháp 1.1 - Đã cập nhật UX bản đồ, loading states, first-time guidance.*
