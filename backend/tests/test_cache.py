"""Unit tests for process-local cache helpers."""

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestCacheHelpers(unittest.TestCase):
    def test_embedding_cache_normalizes_and_evicts_lru(self):
        from app.cache import EmbeddingCache

        cache = EmbeddingCache(maxsize=2)
        cache.put(" Thu   vien ", [1.0])
        cache.put("CNTT", [2.0])

        self.assertEqual(cache.get("thu vien"), [1.0])

        cache.put("D5", [3.0])
        self.assertIsNone(cache.get("CNTT"))
        self.assertEqual(cache.get("thu vien"), [1.0])
        self.assertEqual(cache.get("d5"), [3.0])

    def test_slug_cache_expires(self):
        from app.cache import SlugCache

        cache = SlugCache(ttl_seconds=0.01)
        cache.put("thu-vien (Thu vien)")

        self.assertEqual(cache.get(), "thu-vien (Thu vien)")
        time.sleep(0.02)
        self.assertIsNone(cache.get())

    def test_vector_search_cache_separates_location(self):
        from app.cache import VectorSearchCache

        cache = VectorSearchCache(maxsize=2)
        embedding = [0.1, 0.2, 0.3]
        cache.put(embedding, "loc-a", [{"id": "1"}])

        self.assertEqual(cache.get(embedding, "loc-a"), [{"id": "1"}])
        self.assertIsNone(cache.get(embedding, "loc-b"))

    def test_qa_cache_store_loads_json(self):
        from app.cache import QACacheStore

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "qa_cache.json"
            path.write_text('{"abc": {"answer": "ok"}}', encoding="utf-8")

            store = QACacheStore(path)
            self.assertEqual(store.reload(), 1)
            self.assertEqual(store.get("abc"), {"answer": "ok"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
