"""Repository helpers for Admin location management."""

from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.tables import Document, Location, LocationLink, Mascot, Media, SuggestedQuestion
from app.schemas.admin import (
    LocationLinksUpdateRequest,
    LocationQuestionsUpdateRequest,
    LocationUpdateRequest,
    SuggestedQuestionInput,
)


def serialize_location(
    loc: Location,
    *,
    doc_count: int = 0,
    media_count: int = 0,
    question_count: int | None = None,
    link_count: int | None = None,
    mascot_name: str | None = None,
) -> dict:
    return {
        "id": str(loc.id),
        "name": loc.name,
        "slug": loc.slug,
        "description": loc.description,
        "intro_message": loc.intro_message,
        "intro_audio_url": loc.intro_audio_url,
        "status": loc.status,
        "is_start_node": loc.is_start_node,
        "background_url": loc.background_url,
        "mascot_id": str(loc.mascot_id) if loc.mascot_id else None,
        "mascot_name": mascot_name or (loc.mascot.name if loc.mascot else None),
        "sort_order": loc.sort_order,
        "camera_config": loc.camera_config or {},
        "doc_count": doc_count,
        "document_count": doc_count,
        "media_count": media_count,
        "question_count": question_count,
        "link_count": link_count,
        "updated_at": loc.updated_at.isoformat() if loc.updated_at else None,
    }


async def list_location_summaries(session: AsyncSession) -> list[dict]:
    doc_count_sq = (
        select(Document.location_id, func.count(Document.id).label("doc_count"))
        .group_by(Document.location_id)
        .subquery()
    )
    media_count_sq = (
        select(Media.location_id, func.count(Media.id).label("media_count"))
        .group_by(Media.location_id)
        .subquery()
    )
    question_count_sq = (
        select(SuggestedQuestion.location_id, func.count(SuggestedQuestion.id).label("question_count"))
        .group_by(SuggestedQuestion.location_id)
        .subquery()
    )
    link_count_sq = (
        select(LocationLink.from_location_id, func.count(LocationLink.id).label("link_count"))
        .group_by(LocationLink.from_location_id)
        .subquery()
    )

    stmt = (
        select(
            Location,
            Mascot.name.label("mascot_name"),
            func.coalesce(doc_count_sq.c.doc_count, 0).label("doc_count"),
            func.coalesce(media_count_sq.c.media_count, 0).label("media_count"),
            func.coalesce(question_count_sq.c.question_count, 0).label("question_count"),
            func.coalesce(link_count_sq.c.link_count, 0).label("link_count"),
        )
        .outerjoin(Mascot, Location.mascot_id == Mascot.id)
        .outerjoin(doc_count_sq, Location.id == doc_count_sq.c.location_id)
        .outerjoin(media_count_sq, Location.id == media_count_sq.c.location_id)
        .outerjoin(question_count_sq, Location.id == question_count_sq.c.location_id)
        .outerjoin(link_count_sq, Location.id == link_count_sq.c.from_location_id)
        .order_by(Location.sort_order, Location.name)
    )

    result = await session.execute(stmt)
    return [
        serialize_location(
            loc,
            mascot_name=mascot_name,
            doc_count=doc_count,
            media_count=media_count,
            question_count=question_count,
            link_count=link_count,
        )
        for loc, mascot_name, doc_count, media_count, question_count, link_count in result.all()
    ]


async def get_location_detail(session: AsyncSession, location_id: UUID) -> dict | None:
    result = await session.execute(
        select(Location)
        .where(Location.id == location_id)
        .options(selectinload(Location.suggested_questions), selectinload(Location.mascot))
    )
    loc = result.scalar_one_or_none()
    if not loc:
        return None

    link_rows = await session.execute(
        select(LocationLink, Location.name.label("to_location_name"), Location.slug.label("to_location_slug"))
        .join(Location, LocationLink.to_location_id == Location.id)
        .where(LocationLink.from_location_id == loc.id)
        .order_by(LocationLink.label)
    )
    data = serialize_location(loc)
    data["suggested_questions"] = [
        {"id": str(q.id), "question": q.question, "sort_order": q.sort_order}
        for q in sorted(loc.suggested_questions, key=lambda q: q.sort_order)
    ]
    data["links"] = [
        {
            "id": str(link.id),
            "to_location_id": str(link.to_location_id),
            "to_location_name": to_location_name,
            "to_location_slug": to_location_slug,
            "label": link.label,
        }
        for link, to_location_name, to_location_slug in link_rows.all()
    ]
    return data


async def update_location(session: AsyncSession, loc: Location, payload: LocationUpdateRequest) -> Location:
    fields = payload.model_dump(exclude_unset=True)
    if fields.get("is_start_node") is True:
        other_start_nodes = await session.execute(
            select(Location).where(Location.id != loc.id, Location.is_start_node.is_(True))
        )
        for other in other_start_nodes.scalars().all():
            other.is_start_node = False

    for field, value in fields.items():
        if field == "mascot_id":
            setattr(loc, field, UUID(value) if value else None)
        else:
            setattr(loc, field, value)
    await session.flush()
    return loc


async def replace_questions(
    session: AsyncSession,
    loc: Location,
    payload: LocationQuestionsUpdateRequest,
) -> list[SuggestedQuestion]:
    await session.execute(delete(SuggestedQuestion).where(SuggestedQuestion.location_id == loc.id))

    questions: list[SuggestedQuestion] = []
    for idx, item in enumerate(payload.questions):
        if isinstance(item, SuggestedQuestionInput):
            question_text = item.question.strip()
            sort_order = item.sort_order if item.sort_order is not None else idx
        else:
            question_text = item.strip()
            sort_order = idx

        if not question_text:
            continue
        question = SuggestedQuestion(location_id=loc.id, question=question_text, sort_order=sort_order)
        session.add(question)
        questions.append(question)

    await session.flush()
    return questions


async def replace_links(
    session: AsyncSession,
    loc: Location,
    payload: LocationLinksUpdateRequest,
) -> list[LocationLink]:
    await session.execute(delete(LocationLink).where(LocationLink.from_location_id == loc.id))

    links: list[LocationLink] = []
    for item in payload.links:
        to_location_id = UUID(item.to_location_id)
        if to_location_id == loc.id:
            continue
        target_exists = await session.execute(select(Location.id).where(Location.id == to_location_id))
        if not target_exists.scalar_one_or_none():
            raise ValueError(f"Target location not found: {to_location_id}")
        link = LocationLink(
            from_location_id=loc.id,
            to_location_id=to_location_id,
            label=item.label.strip(),
        )
        session.add(link)
        links.append(link)

    await session.flush()
    return links
