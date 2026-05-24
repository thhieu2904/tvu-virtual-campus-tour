"""Analytics queries for the Admin dashboard."""

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.tables import ChatMessage, ChatSession, Document, Location, Mascot, Media


async def get_dashboard_stats(session: AsyncSession) -> dict:
    total_locations = (await session.execute(select(func.count(Location.id)))).scalar() or 0
    active_locations = (
        await session.execute(select(func.count(Location.id)).where(Location.status == "active"))
    ).scalar() or 0
    total_documents = (await session.execute(select(func.count(Document.id)))).scalar() or 0
    ready_documents = (
        await session.execute(select(func.count(Document.id)).where(Document.status == "ready"))
    ).scalar() or 0
    total_media = (await session.execute(select(func.count(Media.id)))).scalar() or 0
    total_mascots = (await session.execute(select(func.count(Mascot.id)))).scalar() or 0
    total_sessions = (await session.execute(select(func.count(ChatSession.id)))).scalar() or 0
    total_messages = (await session.execute(select(func.count(ChatMessage.id)))).scalar() or 0
    avg_response_time_ms = (
        await session.execute(select(func.avg(ChatMessage.response_time_ms)).where(ChatMessage.response_time_ms.is_not(None)))
    ).scalar()

    sessions_by_day_rows = await session.execute(
        select(func.date(ChatSession.started_at).label("date"), func.count(ChatSession.id).label("count"))
        .group_by(func.date(ChatSession.started_at))
        .order_by(func.date(ChatSession.started_at).desc())
        .limit(14)
    )
    top_questions_rows = await session.execute(
        select(ChatMessage.content.label("question"), func.count(ChatMessage.id).label("count"))
        .where(ChatMessage.role == "user")
        .group_by(ChatMessage.content)
        .order_by(desc("count"))
        .limit(10)
    )
    popular_locations_rows = await session.execute(
        select(Location.name, func.count(ChatMessage.id).label("visit_count"))
        .join(ChatMessage, ChatMessage.location_id == Location.id)
        .group_by(Location.id, Location.name)
        .order_by(desc("visit_count"))
        .limit(10)
    )

    return {
        "locations": {"total": total_locations, "active": active_locations},
        "documents": {"total": total_documents, "ready": ready_documents},
        "media": {"total": total_media},
        "mascots": {"total": total_mascots},
        "total_sessions": total_sessions,
        "total_messages": total_messages,
        "avg_response_time_ms": round(float(avg_response_time_ms or 0), 2),
        "sessions_by_day": [
            {"date": day.isoformat() if day else None, "count": count}
            for day, count in reversed(sessions_by_day_rows.all())
        ],
        "top_questions": [
            {"question": question, "count": count}
            for question, count in top_questions_rows.all()
        ],
        "popular_locations": [
            {"name": name, "visit_count": visit_count}
            for name, visit_count in popular_locations_rows.all()
        ],
    }

