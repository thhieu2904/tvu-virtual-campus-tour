# 🎓 TVU Virtual Campus Tour

Ứng dụng web tham quan ảo khuôn viên Đại học Trà Vinh với AI hướng dẫn viên, bản đồ tương tác, và môi trường 360°.

## 🏗️ Kiến trúc

```
tvu-virtual-campus-tour/
├── frontend/          # Next.js (TypeScript, App Router)
├── backend/           # FastAPI (Python, Layered Architecture)
├── plan/              # Tài liệu kế hoạch
└── README.md
```

### Backend — Layered Architecture

```
Router (HTTP) → Service (Business Logic) → Repository (Data Access) → DB
```

### API Style — RESTful

```
GET    /api/locations          # Danh sách địa điểm
GET    /api/locations/{slug}   # Chi tiết địa điểm
POST   /api/chat               # Hỏi đáp AI (SSE stream)
POST   /api/admin/ingest       # Upload tài liệu RAG
```

## 🚀 Quick Start

### Backend

```bash
cd backend
conda create -n tvu-tour python=3.11 -y
conda activate tvu-tour
pip install -r requirements.txt
cp .env.example .env         # Điền API keys
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local   # Điền API URL
npm run dev
```

## 🛠️ Tech Stack

| Component | Technology                                   |
| --------- | -------------------------------------------- |
| Frontend  | Next.js, TypeScript, Zustand, Three.js       |
| Backend   | FastAPI, SQLAlchemy, Pydantic                |
| Database  | Supabase PostgreSQL + pgvector               |
| Storage   | Cloudflare R2 (S3-compatible)                |
| AI        | Google Gemini Flash (Chat + TTS + Embedding) |
| Deploy    | Vercel (FE) + VPS Docker (BE)                |

## 📄 License

Private — Đại học Trà Vinh
