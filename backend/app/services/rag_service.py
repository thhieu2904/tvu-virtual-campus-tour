"""
RAG Service — Orchestrates the Retrieval-Augmented Generation pipeline.
Layer 2 (Business Logic): embed query → hybrid search → build prompt → call LLM.
"""


async def process_query(message: str, location_id: str, session_id: str | None = None) -> dict:
    """
    Main RAG pipeline:
    1. Embed user question → 768-dim vector
    2. Hybrid search (vector + BM25 + RRF) filtered by location_id
    3. Build prompt: system + location context + retrieved chunks + user question
    4. Call Gemini Flash with Function Calling (tool declarations)
    5. Parse response: text answer OR tool_call (navigate_to, show_media, etc.)
    6. Save chat message to DB
    """
    # TODO: Implement full RAG pipeline
    # Step 1: embedding = await gemini_service.embed(message)
    # Step 2: chunks = await vector_repo.hybrid_search(embedding, message, location_id)
    # Step 3: prompt = build_prompt(location, chunks, message)
    # Step 4: response = await gemini_service.chat(prompt, tools)
    # Step 5: parse tool_calls or text
    # Step 6: save to chat_messages
    return {
        "answer": "RAG pipeline not implemented yet",
        "sources": [],
        "tool_action": None,
    }
