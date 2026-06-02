"""Remove analytics noise from chat_sessions.

By default this script only reports what would be deleted. Pass --execute to
delete rows. Use --include-cache-like to also remove legacy non-kiosk sessions
created by the old suggested-QA pre-cache script.
"""

import argparse
import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import delete, func, select

from app.db.database import async_session
from app.db.tables import ChatMessage, ChatSession


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Cleanup empty or cache-like chat sessions.")
    parser.add_argument("--execute", action="store_true", help="Actually delete matching sessions.")
    parser.add_argument(
        "--include-cache-like",
        action="store_true",
        help="Also delete legacy non-kiosk sessions that look like pre-cache artifacts.",
    )
    return parser.parse_args()


async def _count_sessions(session, *conditions) -> int:
    return (
        await session.execute(
            select(func.count(ChatSession.id)).where(*conditions),
        )
    ).scalar() or 0


async def _delete_sessions(session, *conditions) -> int:
    result = await session.execute(delete(ChatSession).where(*conditions))
    return int(result.rowcount or 0)


async def main() -> None:
    args = _parse_args()
    async with async_session() as session:
        has_messages = select(ChatMessage.id).where(ChatMessage.session_id == ChatSession.id).exists()
        empty_conditions = (
            ChatSession.message_count == 0,
            ~has_messages,
        )
        cache_like_conditions = (
            ChatSession.is_kiosk.is_(False),
            ChatSession.start_location_id.is_(None),
            ChatSession.device_info == "",
        )

        empty_count = await _count_sessions(session, *empty_conditions)
        cache_like_count = await _count_sessions(session, *cache_like_conditions)

        print(f"Empty sessions: {empty_count}")
        print(f"Legacy cache-like non-kiosk sessions: {cache_like_count}")

        if not args.execute:
            print("Dry run only. Re-run with --execute to delete.")
            return

        deleted_empty = await _delete_sessions(session, *empty_conditions)
        deleted_cache_like = 0
        if args.include_cache_like:
            deleted_cache_like = await _delete_sessions(session, *cache_like_conditions)

        await session.commit()
        print(f"Deleted empty sessions: {deleted_empty}")
        print(f"Deleted cache-like sessions: {deleted_cache_like}")


if __name__ == "__main__":
    asyncio.run(main())
