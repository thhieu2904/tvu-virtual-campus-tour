"""Process-local caches for the chat/RAG hot path."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections import OrderedDict
from pathlib import Path
from threading import Lock
from typing import Any

from app.services import storage_service

logger = logging.getLogger(__name__)


def normalize_cache_text(text: str) -> str:
    """Normalize user text for cache keys without changing request semantics."""
    return " ".join(text.strip().lower().split())


class EmbeddingCache:
    def __init__(self, maxsize: int = 500):
        self.maxsize = maxsize
        self._items: OrderedDict[str, list[float]] = OrderedDict()
        self._lock = Lock()
        self.hits = 0
        self.misses = 0

    def get(self, text: str) -> list[float] | None:
        key = normalize_cache_text(text)
        with self._lock:
            value = self._items.get(key)
            if value is None:
                self.misses += 1
                return None
            self._items.move_to_end(key)
            self.hits += 1
            return list(value)

    def put(self, text: str, embedding: list[float]) -> None:
        key = normalize_cache_text(text)
        with self._lock:
            self._items[key] = list(embedding)
            self._items.move_to_end(key)
            while len(self._items) > self.maxsize:
                self._items.popitem(last=False)

    def __len__(self) -> int:
        with self._lock:
            return len(self._items)


class SlugCache:
    def __init__(self, ttl_seconds: int = 300):
        self.ttl_seconds = ttl_seconds
        self._value: str | None = None
        self._expires_at = 0.0
        self._lock = Lock()
        self.hits = 0
        self.misses = 0

    def get(self) -> str | None:
        now = time.monotonic()
        with self._lock:
            if self._value is None or now >= self._expires_at:
                self._value = None
                self._expires_at = 0.0
                self.misses += 1
                return None
            self.hits += 1
            return self._value

    def put(self, value: str) -> None:
        with self._lock:
            self._value = value
            self._expires_at = time.monotonic() + self.ttl_seconds

    def invalidate(self) -> None:
        with self._lock:
            self._value = None
            self._expires_at = 0.0


class VectorSearchCache:
    def __init__(self, maxsize: int = 200):
        self.maxsize = maxsize
        self._items: OrderedDict[tuple[int, str], list[dict[str, Any]]] = OrderedDict()
        self._lock = Lock()
        self.hits = 0
        self.misses = 0

    def _make_key(self, embedding: list[float], location_id: object | None) -> tuple[int, str]:
        return (hash(tuple(embedding)), str(location_id) if location_id is not None else "")

    def get(self, embedding: list[float], location_id: object | None) -> list[dict[str, Any]] | None:
        key = self._make_key(embedding, location_id)
        with self._lock:
            value = self._items.get(key)
            if value is None:
                self.misses += 1
                return None
            self._items.move_to_end(key)
            self.hits += 1
            return [dict(chunk) for chunk in value]

    def put(self, embedding: list[float], location_id: object | None, chunks: list[dict[str, Any]]) -> None:
        key = self._make_key(embedding, location_id)
        with self._lock:
            self._items[key] = [dict(chunk) for chunk in chunks]
            self._items.move_to_end(key)
            while len(self._items) > self.maxsize:
                self._items.popitem(last=False)

    def __len__(self) -> int:
        with self._lock:
            return len(self._items)


class QACacheStore:
    def __init__(self, path: Path | None = None):
        self.path = path or Path(__file__).resolve().parent.parent / "data" / "qa_cache.json"
        self._items: dict[str, dict[str, Any]] = {}
        self._lock = Lock()

    def get(self, cache_key: str) -> dict[str, Any] | None:
        with self._lock:
            value = self._items.get(cache_key)
            return dict(value) if value is not None else None

    def reload(self) -> int:
        if not self.path.exists():
            logger.warning("QA cache file not found: %s", self.path)
            with self._lock:
                self._items = {}
            return 0

        with self.path.open("r", encoding="utf-8") as file:
            data = json.load(file)

        with self._lock:
            self._items = data if isinstance(data, dict) else {}
            return len(self._items)

    def __len__(self) -> int:
        with self._lock:
            return len(self._items)


class TTSKeyCache:
    def __init__(self):
        self._keys: set[str] = set()
        self._loaded = False
        self._lock = Lock()

    @property
    def loaded(self) -> bool:
        with self._lock:
            return self._loaded

    def contains(self, key: str) -> bool:
        with self._lock:
            return key in self._keys

    def add(self, key: str) -> None:
        with self._lock:
            self._keys.add(key)

    async def load_from_r2(self, prefix: str = "global/cache/") -> int:
        client = storage_service._get_s3_client()
        bucket = storage_service._get_bucket()
        keys: set[str] = set()
        continuation_token: str | None = None

        while True:
            kwargs: dict[str, Any] = {"Bucket": bucket, "Prefix": prefix}
            if continuation_token:
                kwargs["ContinuationToken"] = continuation_token

            response = await asyncio.to_thread(client.list_objects_v2, **kwargs)
            for item in response.get("Contents", []):
                key = item.get("Key")
                if key:
                    keys.add(key)

            if not response.get("IsTruncated"):
                break
            continuation_token = response.get("NextContinuationToken")
            if not continuation_token:
                break

        with self._lock:
            self._keys = keys
            self._loaded = True
            return len(self._keys)

    def __len__(self) -> int:
        with self._lock:
            return len(self._keys)


embedding_cache = EmbeddingCache()
slug_cache = SlugCache()
vector_search_cache = VectorSearchCache()
qa_cache_store = QACacheStore()
tts_key_cache = TTSKeyCache()


async def init_caches() -> None:
    qa_count = qa_cache_store.reload()
    logger.info("QA cache loaded: %s entries", qa_count)

    try:
        tts_count = await tts_key_cache.load_from_r2()
        logger.info("TTS key cache loaded: %s entries", tts_count)
    except Exception as exc:
        logger.warning("Could not load TTS key cache from R2; using R2 HEAD fallback: %s", exc)

    logger.info(
        "Cache system ready: embeddings=%s, vector_search=%s, slugs=%s",
        len(embedding_cache),
        len(vector_search_cache),
        "ttl",
    )
