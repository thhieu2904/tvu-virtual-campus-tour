# 🎓 Mô tả Bài toán: TVU Virtual Campus Tour

**Phiên bản:** 1.0
**Ngày:** 2026-04-09

---

## Tổng quan

Ứng dụng web cho phép người dùng **tham quan ảo** khuôn viên Đại học Trà Vinh thông qua một hệ thống bản đồ tương tác, nhân vật 3D hướng dẫn viên AI, và môi trường 360°. Người dùng di chuyển giữa các địa điểm trong trường, hỏi đáp bằng giọng nói, và nhận thông tin tư vấn tuyển sinh dựa trên tài liệu thật của từng khu vực.

---

## Luồng trải nghiệm người dùng (User Journey)

### Màn 1: Bản đồ Campus (Start Screen)

```
┌──────────────────────────────────────────┐
│                                          │
│        🗺️ BẢN ĐỒ TRƯỜNG ĐH TRÀ VINH     │
│        (2D minh hoạ hoặc cắt từ map)     │
│                                          │
│     ⚫ KTX           ⚫ Thư viện         │
│                                          │
│           ✨ Sảnh Chính ✨                │
│           (chớp chớp, ping)              │
│                                          │
│     ⚫ Khoa CNTT      ◻️ Khu C7          │
│                       (chưa xây dựng)    │
│                                          │
│          ✨ Cổng Chính ✨                 │
│          (chớp chớp)                     │
│                                          │
│  ⚫ = Đã xây dựng    ◻️ = Chưa có dữ liệu│
└──────────────────────────────────────────┘
```

- Bản đồ 2D tổng quan khuôn viên TVU (minh hoạ đơn giản hoặc cắt từ Google Maps)
- Các **node** (chấm tròn) đặt tại vị trí tương ứng trên bản đồ
- **2 loại node:**
  - 🟢 **Active** (đã xây dựng): có dữ liệu, có ảnh 360°, click được → chuyển cảnh
  - ⬜ **Inactive** (chưa xây dựng): hiển thị nhưng click vào chỉ hiện "Sắp ra mắt"
- Node ưu tiên (Sảnh Chính / Cổng Chính) có **animation chớp chớp + ping** như game RPG để hướng dẫn user click vào
- Click vào node Active → **chuyển cảnh** (motion blur transition) → vào Màn 2

### Màn 2: Trải nghiệm 3D tại Địa điểm

```
┌──────────────────────────────────────────────────┐
│ ┌─────────┐                                      │
│ │ Minimap │              📍 Sảnh Chính TVU       │
│ └─────────┘                                      │
│                                                  │
│  ┌──────────────┐            ┌───────────────┐   │
│  │              │            │ 📺 Info Panel  │   │
│  │  🧍 Avatar   │            │               │   │
│  │  (bên trái) │            │ 🎬 Video giới  │   │
│  │              │            │    thiệu      │   │
│  │  Idle/Nói/   │            │ 💬 Chat log   │   │
│  │  Nghe/Nghĩ  │            │ 📋 Info text  │   │
│  └──────────────┘            └───────────────┘   │
│                                                  │
│            ──── Background 360° ────             │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │ [Khoa CNTT] [Thư viện]  💬 Nhập câu hỏi.. 🎤│  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

- **Background 360°** của địa điểm hiện tại
- **Nhân vật 3D** bên trái, có các trạng thái cử động (Idle / Nghe / Suy nghĩ / Nói)
- **Info Panel** (📺) bên phải — như màn hình tivi, có 3 chế độ:
  - 🎬 **Video:** Mặc định khi vào location — chiếu video giới thiệu từ bảng `media`
  - 📋 **Info:** Khi AI trả lời — hiện text/ảnh bổ sung, sources tham khảo
  - 💬 **Chat log:** User bấm toggle hoặc kéo lên — lịch sử chat scrollable
- **Mini-map** góc trên: bản đồ thu nhỏ, highlight vị trí hiện tại. **Click vào mini-map → phóng to thành bản đồ toàn màn hình** (quay về Màn 1) để chọn node khác.
- **Chat input bar** phía dưới: gợi ý câu hỏi (chips) + ô nhập text + nút mic
- **Zoom in/out** = thay đổi FOV camera (75° → 40° zoom in, 75° → 100° zoom out). Chỉ phóng to/thu nhỏ ảnh 360°.
- **Kéo xoay** chuột/vuốt tay để nhìn quanh 360°

### Điều hướng — 2 loại

**Type 1: Tham quan tại chỗ** (bên trong 1 location)
- Một location có thể có nhiều **sub-viewpoints** (góc nhìn 360° khác nhau)
- VD: Khoa CNTT → Cửa vào ← → Hành lang ← → Phòng Lab
- Mỗi viewpoint = 1 ảnh 360° riêng, có mũi tên đi tới/lui
- Scope demo: 1-2 viewpoint/location

**Type 2: Di chuyển giữa các location**
- Trigger bằng 3 cách:
  1. Click mini-map → phóng to → chọn node
  2. Hỏi AI: "Đưa mình tới Khoa CNTT" → AI gợi ý → đồng ý → chuyển
  3. Click nút chip gợi ý trên Chat Panel
- **Hiệu ứng chuyển cảnh:** Loading screen 2D animation
  ```
  ┌────────────────────────────────────┐
  │                                    │
  │    🗺️ Bản đồ 2D                    │
  │    (C7) ─ ─ ● ─ ─ → (Thư viện)    │
  │         chấm sáng chạy dọc đường   │
  │                                    │
  │    "Mình đưa bạn tới Thư viện!"    │
  │    ████████████░░░░  75%           │
  │                                    │
  └────────────────────────────────────┘
  ```
  - Hiện bản đồ + đường đi nét đứt + chấm sáng chạy
  - AI voiceover giới thiệu
  - Đồng thời preload ảnh 360° đích
  - Load xong → motion blur → vào scene mới → Avatar chào

---

## Vai trò của Sảnh Chính (Orchestrator Node)

Sảnh Chính là **node trung tâm** — "trạm trung chuyển" của toàn bộ tour:
- Đây là nơi user được hướng đến đầu tiên (ping trên bản đồ)
- Nhân vật AI ở Sảnh Chính nắm **thông tin tổng quan** về tất cả các khu vực
- Có thể hỏi: "Trường có mấy khoa?", "CNTT học ở đâu?" → AI trả lời + gợi ý điều hướng tới node tương ứng
- Các node khác (Khoa CNTT, Thư viện,...) chỉ nắm dữ liệu chuyên sâu của riêng node đó

---

## Tổ chức Dữ liệu theo Node

Mỗi node (địa điểm) là một đơn vị độc lập:

| Thuộc tính | Mô tả | Ví dụ |
|---|---|---|
| Thông tin cơ bản | Tên, mô tả, câu chào | "Khoa Công nghệ Thông tin" |
| Trạng thái | Active / Inactive | Active = có dữ liệu |
| Ảnh 360° | Background equirectangular | khoa-cntt-360.jpg |
| Tài liệu RAG | PDF/DOCX riêng của node | Chương trình đào tạo CNTT.pdf |
| Media | Hình ảnh, video minh hoạ | Ảnh phòng lab, video giới thiệu |
| Vị trí trên bản đồ | Toạ độ (x, y) trên ảnh map 2D | { x: 0.65, y: 0.40 } |
| Liên kết | Danh sách node có thể đi tới | ["sanh-chinh", "thu-vien"] |
| Model 3D (tương lai) | Nhân vật riêng cho node | Có thể khác nhau mỗi node |
| Gợi ý câu hỏi | Câu hỏi mẫu hiển thị khi đến | ["Khoa có mấy ngành?", "Học phí bao nhiêu?"] |

---

## Quy tắc nghiệp vụ

1. **Node Inactive:** Hiển thị trên bản đồ nhưng click vào chỉ hiện thông báo "Sắp ra mắt". Không chuyển cảnh.
2. **Node Active nhưng chưa có tài liệu:** Có ảnh 360° + nhân vật, nhưng AI chỉ trả lời thông tin cơ bản (từ description). Nếu hỏi chi tiết → "Hiện tại mình chưa có thông tin chi tiết về khu vực này."
3. **Sảnh Chính luôn Active** và là node mặc định (start node).
4. **Minimap luôn hiển thị** ở góc trên, highlight node hiện tại.
5. **Chuyển cảnh:** Motion blur transition, không cắt cảnh đột ngột.
6. **AI có thể điều hướng:** Khi user hỏi về một khu vực khác, AI gợi ý "Bạn có muốn mình đưa bạn tới Khoa CNTT không?" → User đồng ý → chuyển cảnh.
7. **AI điều khiển Info Panel:** AI tự chọn media (ảnh/video/GIF) phù hợp với câu trả lời → chiếu lên Info Panel. Match dựa trên `keywords` trong bảng `media`.
8. **Info Panel mặc định:** Khi vào location, tự chiếu media có `is_intro = true` (video/ảnh giới thiệu).

---

## Kiosk Mode (Hands-free)

Ứng dụng triển khai trên máy cảm ứng tại cơ quan → ưu tiên voice-first, giảm tối đa thao tác chạm:

```
Standby (screensaver nhẹ / logo TVU)
  → User chạm màn hình 1 lần → Bắt đầu session
  → AI chào bằng giọng nói + chiếu video mở đầu trên Info Panel
  → User NÓI câu hỏi (mic luôn sẵn sàng sau mỗi lần AI trả lời)
  → AI trả lời bằng GIỌNG + Info Panel cập nhật
  → Im lặng 3s → mic tự lắng nghe tiếp
  → Im lặng 30s → AI hỏi "Bạn còn muốn hỏi gì không?"
  → Im lặng 60s → Quay về standby
```

**Chạm duy nhất 1 lần** để bắt đầu. Có thể chạm thêm nếu muốn:
- Chips gợi ý câu hỏi (cho người ngại nói)
- Mini-map (chuyển location)
- Nút mic (bắt đầu nói thủ công)

---

## Scope Demo (2 tháng, 1 người)

### Làm ngay:
- 2 node Active: **Cổng Chính** + **Sảnh Chính**
- Bản đồ 2D với 2 node active + 2-3 node inactive (placeholder)
- Nhân vật 3D chung cho cả 2 node
- Voice In/Out (hands-free)
- Mini-map (click phóng to)
- Info Panel (video/ảnh/GIF + AI điều khiển)
- Kiosk mode (standby + auto-timeout)

### Để sau (mở rộng):
- Thêm node mới (mỗi Khoa 1 node)
- Model 3D riêng cho từng node
- Zoom walk-through thực sự (di chuyển camera trong 360°)

