"""Repository helpers for Admin document category management."""

import re
import unicodedata
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.tables import Document, DocumentCategory
from app.schemas.admin import DocumentCategoryCreateRequest, DocumentCategoryUpdateRequest


def _slugify(value: str) -> str:
    value = value.replace("Đ", "D").replace("đ", "d")
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    return slug or "category"


def serialize_category(category: DocumentCategory, document_count: int | None = None) -> dict:
    return {
        "id": str(category.id),
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
        "color": category.color,
        "sort_order": category.sort_order,
        "document_count": int(document_count or 0),
        "created_at": category.created_at.isoformat() if category.created_at else None,
    }


async def list_categories(session: AsyncSession) -> list[dict]:
    result = await session.execute(
        select(DocumentCategory, func.count(Document.id).label("document_count"))
        .outerjoin(Document, Document.category_id == DocumentCategory.id)
        .group_by(DocumentCategory.id)
        .order_by(DocumentCategory.sort_order, DocumentCategory.name)
    )
    return [serialize_category(category, document_count) for category, document_count in result.all()]


async def get_by_id(session: AsyncSession, category_id: UUID) -> DocumentCategory | None:
    return await session.get(DocumentCategory, category_id)


async def get_by_slug(session: AsyncSession, slug: str) -> DocumentCategory | None:
    result = await session.execute(select(DocumentCategory).where(DocumentCategory.slug == slug))
    return result.scalar_one_or_none()


async def create_category(session: AsyncSession, payload: DocumentCategoryCreateRequest) -> DocumentCategory:
    slug = payload.slug or _slugify(payload.name)
    if await get_by_slug(session, slug):
        raise ValueError("Category slug already exists")

    category = DocumentCategory(
        name=payload.name.strip(),
        slug=slug,
        description=payload.description.strip(),
        color=payload.color,
        sort_order=payload.sort_order,
    )
    session.add(category)
    await session.flush()
    return category


async def update_category(
    session: AsyncSession,
    category: DocumentCategory,
    payload: DocumentCategoryUpdateRequest,
) -> DocumentCategory:
    fields = payload.model_dump(exclude_unset=True)
    if "slug" in fields and fields["slug"]:
        existing = await get_by_slug(session, fields["slug"])
        if existing and existing.id != category.id:
            raise ValueError("Category slug already exists")

    for field, value in fields.items():
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
        setattr(category, field, value)

    await session.flush()
    return category


async def delete_category(session: AsyncSession, category: DocumentCategory) -> None:
    await session.execute(
        update(Document)
        .where(Document.category_id == category.id)
        .values(category_id=None)
    )
    await session.delete(category)
    await session.flush()
