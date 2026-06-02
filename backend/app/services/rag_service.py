"""
RAG Service — Orchestrates the Retrieval-Augmented Generation pipeline.
Layer 2 (Business Logic): embed query → vector search → build prompt → call LLM.

Phase 1: Simple RAG — vector search + Gemini text response (no Function Calling).
Phase 2 (current): Function Calling — Gemini can invoke tools (navigate, show_media, etc.)
                    Uses "Collect-then-Decide" pattern for streaming.
"""

import json
import logging
import time
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.ai.chat_engine import StreamChunk, generate_response, generate_response_stream
from app.ai.embedding_engine import embed_query
from app.ai.tools import AGENT_TOOLS
from app.cache import slug_cache, vector_search_cache
from app.db.tables import ChatMessage, ChatSession, Location
from app.repositories import media_repo, vector_repo

logger = logging.getLogger(__name__)

# Search tool names — these require RAG round 2
_SEARCH_TOOLS = {"search_documents"}
# UI tool names — these are forwarded directly to frontend
_UI_TOOLS = {"navigate_to", "show_media", "toggle_map"}


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
    if not location_id:
        return tool_actions

    try:
        loc_uuid = UUID(location_id)
    except (TypeError, ValueError):
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


async def process_query(
    session: AsyncSession,
    message: str,
    location_id: str,
    session_id: str | None = None,
    history: list[dict] | None = None,
    location_name: str = "Sảnh Chính",
    personality_prompt: str | None = None,
    voice_style: str | None = None,
) -> dict:
    """
    Main RAG pipeline (non-streaming) with Function Calling support:
    1. Embed user question → 768-dim vector
    2. Vector search → top 5 relevant chunks
    3. Call Gemini with RAG context + history + tools
    4. If search tool → RAG round 2 → Gemini round 2 (no tools)
    5. If UI tool → collect actions for frontend
    6. Save user + assistant messages to DB
    7. Return answer + sources + tool_actions
    """
    start_time = time.time()

    try:
        # Step 1: Embed the user's question
        query_vector = await embed_query(message)

        # Step 2: Vector search for relevant global chunks
        loc_uuid = UUID(location_id) if location_id else None
        chunks = await _vector_search_with_cache(session, query_vector, None)

        # Step 2b: Get available slugs for system prompt
        available_slugs = await _get_available_slugs(session)

        # Release DB connection before calling LLM
        await session.commit()

        # Step 3: Build RAG context and call Gemini WITH tools
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

        result = await generate_response(
            rag_context=rag_context,
            tools=[AGENT_TOOLS],
            **gen_kwargs
        )

        # Step 4: Handle function calls
        tool_actions = []
        if result.function_calls:
            for fc in result.function_calls:
                if fc["name"] in _SEARCH_TOOLS:
                    # Execute RAG round 2 with the AI's refined query globally
                    extra_query = fc["args"].get("query", message)
                    extra_vector = await embed_query(extra_query)
                    extra_chunks = await vector_repo.vector_search(
                        session, extra_vector, location_id=None, top_k=5
                    )
                    extra_context = [c["content"] for c in extra_chunks]

                    # Release DB connection before calling LLM round 2
                    await session.commit()

                    logger.info(
                        f"🔄 Search tool '{fc['name']}' → RAG round 2 "
                        f"(query='{extra_query}', results={len(extra_chunks)})"
                    )

                    # Call Gemini round 2 WITHOUT tools — force text-only response
                    result = await generate_response(
                        rag_context=rag_context + extra_context,
                        **gen_kwargs
                        # No tools → Gemini only returns text
                    )
                    # Update chunks for sources
                    chunks = chunks + extra_chunks
                    break  # Max 1 search round to prevent infinite loop

                elif fc["name"] in _UI_TOOLS:
                    tool_actions.append(fc)

        # Step 4b: Enrich UI tool actions (e.g., fetch media items)
        if tool_actions:
            tool_actions = await _enrich_tool_actions(session, tool_actions, location_id)

    except Exception as e:
        logger.error(f"RAG pipeline error: {e}")
        response_time_ms = int((time.time() - start_time) * 1000)
        return {
            "answer": "Xin lỗi bạn, mình đang gặp sự cố kỹ thuật. Bạn thử hỏi lại sau ít phút nhé! 🙏",
            "thinking": None,
            "sources": [],
            "tool_actions": [],
            "response_time_ms": response_time_ms,
            "error": True,
        }

    response_time_ms = int((time.time() - start_time) * 1000)

    # Step 5: Save chat messages to DB (for research/analytics)
    if session_id:
        try:
            await _save_chat_messages(
                session,
                session_id=UUID(session_id),
                location_id=loc_uuid,
                user_message=message,
                assistant_message=result.text,
                response_time_ms=response_time_ms,
                tool_calls_data=result.function_calls if result.function_calls else None,
            )
            await session.commit()
        except Exception as e:
            logger.warning(f"Failed to save chat messages: {e}")

    # Step 6: Return structured response
    return {
        "answer": result.text,
        "thinking": result.thinking,
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
    }


async def process_query_stream(
    session: AsyncSession,
    message: str,
    location_id: str,
    session_id: str | None = None,
    history: list[dict] | None = None,
    location_name: str = "Sảnh Chính",
    personality_prompt: str | None = None,
    voice_style: str | None = None,
):
    """
    Streaming RAG pipeline with Function Calling (Collect-then-Decide):

    1. Embed + vector search (same as non-streaming)
    2. Call Gemini round 1 NON-STREAM (need full response to check for search tools)
    3. If search tool → RAG round 2 → stream Gemini round 2
    4. If no search tool → emit tool_call events + yield text from round 1
    5. Save messages after stream completes

    Yields StreamChunk objects for SSE consumption.
    """
    start_time = time.time()

    try:
        # Step 1: Embed
        query_vector = await embed_query(message)

        # Step 2: Vector search for relevant global chunks
        loc_uuid = UUID(location_id) if location_id else None
        chunks = await _vector_search_with_cache(session, query_vector, None)

        # Step 2b: Get available slugs
        available_slugs = await _get_available_slugs(session)

        # Release DB connection before calling LLM
        await session.commit()

    except Exception as e:
        logger.error(f"RAG stream pipeline error: {e}")
        yield StreamChunk(
            type="error",
            content="Xin lỗi bạn, mình đang gặp sự cố kỹ thuật. Bạn thử hỏi lại sau ít phút nhé! 🙏",
        )
        return

    rag_context = [chunk["content"] for chunk in chunks]
    full_answer_parts: list[str] = []

    # ──────────────────────────────────────────────────────────
    # Step 3: Call Gemini Round 1 — NON-STREAM (Collect phase)
    # We need the full response to decide if search tools were called.
    # ──────────────────────────────────────────────────────────
    try:
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

        result_r1 = await generate_response(
            rag_context=rag_context,
            tools=[AGENT_TOOLS],
            **gen_kwargs
        )
    except Exception as e:
        logger.error(f"Gemini round 1 error: {e}")
        yield StreamChunk(
            type="error",
            content=f"Xin lỗi, có lỗi kết nối với AI ({str(e)}).",
        )
        return

    # ──────────────────────────────────────────────────────────
    # Step 4: Decide phase — check function calls
    # ──────────────────────────────────────────────────────────
    has_search_tool = False
    search_fc: dict | None = None
    ui_tool_actions = []

    if result_r1.function_calls:
        for fc in result_r1.function_calls:
            if fc["name"] in _SEARCH_TOOLS:
                has_search_tool = True
                search_fc = fc
            elif fc["name"] in _UI_TOOLS:
                ui_tool_actions.append(fc)

    # Enrich UI tool actions (e.g., fetch media items for show_media)
    if ui_tool_actions:
        ui_tool_actions = await _enrich_tool_actions(session, ui_tool_actions, location_id)

    # Yield UI tool_call events first
    for fc in ui_tool_actions:
        yield StreamChunk(
            type="tool_call",
            content=json.dumps(fc, ensure_ascii=False),
        )

    if has_search_tool:
        # ──────────────────────────────────────────────────────
        # Path A: Search tool called → RAG round 2 → Stream round 2
        # ──────────────────────────────────────────────────────
        try:
            extra_query = search_fc["args"].get("query", message)
            extra_vector = await embed_query(extra_query)

            # LUÔN LUÔN tìm kiếm Global (location_id=None)
            extra_chunks = await vector_repo.vector_search(
                session, extra_vector, location_id=None, top_k=5
            )
            extra_context = [c["content"] for c in extra_chunks]

            # Release DB connection before calling LLM round 2
            await session.commit()

            logger.info(
                f"🔄 Stream: Search tool '{search_fc['name']}' → RAG round 2 "
                f"(query='{extra_query}', results={len(extra_chunks)})"
            )

            # Stream Gemini round 2 — NO tools (text only)
            async for chunk in generate_response_stream(
                rag_context=rag_context + extra_context,
                **gen_kwargs
            ):
                if chunk.type == "text":
                    full_answer_parts.append(chunk.content)
                yield chunk

        except Exception as e:
            logger.error(f"RAG round 2 error: {e}")
            # Fallback: use round 1 text if available
            if result_r1.text:
                yield StreamChunk(type="text", content=result_r1.text)
                full_answer_parts.append(result_r1.text)
            else:
                yield StreamChunk(
                    type="error",
                    content="Xin lỗi, mình gặp lỗi khi tra cứu thêm thông tin. 🙏",
                )
    else:
        # ──────────────────────────────────────────────────────
        # Path B: No search tool → Yield text from round 1
        # Chunk into sentences for smoother streaming UX
        # ──────────────────────────────────────────────────────
        if result_r1.text:
            import re as _re
            # Split on sentence boundaries (. ! ? + emoji) while keeping delimiters
            sentences = _re.split(r'(?<=[.!?。]\s)', result_r1.text)
            for sentence in sentences:
                if sentence:  # skip empty
                    yield StreamChunk(type="text", content=sentence)
            full_answer_parts.append(result_r1.text)

    # After stream completes, yield sources as a final event
    yield StreamChunk(
        type="sources",
        content=str([
            {
                "chunk_id": c["id"],
                "content": c["content"][:200],
                "similarity": c["similarity"],
            }
            for c in chunks
        ]),
    )

    # Step 5: Save chat messages
    response_time_ms = int((time.time() - start_time) * 1000)
    full_answer = "".join(full_answer_parts)

    if session_id:
        try:
            await _save_chat_messages(
                session,
                session_id=UUID(session_id),
                location_id=loc_uuid,
                user_message=message,
                assistant_message=full_answer,
                response_time_ms=response_time_ms,
                tool_calls_data=result_r1.function_calls if result_r1.function_calls else None,
            )
            await session.commit()
        except Exception as e:
            logger.warning(f"Failed to save chat messages: {e}")


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
) -> None:
    """Persist a chat exchange for analytics when the answer bypasses RAG generation."""
    if not session_id:
        return

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
        await session.commit()
    except Exception as e:
        logger.warning(f"Failed to save cached chat messages: {e}")


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
