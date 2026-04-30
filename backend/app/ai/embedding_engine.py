"""
Embedding Engine — Handles vectorization of text for RAG.
"""

import asyncio
from google.genai import types
from app.ai.core_client import get_client
from app.config import get_settings


async def embed_query(text: str) -> list[float]:
    """
    Embeds a user query into a 768-dim vector.
    Uses task_type=QUESTION_ANSWERING for queries.
    """
    client = get_client()
    settings = get_settings()
    
    # Using asyncio.to_thread since the genai SDK might be blocking, 
    # or use the async client if available (google.genai exposes standard synchronous methods by default
    # but we can wrap them in asyncio if needed, or wait for native async support).
    # Since genai Client currently does not have native async embed_content in some versions,
    # we'll use asyncio.to_thread for safety to avoid blocking the event loop.
    result = await asyncio.to_thread(
        client.models.embed_content,
        model=settings.GEMINI_EMBEDDING_MODEL,
        contents=text,
        config=types.EmbedContentConfig(
            task_type="QUESTION_ANSWERING",
            output_dimensionality=settings.GEMINI_EMBEDDING_DIMENSIONS,
        )
    )
    return result.embeddings[0].values


async def embed_document(text: str, title: str | None = None) -> list[float]:
    """
    Embeds a document chunk into a 768-dim vector.
    Uses task_type=RETRIEVAL_DOCUMENT for chunks.
    """
    client = get_client()
    settings = get_settings()
    
    config_args = {
        "task_type": "RETRIEVAL_DOCUMENT",
        "output_dimensionality": settings.GEMINI_EMBEDDING_DIMENSIONS,
    }
    if title:
        config_args["title"] = title
        
    result = await asyncio.to_thread(
        client.models.embed_content,
        model=settings.GEMINI_EMBEDDING_MODEL,
        contents=text,
        config=types.EmbedContentConfig(**config_args)
    )
    return result.embeddings[0].values


async def embed_batch(texts: list[str], batch_size: int = 100) -> list[list[float]]:
    """
    Batch embed multiple texts with rate limiting.
    Splits texts into batches and sleeps between them to avoid hitting limits.
    """
    all_embeddings = []
    client = get_client()
    settings = get_settings()
    
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        
        result = await asyncio.to_thread(
            client.models.embed_content,
            model=settings.GEMINI_EMBEDDING_MODEL,
            contents=batch,
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_DOCUMENT",
                output_dimensionality=settings.GEMINI_EMBEDDING_DIMENSIONS,
            )
        )
        
        batch_embeddings = [emb.values for emb in result.embeddings]
        all_embeddings.extend(batch_embeddings)
        
        if i + batch_size < len(texts):
            # Sleep slightly to respect rate limits
            await asyncio.sleep(0.5)
            
    return all_embeddings
