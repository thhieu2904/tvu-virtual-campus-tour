"""Analytics queries for the Admin dashboard."""

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.tables import ChatMessage, ChatSession, Document, DocumentCategory, Location, Mascot, Media


def _parse_cursor(value: str | None) -> date:
    if not value:
        return datetime.now(timezone.utc).date()
    try:
        return date.fromisoformat(value)
    except ValueError:
        return datetime.now(timezone.utc).date()


def _range_for(period: str, cursor: str | None) -> tuple[str, date, date]:
    normalized = "month" if period == "month" else "week"
    current = _parse_cursor(cursor)

    if normalized == "month":
        start = current.replace(day=1)
        end = date(start.year + 1, 1, 1) if start.month == 12 else date(start.year, start.month + 1, 1)
        return normalized, start, end

    start = current - timedelta(days=current.weekday())
    return normalized, start, start + timedelta(days=7)


def _as_utc_start(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _date_key(value: object) -> str:
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


async def get_dashboard_stats(session: AsyncSession, period: str = "week", cursor: str | None = None) -> dict:
    period, range_start, range_end = _range_for(period, cursor)
    range_start_dt = _as_utc_start(range_start)
    range_end_dt = _as_utc_start(range_end)

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

    started_sessions = (
        await session.execute(select(func.count(ChatSession.id)).where(ChatSession.is_kiosk.is_(True)))
    ).scalar() or 0
    engaged_sessions = (
        await session.execute(
            select(func.count(ChatSession.id)).where(
                ChatSession.is_kiosk.is_(True),
                ChatSession.message_count > 0,
            )
        )
    ).scalar() or 0
    empty_sessions = max(started_sessions - engaged_sessions, 0)
    latest_engaged_session_at = (
        await session.execute(
            select(func.max(ChatSession.started_at)).where(
                ChatSession.is_kiosk.is_(True),
                ChatSession.message_count > 0,
            )
        )
    ).scalar()

    total_messages = (await session.execute(select(func.count(ChatMessage.id)))).scalar() or 0
    user_messages = (
        await session.execute(select(func.count(ChatMessage.id)).where(ChatMessage.role == "user"))
    ).scalar() or 0
    avg_response_time_ms = (
        await session.execute(select(func.avg(ChatMessage.response_time_ms)).where(ChatMessage.response_time_ms.is_not(None)))
    ).scalar()

    sessions_by_day_rows = await session.execute(
        select(func.date(ChatSession.started_at).label("date"), func.count(ChatSession.id).label("count"))
        .where(
            ChatSession.is_kiosk.is_(True),
            ChatSession.message_count > 0,
            ChatSession.started_at >= range_start_dt,
            ChatSession.started_at < range_end_dt,
        )
        .group_by(func.date(ChatSession.started_at))
        .order_by(func.date(ChatSession.started_at))
    )
    sessions_by_date = {_date_key(day): count for day, count in sessions_by_day_rows.all()}

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
        .where(ChatMessage.role == "user")
        .group_by(Location.id, Location.name)
        .order_by(desc("visit_count"))
        .limit(10)
    )
    category_rows = await session.execute(
        select(
            DocumentCategory.name,
            DocumentCategory.color,
            func.count(Document.id).label("count"),
        )
        .outerjoin(Document, Document.category_id == DocumentCategory.id)
        .group_by(DocumentCategory.id, DocumentCategory.name, DocumentCategory.color, DocumentCategory.sort_order)
        .order_by(DocumentCategory.sort_order, DocumentCategory.name)
    )
    uncategorized_count = (
        await session.execute(select(func.count(Document.id)).where(Document.category_id.is_(None)))
    ).scalar() or 0

    return {
        "locations": {"total": total_locations, "active": active_locations},
        "documents": {"total": total_documents, "ready": ready_documents},
        "media": {"total": total_media},
        "mascots": {"total": total_mascots},
        "total_sessions": engaged_sessions,
        "engaged_sessions": engaged_sessions,
        "started_sessions": started_sessions,
        "empty_sessions": empty_sessions,
        "total_messages": total_messages,
        "user_messages": user_messages,
        "avg_response_time_ms": round(float(avg_response_time_ms or 0), 2),
        "stats_period": {
            "period": period,
            "start": range_start.isoformat(),
            "end": (range_end - timedelta(days=1)).isoformat(),
            "cursor": range_start.isoformat(),
        },
        "latest_engaged_session_date": latest_engaged_session_at.date().isoformat()
        if latest_engaged_session_at
        else None,
        "sessions_by_day": [
            {
                "date": (range_start + timedelta(days=offset)).isoformat(),
                "count": sessions_by_date.get((range_start + timedelta(days=offset)).isoformat(), 0),
            }
            for offset in range((range_end - range_start).days)
        ],
        "top_questions": [
            {"question": question, "count": count}
            for question, count in top_questions_rows.all()
        ],
        "popular_locations": [
            {"name": name, "visit_count": visit_count}
            for name, visit_count in popular_locations_rows.all()
        ],
        "documents_by_category": [
            {"category_name": name, "color": color, "count": count}
            for name, color, count in category_rows.all()
        ]
        + (
            [{"category_name": "Uncategorized", "color": "#6b7280", "count": uncategorized_count}]
            if uncategorized_count
            else []
        ),
    }
