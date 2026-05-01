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

from app.ai.embedding_engine import embed_query
from app.ai.chat_engine import generate_response, generate_response_stream, StreamChunk
from app.ai.tools import AGENT_TOOLS
from app.repositories import vector_repo, media_repo
from app.db.tables import ChatSession, ChatMessage, Location

logger = logging.getLogger(__name__)

# Search tool names — these require RAG round 2
_SEARCH_TOOLS = {"search_local", "search_global"}
# UI tool names — these are forwarded directly to frontend
_UI_TOOLS = {"navigate_to", "show_media", "toggle_map"}


async def _get_available_slugs(session: AsyncSession) -> str:
    """
    Query active locations from DB and format as a string for system prompt injection.
    Returns e.g. "thu-vien (Thư viện), cong-chinh (Cổng chính)"
    """
    stmt = select(Location.slug, Location.name).where(Location.status == "active").order_by(Location.sort_order)
    result = await session.execute(stmt)
    rows = result.all()
    if not rows:
        return "Chưa có dữ liệu."
    return ", ".join(f"{slug} ({name})" for slug, name in rows)


async def _enrich_tool_actions(
    session: AsyncSession,
    tool_actions: list[dict],
    location_id: str | None,
) -> list[dict]:
    """
    Enrich UI tool actions with additional data before sending to frontend.
    For show_media: query actual media items from DB and inject into args.

    Smart location resolution: if navigate_to is in the same batch,
    use the TARGET location for show_media instead of current location.
    """
    enriched = []
    loc_uuid = UUID(location_id) if location_id else None

    # Check if navigate_to is in the same batch → use target location for show_media
    target_slug = None
    for fc in tool_actions:
        if fc["name"] == "navigate_to":
            target_slug = fc["args"].get("location_slug")
            break

    # Resolve target location_id if navigating
    if target_slug:
        from app.repositories import location_repo
        target_location = await location_repo.get_by_slug(session, target_slug)
        if target_location:
            media_loc_uuid = target_location.id
        else:
            media_loc_uuid = loc_uuid  # fallback to current
    else:
        media_loc_uuid = loc_uuid

    for fc in tool_actions:
        if fc["name"] == "show_media" and media_loc_uuid:
            media_type = fc["args"].get("media_type", "all")
            search_query = fc["args"].get("search_query")
            media_items = await media_repo.get_by_location(
                session, media_loc_uuid, media_type=media_type, search_query=search_query
            )
            # If search_query returned nothing, fallback to all media of that type
            if not media_items and search_query:
                media_items = await media_repo.get_by_location(
                    session, media_loc_uuid, media_type=media_type
                )
            fc = {
                **fc,
                "args": {
                    **fc["args"],
                    "media_items": media_items,
                },
            }
        enriched.append(fc)

    return enriched


async def process_query(
    session: AsyncSession,
    message: str,
    location_id: str,
    session_id: str | None = None,
    history: list[dict] | None = None,
    location_name: str = "Sảnh Chính",
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

        # Step 2: Vector search for relevant chunks
        loc_uuid = UUID(location_id) if location_id else None
        chunks = await vector_repo.vector_search(
            session, query_vector, location_id=loc_uuid, top_k=5
        )

        # Step 2b: Get available slugs for system prompt
        available_slugs = await _get_available_slugs(session)

        # Step 3: Build RAG context and call Gemini WITH tools
        rag_context = [chunk["content"] for chunk in chunks]
        result = await generate_response(
            query=message,
            rag_context=rag_context,
            history=history,
            location_name=location_name,
            tools=[AGENT_TOOLS],
            available_slugs=available_slugs,
        )

        # Step 4: Handle function calls
        tool_actions = []
        if result.function_calls:
            for fc in result.function_calls:
                if fc["name"] in _SEARCH_TOOLS:
                    # Determine search scope based on tool name
                    search_location_id = loc_uuid if fc["name"] == "search_local" else None

                    # Execute RAG round 2 with the AI's refined query
                    extra_query = fc["args"].get("query", message)
                    extra_vector = await embed_query(extra_query)
                    extra_chunks = await vector_repo.vector_search(
                        session, extra_vector, location_id=search_location_id, top_k=5
                    )
                    extra_context = [c["content"] for c in extra_chunks]

                    logger.info(
                        f"🔄 Search tool '{fc['name']}' → RAG round 2 "
                        f"(query='{extra_query}', results={len(extra_chunks)})"
                    )

                    # Call Gemini round 2 WITHOUT tools — force text-only response
                    result = await generate_response(
                        query=message,
                        rag_context=rag_context + extra_context,
                        history=history,
                        location_name=location_name,
                        available_slugs=available_slugs,
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

        # Step 2: Vector search
        loc_uuid = UUID(location_id) if location_id else None
        chunks = await vector_repo.vector_search(
            session, query_vector, location_id=loc_uuid, top_k=5
        )

        # Step 2b: Get available slugs
        available_slugs = await _get_available_slugs(session)

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
        result_r1 = await generate_response(
            query=message,
            rag_context=rag_context,
            history=history,
            location_name=location_name,
            tools=[AGENT_TOOLS],
            available_slugs=available_slugs,
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
            search_location_id = loc_uuid if search_fc["name"] == "search_local" else None
            extra_query = search_fc["args"].get("query", message)
            extra_vector = await embed_query(extra_query)
            extra_chunks = await vector_repo.vector_search(
                session, extra_vector, location_id=search_location_id, top_k=5
            )
            extra_context = [c["content"] for c in extra_chunks]

            logger.info(
                f"🔄 Stream: Search tool '{search_fc['name']}' → RAG round 2 "
                f"(query='{extra_query}', results={len(extra_chunks)})"
            )

            # Stream Gemini round 2 — NO tools (text only)
            async for chunk in generate_response_stream(
                query=message,
                rag_context=rag_context + extra_context,
                history=history,
                location_name=location_name,
                available_slugs=available_slugs,
                # No tools → guaranteed text-only stream
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
        # ──────────────────────────────────────────────────────
        if result_r1.text:
            yield StreamChunk(type="text", content=result_r1.text)
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
