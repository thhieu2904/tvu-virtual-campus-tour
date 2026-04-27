# 🗺️ Hệ thống Bản đồ & Dẫn đường A* — TVU Virtual Campus Tour

> **Cập nhật lần cuối:** 2026-04-26
> **Trạng thái:** ✅ A* hoạt động, 6/6 đường tìm thành công, Frontend demo sẵn sàng

---

## 1. Tổng quan kiến trúc

Hệ thống dẫn đường được thiết kế theo mô hình **RPG Tile-based Map** với nguyên tắc:

- **JSON là Single Source of Truth** cho mọi dữ liệu không gian (grid, toạ độ tòa nhà)
- **Database (Supabase)** chỉ chứa nội dung text/media (tên, mô tả, ảnh 360°, chat...)
- **Backend** chạy thuật toán A* pre-compute, Frontend chỉ render kết quả

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA FLOW                                │
│                                                             │
│  map_grid.json ──→ precompute_paths.py (A*) ──→ paths.json │
│       ↑                    ↑                        ↓      │
│   AI Vision Tool     DB (slugs only)         Frontend SVG   │
│   (tạo grid)        (location links)       (polyline render)│
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Cấu trúc thư mục

```
backend/
├── data/
│   ├── map_grid.json          ← Grid 100x100 + toạ độ tòa nhà (Single Truth)
│   └── paths.json             ← Kết quả A* pre-computed (waypoints cho Frontend)
├── scripts/
│   ├── generate_grid.py       ← Tool tạo grid từ ảnh (dùng PIL, ít dùng)
│   ├── precompute_paths.py    ← Chạy A* tính đường đi, xuất paths.json
│   ├── sync_map_locations.py  ← Map DB slugs → building codes trong JSON
│   └── convert_map_format.py  ← Chuyển đổi format JSON (one-time)
├── app/
│   └── db/tables.py           ← ORM (ĐÃ XOÁ map_x, map_y, path_points)
│
assets/map/
├── bản đồ v3.png              ← Ảnh gốc bản đồ (vuông, crop sát campus)
└── map_grid_100x100_preview.png  ← Ảnh pixel hoá debug grid

frontend/
├── public/map_v3.png          ← Ảnh bản đồ phục vụ render
└── src/app/map-demo/
    ├── page.tsx               ← Demo trực quan hoá A* pathfinding
    ├── page.module.css
    └── paths.json             ← Copy từ backend/data/paths.json
```

---

## 3. Format JSON: `map_grid.json`

```json
{
  "rows": 100,
  "cols": 100,
  "legend": {
    "0": "Đường đi (road)",
    "1": "Vật cản (cỏ, cây)",
    "2": "Tòa nhà (building)"
  },
  "locations": {
    "b7":         { "x": 65, "y": 19 },
    "d5":         { "x": 37, "y": 30 },
    "c7":         { "x": 23, "y": 61 },
    "cong-chinh": { "x": 66, "y": 91 },
    "khoa-cntt":  { "x": 23, "y": 61 },
    "thu-vien":   { "x": 65, "y": 19 }
  },
  "grid": [[0, 0, 1, 2, ...], ...]
}
```

### Quy ước:
- **`grid[y][x]`** — hàng y, cột x (top-left = origin)
- **`0`** = đường đi (A* có thể đi qua)
- **`1`** = cỏ/cây/vật cản (không đi được)
- **`2`** = tòa nhà (không đi được, nhưng phân biệt với cỏ cho mục đích hiển thị)
- **`locations`** chứa cả mã tòa nhà gốc (`b7`, `c7`...) lẫn DB slugs (`thu-vien`, `khoa-cntt`...)
- Toạ độ `x`, `y` là **grid coordinates (0-99)**, KHÔNG phải phần trăm

### Mapping tòa nhà ↔ DB slug:
| DB Slug | Building Code | Tòa nhà thực tế |
|---------|--------------|------------------|
| `cong-chinh` | `cong-chinh` | Cổng chính TVU |
| `thu-vien` | `b7` | Thư viện TVU (tòa B7) |
| `khoa-cntt` | `c7` | Khoa CNTT (tòa C7) |

---

## 4. Thuật toán A* (`precompute_paths.py`)

### Cách hoạt động:
1. Đọc `map_grid.json` → lấy grid + locations
2. Kết nối DB → lấy tất cả `LocationLink` (from → to)
3. Với mỗi link, tra slug trong JSON locations → lấy toạ độ grid
4. Nếu điểm xuất phát/đích nằm trên ô không walkable (1 hoặc 2) → BFS tìm ô walkable gần nhất
5. Chạy A* với Manhattan heuristic (chỉ đi 4 hướng: lên/xuống/trái/phải)
6. Simplify path: loại bỏ các điểm thẳng hàng, chỉ giữ waypoints (chỗ rẽ)
7. Chuyển đổi grid coords → phần trăm (0-100%) cho SVG frontend
8. Xuất ra `paths.json`

### Chạy script:
```bash
conda run -n tvu-tour python scripts/precompute_paths.py
```

### Output (`paths.json`):
```json
{
  "cong-chinh_to_thu-vien": [
    {"x": 66.0, "y": 91.0},
    {"x": 66.0, "y": 68.0},
    {"x": 65.0, "y": 68.0},
    {"x": 65.0, "y": 19.0}
  ],
  "khoa-cntt_to_cong-chinh": [...]
}
```

### Kết quả hiện tại (6/6 thành công):
| Đường đi | Waypoints | Trạng thái |
|----------|-----------|------------|
| Cổng chính → Thư viện (B7) | 4 | ✅ |
| Cổng chính → Khoa CNTT (C7) | 9 | ✅ |
| Thư viện → Cổng chính | 3 | ✅ |
| Thư viện → Khoa CNTT | 21 | ✅ |
| Khoa CNTT → Cổng chính | 13 | ✅ |
| Khoa CNTT → Thư viện | 20 | ✅ |

---

## 5. Quyết định kiến trúc đã chốt

### ✅ JSON là Single Truth cho dữ liệu bản đồ
- **Lý do:** Tách biệt dữ liệu không gian khỏi DB, dễ version control, dễ debug
- **Hệ quả:** Đã XOÁ `map_x`, `map_y` khỏi bảng `locations` và `path_points` khỏi bảng `location_links` trong DB

### ✅ Grid 100x100 từ ảnh vuông (v3, crop sát campus)
- **Lý do:** Tối đa resolution cho đường đi bên trong campus
- **Bản đồ rộng (có sông, đường bao):** Đẹp hơn cho hiển thị, nhưng KHÔNG dùng cho grid vì lãng phí ~20-30% ô cho khu vực ngoài campus
- **Giải pháp:** Dùng ảnh rộng làm nền nếu muốn, nhưng grid vẫn từ ảnh vuông

### ✅ AI Vision tạo grid, không dùng script Python
- **Script `generate_grid.py`:** Bóc tách màu sắc từ ảnh, chỉ phân biệt được đường/không-đường (0/1)
- **AI Vision (ChatGPT/Gemini):** Nhận diện được cả tên tòa nhà, tạo grid 3 giá trị (0/1/2), xuất toạ độ `triggers/locations`
- **Kết luận:** Dùng AI Vision cho kết quả tốt hơn nhiều. File `map_grid_100x100.json` do AI tạo là file đang dùng chính thức

### ✅ Backend pre-compute, Frontend chỉ render
- Frontend KHÔNG chạy A*, KHÔNG đọc grid
- Frontend chỉ nhận `paths.json` (mảng toạ độ %) → vẽ `<polyline>` SVG
- Đảm bảo zero runtime latency trên giao diện Kiosk

### ✅ Cấu trúc thư mục Monolith
- `backend/data/` — dữ liệu tĩnh (grid, paths)
- `backend/scripts/` — CLI tools (generate, precompute, sync)
- `.prettierignore` — bỏ qua `map_grid.json` (tránh Prettier format lại)

---

## 6. Database Schema (sau khi dọn dẹp)

### Bảng `locations` — ĐÃ XOÁ `map_x`, `map_y`
```
id | name | slug | description | intro_message | status | is_start_node | 
background_url | camera_config | avatar_model_url | voice_config | sort_order
```

### Bảng `location_links` — ĐÃ XOÁ `path_points`
```
id | from_location_id | to_location_id | label
```

> Toạ độ bản đồ giờ nằm trong `map_grid.json`, đường đi nằm trong `paths.json`

---

## 7. VS Code Tasks (`.vscode/tasks.json`)

| Phím tắt | Task | Mô tả |
|----------|------|--------|
| `Ctrl+Shift+B` | ⚡ Start All | Backend + Frontend song song |
| | 🚀 Backend | FastAPI (uvicorn --reload) |
| | 🌐 Frontend | Next.js dev |
| | 🗺️ Generate Grid | Tạo grid từ ảnh |
| | 🧭 Precompute Paths | Chạy A* |

---

## 8. Frontend Demo (`/map-demo`)

- **URL:** `http://localhost:3000/map-demo`
- **Tính năng:**
  - Hiển thị bản đồ v3 làm nền
  - 3 location markers (Cổng chính, Thư viện, Khoa CNTT)
  - Nút "Hiện tất cả đường" — vẽ 6 polyline đồng thời
  - Click từng nút đường đi → animation vẽ đường đỏ từ A → B
  - Waypoints được convert từ grid coords (0-99) → % (0-100) cho SVG viewBox

---

## 9. Quy trình khi thêm địa điểm mới

1. **Thêm location vào DB** (bảng `locations` + `location_links`)
2. **Thêm toạ độ vào `map_grid.json`** → mục `locations` (có thể cần sửa grid nếu đường bị đứt)
3. **Chạy sync:** `python scripts/sync_map_locations.py` (nếu dùng mapping slug → building code)
4. **Chạy A*:** `python scripts/precompute_paths.py` → tự động tính đường mới
5. **Copy paths.json vào frontend** (hoặc serve qua API)

---

## 10. Vấn đề đã biết & cách khắc phục

| Vấn đề | Nguyên nhân | Cách sửa |
|--------|-------------|----------|
| "No path found" cho một đường | Toạ độ location nằm trên ô building (2) hoặc đường bị đứt gãy trên grid | Sửa toạ độ trong `map_grid.json` hoặc tô lại ô trên grid |
| PgBouncer prepared statement error | Supabase Transaction Pooler không hỗ trợ prepared statements | Đã fix: batch load ALL data trong 2 queries thay vì N+1 |
| Prettier tự format `map_grid.json` | File JSON lớn bị Prettier đổi format | Đã thêm vào `.prettierignore` |
| Bản đồ rộng (có sông) vs vuông | Bản rộng đẹp hơn nhưng grid resolution thấp hơn | Giữ grid từ ảnh vuông, dùng ảnh rộng làm nền nếu muốn |

---

## 11. File gốc quan trọng

| File | Vị trí | Mục đích |
|------|--------|----------|
| Ảnh bản đồ v3 (vuông) | `assets/map/bản đồ v3.png` | Ảnh gốc cho grid extraction |
| Grid preview | `assets/map/map_grid_100x100_preview.png` | Debug: xem grid pixel hoá |
| Grid JSON (AI tạo) | `map_grid_100x100.json` (root) | File gốc do AI Vision tạo |
| Grid JSON (production) | `backend/data/map_grid.json` | Copy có thêm DB slugs |
| Paths computed | `backend/data/paths.json` | Output của A* |
| Ảnh render frontend | `frontend/public/map_v3.png` | Copy cho Next.js serve |
