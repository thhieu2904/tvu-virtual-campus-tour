"""
Embedding Engine — Handles vectorization of text for RAG.
"""

import asyncio
import logging

from google.api_core.exceptions import ResourceExhausted
from google.genai import types

from app.ai.core_client import get_client
from app.cache import embedding_cache
from app.config import get_settings

logger = logging.getLogger(__name__)

# Retry config for 429 RESOURCE_EXHAUSTED
_MAX_RETRIES = 3
_BASE_DELAY = 1.0  # seconds — will double each retry (1s → 2s → 4s)


async def _call_with_retry(func, *args, **kwargs):
    """
    Call an async-wrapped function with exponential backoff on 429 errors.
    Retries up to _MAX_RETRIES times before re-raising.
    """
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return await asyncio.to_thread(func, *args, **kwargs)
        except (ResourceExhausted, Exception) as e:
            # Check if it's a 429 / RESOURCE_EXHAUSTED error
            is_rate_limit = (
                isinstance(e, ResourceExhausted)
                or "429" in str(e)
                or "RESOURCE_EXHAUSTED" in str(e)
            )
            if is_rate_limit and attempt < _MAX_RETRIES:
                delay = _BASE_DELAY * (2 ** attempt)
                logger.warning(
                    f"⏳ Rate limited (429), retrying in {delay:.1f}s "
                    f"(attempt {attempt + 1}/{_MAX_RETRIES})..."
                )
                await asyncio.sleep(delay)
                continue
            raise


async def embed_query(text: str) -> list[float]:
    """
    Embeds a user query into a 768-dim vector.
    Uses task_type=QUESTION_ANSWERING for queries.
    Retries automatically on 429 RESOURCE_EXHAUSTED.
    """
    cached_embedding = embedding_cache.get(text)
    if cached_embedding is not None:
        logger.info("🎯 Embedding cache hit")
        return cached_embedding

    client = get_client()
    settings = get_settings()

    result = await _call_with_retry(
        client.models.embed_content,
        model=settings.GEMINI_EMBEDDING_MODEL,
        contents=text,
        config=types.EmbedContentConfig(
            task_type="QUESTION_ANSWERING",
            output_dimensionality=settings.GEMINI_EMBEDDING_DIMENSIONS,
        )
    )
    embedding = result.embeddings[0].values
    embedding_cache.put(text, embedding)
    return embedding


async def embed_document(text: str, title: str | None = None) -> list[float]:
    """
    Embeds a document chunk into a 768-dim vector.
    Uses task_type=RETRIEVAL_DOCUMENT for chunks.
    Retries automatically on 429 RESOURCE_EXHAUSTED.
    """
    client = get_client()
    settings = get_settings()

    config_args = {
        "task_type": "RETRIEVAL_DOCUMENT",
        "output_dimensionality": settings.GEMINI_EMBEDDING_DIMENSIONS,
    }
    if title:
        config_args["title"] = title

    result = await _call_with_retry(
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
    Retries automatically on 429 RESOURCE_EXHAUSTED.
    """
    all_embeddings = []
    client = get_client()
    settings = get_settings()

    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]

        result = await _call_with_retry(
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
