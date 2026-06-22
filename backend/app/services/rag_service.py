"""
RAG Service — Orchestrates the Retrieval-Augmented Generation pipeline.
Layer 2 (Business Logic): embed query → vector search → build prompt → call LLM.

Phase 1: Simple RAG — vector search + Gemini text response (no Function Calling).
Phase 2 (current): Function Calling — Gemini can invoke tools (navigate, show_media, etc.)
                    Uses "Collect-then-Decide" pattern for streaming.
"""

import logging
import re
import time
from difflib import get_close_matches
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.ai.chat_engine import generate_response
from app.ai.embedding_engine import embed_query
from app.ai.tools import AGENT_TOOLS
from app.cache import slug_cache, vector_search_cache
from app.db.tables import ChatMessage, ChatSession, Location
from app.repositories import media_repo, vector_repo
from app.schemas.chat import TOOL_ACTION_ADAPTER

logger = logging.getLogger(__name__)

# Search tool names — these require RAG round 2
_SEARCH_TOOLS = {"search_documents"}
# UI tool names — these are forwarded directly to frontend
_UI_TOOLS = {"navigate_to", "show_media", "toggle_map"}
_PSEUDO_TOOL_CALL_RE = re.compile(
    r"(?:default_api\.)?(navigate_to|show_media|toggle_map)\s*\(([^)]*)\)",
    re.IGNORECASE,
)
_PSEUDO_TOOL_ARG_RE = re.compile(
    r"([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(['\"])(.*?)\2",
    re.DOTALL,
)
_PSEUDO_TOOL_MARKER_RE = re.compile(r"(?im)^\s*tool_code\s*$")
_PSEUDO_THOUGHT_MARKER_RE = re.compile(r"(?im)^\s*thought\s*$")
_NAVIGATE_MAIN_INTENT_RE = re.compile(
    r"\b(?:đưa|dẫn|quay|về|lại|đi)\b.*\b(?:sảnh|cổng\s+chính)\b",
    re.IGNORECASE,
)


def recover_pseudo_tool_actions(text: str | None) -> tuple[str, list[dict]]:
    """Recover known UI tools emitted as text without evaluating model output."""
    raw_text = str(text or "")
    recovered: list[dict] = []

    for match in _PSEUDO_TOOL_CALL_RE.finditer(raw_text):
        name = match.group(1).lower()
        args = {
            key: value
            for key, _, value in _PSEUDO_TOOL_ARG_RE.findall(match.group(2))
        }
        recovered.append({"name": name, "args": args})

    if not recovered:
        return raw_text.strip(), []

    marker = _PSEUDO_TOOL_MARKER_RE.search(raw_text)
    if marker:
        prefix = raw_text[: marker.start()].strip()
        remainder = raw_text[marker.end() :]
        thought_marker = _PSEUDO_THOUGHT_MARKER_RE.search(remainder)
        if thought_marker:
            # Never expose model reasoning. A safe user-facing sentence is generated
            # later if no clean prefix remains.
            remainder = remainder[: thought_marker.start()]
        cleaned_lines = [
            line
            for line in remainder.splitlines()
            if not _PSEUDO_TOOL_CALL_RE.search(line)
            and line.strip() not in {"```", "python"}
        ]
        cleaned = "\n".join(part for part in [prefix, *cleaned_lines] if part).strip()
    else:
        cleaned = _PSEUDO_TOOL_CALL_RE.sub("", raw_text)
        cleaned = re.sub(r"(?m)^\s*print\(\s*\)\s*$", "", cleaned).strip()

    logger.warning(
        "Recovered pseudo UI tool calls from model text tools=%s",
        [action["name"] for action in recovered],
    )
    return cleaned, recovered


async def apply_navigation_fallback(
    session: AsyncSession,
    message: str,
    tool_actions: list[dict],
) -> tuple[list[dict], bool]:
    """Resolve the kiosk's common "return to the main hall" intent deterministically."""
    if tool_actions or not _NAVIGATE_MAIN_INTENT_RE.search(message):
        return tool_actions, False

    result = await session.execute(
        select(Location.slug).where(
            Location.status == "active",
            Location.is_start_node.is_(True),
        )
    )
    start_slug = result.scalar_one_or_none()
    if not start_slug:
        logger.warning("Navigation fallback found no active start location")
        return tool_actions, False

    logger.info(
        "Applied deterministic main-hall navigation fallback slug=%s message=%r",
        start_slug,
        message,
    )
    return [
        {
            "name": "navigate_to",
            "args": {"location_slug": start_slug},
        }
    ], True

def _score_media_match(media: dict, query: str) -> int:
    """Small deterministic matcher for choosing a focused media item."""
    if not query:
        return 0

    normalized_query = query.strip().lower()
    terms = [term for term in normalized_query.split() if term]
    caption = (media.get("caption") or "").lower()
    keywords = " ".join(str(item).lower() for item in media.get("keywords") or [])
    haystack = f"{caption} {keywords}"

    score = 0
    if normalized_query and normalized_query in haystack:
        score += 100
    score += sum(10 for term in terms if term in haystack)
    if media.get("is_intro"):
        score += 1
    return score


def _media_type_filter(media_type: str | None) -> str | None:
    if media_type in {"video", "gif"}:
        return media_type
    if media_type == "image":
        return None
    return None


def _matches_requested_media_type(media: dict, media_type: str | None) -> bool:
    if media_type == "image":
        return media.get("type") in {"image", "gif"}
    if media_type in {"video", "gif"}:
        return media.get("type") == media_type
    return True


async def _get_available_slugs(session: AsyncSession) -> str:
    """
    Query active locations from DB and format as a string for system prompt injection.
    Returns e.g. "thu-vien (Thư viện), cong-chinh (Cổng chính)"
    """
    cached_slugs = slug_cache.get()
    if cached_slugs is not None:
        return cached_slugs

    stmt = select(Location.slug, Location.name).where(Location.status == "active").order_by(Location.sort_order)
    result = await session.execute(stmt)
    rows = result.all()
    if not rows:
        slugs = "Chưa có dữ liệu."
    else:
        slugs = ", ".join(f"{slug} ({name})" for slug, name in rows)
    slug_cache.put(slugs)
    return slugs


async def _vector_search_with_cache(
    session: AsyncSession,
    query_vector: list[float],
    location_id: UUID | None,
) -> list[dict]:
    cached_chunks = vector_search_cache.get(query_vector, location_id)
    if cached_chunks is not None:
        logger.info("🎯 Vector search cache hit (location=%s)", location_id)
        return cached_chunks

    chunks = await vector_repo.vector_search(
        session, query_vector, location_id=location_id, top_k=5
    )
    vector_search_cache.put(query_vector, location_id, chunks)
    return chunks


async def _enrich_tool_actions(
    session: AsyncSession,
    tool_actions: list[dict],
    location_id: str | None,
) -> list[dict]:
    """
    Enrich UI tool actions with additional data before sending to frontend.

    Since the frontend auto-fetches ALL media per location, show_media only
    needs the focused media id. Resolve it server-side from search_query so the
    model does not need a second tool call.
    """
    try:
        loc_uuid = UUID(location_id) if location_id else None
    except (TypeError, ValueError):
        loc_uuid = None

    # If the AI is navigating to a new location in this same turn,
    # we should fetch media for the DESTINATION location, not the current one.
    dest_slug = None
    for action in tool_actions:
        if action.get("name") == "navigate_to":
            dest_slug = action.get("args", {}).get("location_slug")
            break

    if dest_slug:
        # Find UUID for the destination slug
        stmt = select(Location.id).where(Location.slug == dest_slug)
        result = await session.execute(stmt)
        dest_id = result.scalar_one_or_none()
        if dest_id:
            loc_uuid = dest_id

    if not loc_uuid:
        return tool_actions

    enriched_actions = []
    for action in tool_actions:
        if action.get("name") != "show_media":
            enriched_actions.append(action)
            continue

        args = dict(action.get("args") or {})
        if args.get("focus_media_id"):
            enriched_actions.append({**action, "args": args})
            continue

        media_type = args.get("media_type")
        search_query = (args.get("search_query") or "").strip()
        type_filter = _media_type_filter(media_type)

        assets = await media_repo.get_by_location(
            session,
            loc_uuid,
            media_type=type_filter,
            search_query=search_query or None,
        )
        assets = [item for item in assets if _matches_requested_media_type(item, media_type)]

        if not assets and search_query:
            all_assets = await media_repo.get_by_location(
                session,
                loc_uuid,
                media_type=type_filter,
            )
            all_assets = [
                item for item in all_assets
                if _matches_requested_media_type(item, media_type)
            ]
            scored_assets = sorted(
                all_assets,
                key=lambda item: _score_media_match(item, search_query),
                reverse=True,
            )
            assets = [item for item in scored_assets if _score_media_match(item, search_query) > 0]

        if not assets:
            assets = await media_repo.get_by_location(
                session,
                loc_uuid,
                media_type=type_filter,
            )
            assets = [item for item in assets if _matches_requested_media_type(item, media_type)]

        if assets:
            focused = assets[0]
            args["focus_media_id"] = focused["id"]
            if media_type == "all":
                args["media_type"] = "image" if focused["type"] in {"image", "gif"} else "video"

        enriched_actions.append({**action, "args": args})

    return enriched_actions


async def validate_tool_actions(
    session: AsyncSession,
    tool_actions: list[dict],
) -> list[dict]:
    """Validate model-generated UI actions against schemas and current DB state."""
    if not tool_actions:
        return []

    active_locations: dict[str, str] = {}
    if any(action.get("name") == "navigate_to" for action in tool_actions):
        result = await session.execute(
            select(Location.slug, Location.name).where(Location.status == "active")
        )
        active_locations = {slug: name for slug, name in result.all()}

    validated: list[dict] = []
    for action in tool_actions:
        try:
            parsed = TOOL_ACTION_ADAPTER.validate_python(action)
        except ValidationError as exc:
            logger.warning(
                "Dropping invalid tool action action=%r validation_errors=%s",
                action,
                exc.errors(include_url=False),
            )
            continue

        normalized = parsed.model_dump(exclude_none=True)
        if normalized["name"] == "navigate_to":
            slug = normalized["args"]["location_slug"]
            if slug not in active_locations:
                closest = get_close_matches(
                    slug,
                    list(active_locations),
                    n=1,
                    cutoff=0.55,
                )
                logger.warning(
                    "Dropping navigate_to slug=%r active_slugs=%s closest_match=%s",
                    slug,
                    sorted(active_locations),
                    closest[0] if closest else None,
                )
                continue
        validated.append(normalized)

    return validated


async def ensure_response_text(
    session: AsyncSession,
    answer: str | None,
    tool_actions: list[dict],
) -> str:
    """Guarantee a user-visible answer after tool validation."""
    normalized_answer = str(answer or "").strip()
    if normalized_answer:
        return normalized_answer

    navigation = next(
        (action for action in tool_actions if action.get("name") == "navigate_to"),
        None,
    )
    if navigation:
        slug = (navigation.get("args") or {}).get("location_slug")
        result = await session.execute(
            select(Location.name).where(
                Location.slug == slug,
                Location.status == "active",
            )
        )
        location_name = result.scalar_one_or_none()
        if location_name:
            return f"Được rồi, mình đưa bạn tới {location_name} nhé!"

    if tool_actions:
        return "Được rồi, mình xử lý ngay nhé!"

    return "Mình chưa hiểu ý bạn lắm, bạn có thể nói rõ hơn không?"


async def process_query(
    session: AsyncSession,
    message: str,
    location_id: str,
    session_id: str | None = None,
    history: list[dict] | None = None,
    location_name: str = "Sảnh Chính",
    personality_prompt: str | None = None,
    voice_style: str | None = None,
    input_type: str = "text",
    persist: bool = True,
) -> dict:
    """Run the RAG pipeline and return a validated, fully collected result."""
    started = time.perf_counter()
    timings: dict[str, float] = {}

    try:
        try:
            loc_uuid = UUID(location_id) if location_id else None
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValueError(f"Invalid location_id: {location_id}") from exc

        phase_started = time.perf_counter()
        query_vector = await embed_query(message)
        timings["embedding_ms"] = round((time.perf_counter() - phase_started) * 1000, 2)

        phase_started = time.perf_counter()
        chunks = await _vector_search_with_cache(session, query_vector, None)
        timings["vector_search_ms"] = round((time.perf_counter() - phase_started) * 1000, 2)

        phase_started = time.perf_counter()
        available_slugs = await _get_available_slugs(session)
        timings["slug_lookup_ms"] = round((time.perf_counter() - phase_started) * 1000, 2)
        await session.commit()

        rag_context = [chunk["content"] for chunk in chunks]
        gen_kwargs = {
            "query": message,
            "history": history,
            "location_name": location_name,
            "available_slugs": available_slugs,
        }
        if personality_prompt:
            gen_kwargs["personality_prompt"] = personality_prompt
        if voice_style:
            gen_kwargs["voice_style"] = voice_style

        phase_started = time.perf_counter()
        result_r1 = await generate_response(
            rag_context=rag_context,
            tools=[AGENT_TOOLS],
            **gen_kwargs,
        )
        timings["gemini_round1_ms"] = round((time.perf_counter() - phase_started) * 1000, 2)

        search_fc = next(
            (fc for fc in result_r1.function_calls if fc.get("name") in _SEARCH_TOOLS),
            None,
        )
        tool_actions = [
            fc for fc in result_r1.function_calls if fc.get("name") in _UI_TOOLS
        ]
        final_result = result_r1

        if search_fc:
            extra_query = (search_fc.get("args") or {}).get("query", message)

            phase_started = time.perf_counter()
            extra_vector = await embed_query(extra_query)
            timings["search_embedding_ms"] = round((time.perf_counter() - phase_started) * 1000, 2)

            phase_started = time.perf_counter()
            extra_chunks = await _vector_search_with_cache(session, extra_vector, None)
            timings["search_vector_ms"] = round((time.perf_counter() - phase_started) * 1000, 2)
            extra_context = [chunk["content"] for chunk in extra_chunks]
            await session.commit()

            logger.info(
                "Search tool '%s' -> RAG round 2 (query='%s', results=%d)",
                search_fc["name"],
                extra_query,
                len(extra_chunks),
            )

            phase_started = time.perf_counter()
            final_result = await generate_response(
                rag_context=rag_context + extra_context,
                **gen_kwargs,
            )
            timings["gemini_round2_ms"] = round((time.perf_counter() - phase_started) * 1000, 2)

            seen_chunk_ids = {chunk["id"] for chunk in chunks}
            chunks.extend(
                chunk for chunk in extra_chunks if chunk["id"] not in seen_chunk_ids
            )

        answer_candidate, pseudo_tool_actions = recover_pseudo_tool_actions(final_result.text)
        tool_actions.extend(pseudo_tool_actions)

        phase_started = time.perf_counter()
        tool_actions, used_navigation_fallback = await apply_navigation_fallback(
            session,
            message,
            tool_actions,
        )
        timings["navigation_fallback_ms"] = round(
            (time.perf_counter() - phase_started) * 1000,
            2,
        )
        if used_navigation_fallback:
            answer_candidate = ""

        tool_started = time.perf_counter()
        phase_started = time.perf_counter()
        if tool_actions:
            tool_actions = await _enrich_tool_actions(session, tool_actions, location_id)
        timings["tool_enrichment_ms"] = round(
            (time.perf_counter() - phase_started) * 1000,
            2,
        )

        phase_started = time.perf_counter()
        tool_actions = await validate_tool_actions(session, tool_actions)
        timings["tool_validation_ms"] = round(
            (time.perf_counter() - phase_started) * 1000,
            2,
        )

        phase_started = time.perf_counter()
        answer = await ensure_response_text(session, answer_candidate, tool_actions)
        timings["response_fallback_ms"] = round(
            (time.perf_counter() - phase_started) * 1000,
            2,
        )
        timings["tool_processing_ms"] = round(
            (time.perf_counter() - tool_started) * 1000,
            2,
        )

    except Exception as exc:
        logger.error("RAG pipeline error: %s", exc)
        response_time_ms = int((time.perf_counter() - started) * 1000)
        timings["total_rag_ms"] = float(response_time_ms)
        return {
            "answer": "Xin lỗi bạn, mình đang gặp sự cố kỹ thuật. Bạn thử hỏi lại sau ít phút nhé!",
            "thinking": None,
            "sources": [],
            "tool_actions": [],
            "response_time_ms": response_time_ms,
            "timings": timings,
            "error": True,
        }

    response_time_ms = int((time.perf_counter() - started) * 1000)

    persistence_started = time.perf_counter()
    if persist and session_id:
        try:
            await _save_chat_messages(
                session,
                session_id=UUID(session_id),
                location_id=loc_uuid,
                user_message=message,
                assistant_message=answer,
                response_time_ms=response_time_ms,
                input_type=input_type,
                tool_calls_data=tool_actions or None,
            )
            await session.commit()
        except Exception as exc:
            logger.warning("Failed to save chat messages: %s", exc)
    timings["persistence_ms"] = round((time.perf_counter() - persistence_started) * 1000, 2)
    timings["total_rag_ms"] = round((time.perf_counter() - started) * 1000, 2)

    return {
        "answer": answer,
        "thinking": final_result.thinking,
        "sources": [
            {
                "chunk_id": chunk["id"],
                "content": chunk["content"][:200],
                "similarity": chunk["similarity"],
            }
            for chunk in chunks
        ],
        "tool_actions": tool_actions,
        "response_time_ms": response_time_ms,
        "timings": timings,
    }

async def create_chat_session(
    session: AsyncSession,
    is_kiosk: bool = False,
    start_location_id: UUID | None = None,
) -> UUID:
    """Create a new chat session. Returns session_id (UUID)."""
    chat_session = ChatSession(
        is_kiosk=is_kiosk,
        start_location_id=start_location_id,
    )
    session.add(chat_session)
    await session.flush()
    logger.info(f"💬 Created chat session: {chat_session.id}")
    return chat_session.id


async def save_chat_exchange(
    session: AsyncSession,
    session_id: str | None,
    location_id: str | None,
    user_message: str,
    assistant_message: str,
    response_time_ms: int,
    input_type: str = "text",
    tool_calls_data: list[dict] | None = None,
) -> bool:
    """Persist a chat exchange for analytics when the answer bypasses RAG generation.

    Note: This does NOT commit the session. Callers are responsible for calling
    ``await session.commit()`` after a ``True`` return so they retain control
    over the transaction boundary. On failure, this rolls back and returns
    ``False`` so callers do not commit a failed transaction.
    """
    if not session_id:
        return False

    try:
        await _save_chat_messages(
            session,
            session_id=UUID(session_id),
            location_id=UUID(location_id) if location_id else None,
            user_message=user_message,
            assistant_message=assistant_message,
            response_time_ms=response_time_ms,
            input_type=input_type,
            tool_calls_data=tool_calls_data,
        )
        return True
    except Exception as e:
        await session.rollback()
        logger.warning(f"Failed to save cached chat messages: {e}")
        return False


async def _save_chat_messages(
    session: AsyncSession,
    session_id: UUID,
    location_id: UUID | None,
    user_message: str,
    assistant_message: str,
    response_time_ms: int,
    input_type: str = "text",
    tool_calls_data: list[dict] | None = None,
):
    """Save user + assistant messages to chat_messages table (for analytics)."""
    # User message
    user_msg = ChatMessage(
        session_id=session_id,
        location_id=location_id,
        role="user",
        content=user_message,
        input_type=input_type,
    )
    session.add(user_msg)

    # Assistant message
    assistant_msg = ChatMessage(
        session_id=session_id,
        location_id=location_id,
        role="assistant",
        content=assistant_message,
        response_time_ms=response_time_ms,
        tool_calls=tool_calls_data,
    )
    session.add(assistant_msg)

    # Update session message count
    from sqlalchemy import update
    stmt = (
        update(ChatSession)
        .where(ChatSession.id == session_id)
        .values(message_count=ChatSession.message_count + 2)
    )
    await session.execute(stmt)
    await session.flush()
