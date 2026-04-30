"""
RAG Service — Orchestrates the Retrieval-Augmented Generation pipeline.
Layer 2 (Business Logic): embed query → vector search → build prompt → call LLM.

Phase 1: Simple RAG — vector search + Gemini text response (no Function Calling).
Phase 2 (future): Add Function Calling (navigate_to, show_media, etc.)
"""

import logging
import time
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embedding_engine import embed_query
from app.ai.chat_engine import generate_response, generate_response_stream, StreamChunk
from app.repositories import vector_repo
from app.db.tables import ChatSession, ChatMessage

logger = logging.getLogger(__name__)


async def process_query(
    session: AsyncSession,
    message: str,
    location_id: str,
    session_id: str | None = None,
    history: list[dict] | None = None,
    location_name: str = "Sảnh Chính",
) -> dict:
    """
    Main RAG pipeline (non-streaming):
    1. Embed user question → 768-dim vector
    2. Vector search → top 5 relevant chunks
    3. Call Gemini with RAG context + history
    4. Save user + assistant messages to DB
    5. Return answer + sources
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

        # Step 3: Build RAG context and call Gemini
        rag_context = [chunk["content"] for chunk in chunks]
        result = await generate_response(
            query=message,
            rag_context=rag_context,
            history=history,
            location_name=location_name,
        )
    except Exception as e:
        logger.error(f"RAG pipeline error: {e}")
        response_time_ms = int((time.time() - start_time) * 1000)
        return {
            "answer": "Xin lỗi bạn, mình đang gặp sự cố kỹ thuật. Bạn thử hỏi lại sau ít phút nhé! 🙏",
            "thinking": None,
            "sources": [],
            "response_time_ms": response_time_ms,
            "error": True,
        }

    response_time_ms = int((time.time() - start_time) * 1000)

    # Step 4: Save chat messages to DB (for research/analytics)
    if session_id:
        try:
            await _save_chat_messages(
                session,
                session_id=UUID(session_id),
                location_id=loc_uuid,
                user_message=message,
                assistant_message=result.text,
                response_time_ms=response_time_ms,
            )
        except Exception as e:
            logger.warning(f"Failed to save chat messages: {e}")

    # Step 5: Return structured response
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
    Streaming RAG pipeline:
    1. Embed + search (same as non-streaming)
    2. Stream Gemini response via SSE
    3. Save messages after stream completes

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
    except Exception as e:
        logger.error(f"RAG stream pipeline error: {e}")
        yield StreamChunk(
            type="error",
            content="Xin lỗi bạn, mình đang gặp sự cố kỹ thuật. Bạn thử hỏi lại sau ít phút nhé! 🙏",
        )
        return

    # Step 3: Stream Gemini response
    rag_context = [chunk["content"] for chunk in chunks]
    full_answer_parts: list[str] = []

    async for chunk in generate_response_stream(
        query=message,
        rag_context=rag_context,
        history=history,
        location_name=location_name,
    ):
        if chunk.type == "text":
            full_answer_parts.append(chunk.content)
        yield chunk

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

    # Step 4: Save chat messages
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
