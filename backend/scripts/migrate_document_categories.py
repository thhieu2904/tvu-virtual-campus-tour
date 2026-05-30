"""Create document categories and backfill existing documents.

Idempotent production migration for DEV_TASK_ADMIN_CATEGORIES.md.
"""

import asyncio
import re
import sys
from pathlib import Path

from sqlalchemy import text

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.db.database import async_session, engine  # noqa: E402


DEFAULT_CATEGORIES = [
    ("Tuyển sinh", "tuyen-sinh", "#ef4444", 1),
    ("Học bổng", "hoc-bong", "#f59e0b", 2),
    ("Đào tạo & Quy chế", "dao-tao", "#3b82f6", 3),
    ("Ngành học", "nganh-hoc", "#8b5cf6", 4),
    ("Cơ sở vật chất", "co-so-vat-chat", "#10b981", 5),
    ("Hoạt động & Sự kiện", "hoat-dong", "#ec4899", 6),
    ("Kiến thức chung", "khac", "#6b7280", 7),
]

CATEGORY_KEYWORDS = {
    "tuyen-sinh": [
        "tuyen sinh",
        "tuyensinh",
        "diem chuan",
        "diemchuan",
        "xet tuyen",
        "xettuyen",
        "nhap hoc",
        "nhaphoc",
        "hoc phi",
        "hocphi",
        "phuong thuc",
        "phuongthuc",
    ],
    "hoc-bong": ["hoc bong", "hocbong", "mien giam", "miengiam", "khuyen khich hoc tap", "tai tro"],
    "dao-tao": [
        "dao tao",
        "daotao",
        "quy che",
        "quyche",
        "kiem dinh",
        "kiemdinh",
        "chat luong",
        "chatluong",
        "chinh sach chat luong",
        "chinhsach",
        "mo hinh",
        "mohinh",
        "co-op",
    ],
    "nganh-hoc": ["nganh hoc", "nganhhoc", "danh muc nganh", "danhmuc", "chuong trinh", "ma nganh"],
    "co-so-vat-chat": [
        "co so vat chat",
        "campus",
        "thu vien",
        "thuvien",
        "ky tuc xa",
        "kytucxa",
        "benh vien",
        "benhvien",
        "ha tang",
        "hatang",
        "khuon vien",
        "khuonvien",
    ],
    "hoat-dong": [
        "nckh",
        "nghien cuu",
        "cong nghe",
        "hop tac",
        "hoptac",
        "quoc te",
        "quocte",
        "su kien",
        "sukien",
        "khoi nghiep",
        "khoinghiep",
    ],
}


def normalize(value: str) -> str:
    replacements = str.maketrans(
        {
            "ă": "a",
            "ắ": "a",
            "ằ": "a",
            "ẳ": "a",
            "ẵ": "a",
            "ặ": "a",
            "â": "a",
            "ấ": "a",
            "ầ": "a",
            "ẩ": "a",
            "ẫ": "a",
            "ậ": "a",
            "á": "a",
            "à": "a",
            "ả": "a",
            "ã": "a",
            "ạ": "a",
            "đ": "d",
            "ê": "e",
            "ế": "e",
            "ề": "e",
            "ể": "e",
            "ễ": "e",
            "ệ": "e",
            "é": "e",
            "è": "e",
            "ẻ": "e",
            "ẽ": "e",
            "ẹ": "e",
            "í": "i",
            "ì": "i",
            "ỉ": "i",
            "ĩ": "i",
            "ị": "i",
            "ô": "o",
            "ố": "o",
            "ồ": "o",
            "ổ": "o",
            "ỗ": "o",
            "ộ": "o",
            "ơ": "o",
            "ớ": "o",
            "ờ": "o",
            "ở": "o",
            "ỡ": "o",
            "ợ": "o",
            "ó": "o",
            "ò": "o",
            "ỏ": "o",
            "õ": "o",
            "ọ": "o",
            "ư": "u",
            "ứ": "u",
            "ừ": "u",
            "ử": "u",
            "ữ": "u",
            "ự": "u",
            "ú": "u",
            "ù": "u",
            "ủ": "u",
            "ũ": "u",
            "ụ": "u",
            "ý": "y",
            "ỳ": "y",
            "ỷ": "y",
            "ỹ": "y",
            "ỵ": "y",
        }
    )
    ascii_text = value.lower().translate(replacements)
    return re.sub(r"[^a-z0-9]+", " ", ascii_text)


def infer_category_slug(title: str, file_url: str) -> str:
    haystack = normalize(f"{title} {file_url}")
    compact_haystack = re.sub(r"[^a-z0-9]+", "", haystack)
    best_slug = "khac"
    best_score = 0
    for slug, keywords in CATEGORY_KEYWORDS.items():
        score = sum(
            1
            for keyword in keywords
            if keyword in haystack or re.sub(r"[^a-z0-9]+", "", keyword) in compact_haystack
        )
        if score > best_score:
            best_slug = slug
            best_score = score
    return best_slug


async def migrate_schema() -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS document_categories (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  name VARCHAR(100) NOT NULL,
                  slug VARCHAR(100) NOT NULL UNIQUE,
                  description TEXT NOT NULL DEFAULT '',
                  color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
                  sort_order INTEGER NOT NULL DEFAULT 0,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        await conn.execute(text("ALTER TABLE documents ADD COLUMN IF NOT EXISTS category_id UUID"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_documents_category_id ON documents(category_id)"))
        await conn.execute(
            text(
                """
                DO $$
                BEGIN
                  IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'documents_category_id_fkey'
                  ) THEN
                    ALTER TABLE documents
                    ADD CONSTRAINT documents_category_id_fkey
                    FOREIGN KEY (category_id)
                    REFERENCES document_categories(id)
                    ON DELETE SET NULL;
                  END IF;
                END $$;
                """
            )
        )
        for name, slug, color, sort_order in DEFAULT_CATEGORIES:
            await conn.execute(
                text(
                    """
                    INSERT INTO document_categories (name, slug, color, sort_order)
                    VALUES (:name, :slug, :color, :sort_order)
                    ON CONFLICT (slug) DO NOTHING
                    """
                ),
                {"name": name, "slug": slug, "color": color, "sort_order": sort_order},
            )


async def backfill_documents() -> None:
    async with async_session() as session:
        category_rows = await session.execute(text("SELECT id, slug FROM document_categories"))
        category_ids = {slug: category_id for category_id, slug in category_rows.all()}

        documents = await session.execute(
            text(
                """
                SELECT d.id, d.title, d.file_url, c.slug AS current_slug
                FROM documents d
                LEFT JOIN document_categories c ON d.category_id = c.id
                WHERE d.category_id IS NULL OR c.slug = 'khac'
                ORDER BY d.created_at ASC
                """
            )
        )
        updated = 0
        for doc_id, title, file_url, current_slug in documents.all():
            slug = infer_category_slug(title or "", file_url or "")
            if current_slug == slug:
                continue
            category_id = category_ids.get(slug) or category_ids.get("khac")
            if not category_id:
                continue
            await session.execute(
                text("UPDATE documents SET category_id = :category_id WHERE id = :doc_id"),
                {"category_id": category_id, "doc_id": doc_id},
            )
            print(f"  {title} -> {slug}")
            updated += 1
        await session.commit()
        print(f"Backfilled {updated} uncategorized documents")


async def verify() -> None:
    async with async_session() as session:
        rows = await session.execute(
            text(
                """
                SELECT c.slug, c.name, COUNT(d.id) AS document_count
                FROM document_categories c
                LEFT JOIN documents d ON d.category_id = c.id
                GROUP BY c.id, c.slug, c.name, c.sort_order
                ORDER BY c.sort_order
                """
            )
        )
        print("\nCategory counts:")
        for slug, name, count in rows.all():
            print(f"  {slug:16} {count:3}  {name}")

        uncategorized = (
            await session.execute(text("SELECT COUNT(*) FROM documents WHERE category_id IS NULL"))
        ).scalar()
        print(f"  {'uncategorized':16} {uncategorized:3}  Uncategorized")


async def main() -> None:
    print("Creating document category schema...")
    await migrate_schema()
    print("Backfilling existing documents...")
    await backfill_documents()
    await verify()


if __name__ == "__main__":
    asyncio.run(main())
