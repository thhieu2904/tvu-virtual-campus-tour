"""
Unit tests for the AI module (backend/app/ai/).
Uses unittest.mock to avoid real API calls.
"""

import asyncio
import os
import sys
import shutil
import unittest
import uuid
from pathlib import Path
from unittest.mock import MagicMock, AsyncMock, patch, PropertyMock
from dataclasses import dataclass

# Ensure the project root is in sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
TEST_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".tmp"))
os.makedirs(TEST_TMP_DIR, exist_ok=True)


# ============================================================
# TEST 1: System Prompts (Pure functions — no mocking needed)
# ============================================================
class TestSystemPrompts(unittest.TestCase):

    def test_build_prompt_defaults(self):
        from app.ai.prompts.system_prompts import build_system_prompt
        prompt = build_system_prompt(current_time="2026-01-01 12:00:00")
        self.assertIn("ViVy", prompt)
        self.assertIn("Sảnh Chính", prompt)
        self.assertIn("2026-01-01 12:00:00", prompt)
        self.assertIn("Không có ngữ cảnh bổ sung.", prompt)

    def test_build_prompt_custom_values(self):
        from app.ai.prompts.system_prompts import build_system_prompt
        prompt = build_system_prompt(
            location_name="Khoa CNTT",
            voice_style="vui vẻ, năng động",
            rag_context="Khoa CNTT có 3 ngành đào tạo.",
            current_time="2026-05-01 08:00:00",
        )
        self.assertIn("Khoa CNTT", prompt)
        self.assertIn("vui vẻ, năng động", prompt)
        self.assertIn("Khoa CNTT có 3 ngành đào tạo.", prompt)
        self.assertNotIn("Không có ngữ cảnh bổ sung.", prompt)

    def test_build_prompt_auto_time(self):
        """When current_time is not provided, it should auto-generate."""
        from app.ai.prompts.system_prompts import build_system_prompt
        prompt = build_system_prompt()
        # Should contain a date-like string (YYYY-MM-DD)
        self.assertRegex(prompt, r"\d{4}-\d{2}-\d{2}")


# ============================================================
# TEST 2: Chat Engine helpers (Pure functions)
# ============================================================
class TestChatEngineHelpers(unittest.TestCase):

    def test_build_messages_no_history(self):
        from app.ai.chat_engine import _build_messages
        msgs = _build_messages("Xin chào?", history=None)
        self.assertEqual(len(msgs), 1)
        self.assertEqual(msgs[0].role, "user")

    def test_build_messages_with_history(self):
        from app.ai.chat_engine import _build_messages
        history = [
            {"role": "user", "content": "Trường ở đâu?"},
            {"role": "assistant", "content": "Trường ở Trà Vinh."},
        ]
        msgs = _build_messages("Có mấy khoa?", history=history)
        self.assertEqual(len(msgs), 3)
        self.assertEqual(msgs[0].role, "user")
        self.assertEqual(msgs[1].role, "model")   # assistant → model
        self.assertEqual(msgs[2].role, "user")

    def test_build_config_no_thinking(self):
        from app.ai.chat_engine import _build_config
        config = _build_config("System prompt", enable_thinking=False, thinking_budget=0)
        self.assertIsNotNone(config.system_instruction)
        self.assertIsNone(config.thinking_config)

    def test_build_config_with_thinking(self):
        from app.ai.chat_engine import _build_config
        config = _build_config("System prompt", enable_thinking=True, thinking_budget=512)
        self.assertIsNotNone(config.thinking_config)
        self.assertEqual(config.thinking_config.thinking_budget, 512)

    def test_parse_response_with_thinking(self):
        from app.ai.chat_engine import _parse_response

        # Mock a Gemini response with thinking + answer parts
        thinking_part = MagicMock()
        thinking_part.thought = True
        thinking_part.text = "Let me think..."

        answer_part = MagicMock()
        answer_part.thought = False
        answer_part.function_call = None
        answer_part.text = "The answer is 42."

        candidate = MagicMock()
        candidate.content.parts = [thinking_part, answer_part]

        result = MagicMock()
        result.candidates = [candidate]
        result.usage_metadata = None

        answer, thinking, usage, function_calls = _parse_response(result)
        self.assertEqual(answer, "The answer is 42.")
        self.assertEqual(thinking, "Let me think...")
        self.assertEqual(usage, {})
        self.assertEqual(function_calls, [])

    def test_parse_response_empty_candidates(self):
        from app.ai.chat_engine import _parse_response
        result = MagicMock()
        result.candidates = []
        result.usage_metadata = None

        answer, thinking, usage, function_calls = _parse_response(result)
        self.assertEqual(answer, "")
        self.assertIsNone(thinking)
        self.assertEqual(function_calls, [])

    def test_parse_response_usage_metadata(self):
        from app.ai.chat_engine import _parse_response

        answer_part = MagicMock()
        answer_part.thought = False
        answer_part.function_call = None
        answer_part.text = "Hello"

        candidate = MagicMock()
        candidate.content.parts = [answer_part]

        usage_meta = MagicMock()
        usage_meta.prompt_token_count = 10
        usage_meta.candidates_token_count = 5
        usage_meta.total_token_count = 15

        result = MagicMock()
        result.candidates = [candidate]
        result.usage_metadata = usage_meta

        _, _, usage, function_calls = _parse_response(result)
        self.assertEqual(usage["prompt_tokens"], 10)
        self.assertEqual(usage["completion_tokens"], 5)
        self.assertEqual(usage["total_tokens"], 15)
        self.assertEqual(function_calls, [])


# ============================================================
# TEST 3: TTS Engine Cache (File I/O — uses temp dir)
# ============================================================
class TestTTSCache(unittest.TestCase):

    def setUp(self):
        self.tmp_dir = os.path.join(TEST_TMP_DIR, f"case-{uuid.uuid4().hex}")
        os.makedirs(self.tmp_dir, exist_ok=True)
        # Patch the CACHE_DIR to use temp directory
        import app.ai.tts_engine as tts_mod
        self._original_cache_dir = tts_mod.CACHE_DIR
        self._original_runtime_cache_dir = tts_mod.RUNTIME_CACHE_DIR
        tts_mod.CACHE_DIR = self.tmp_dir
        tts_mod.RUNTIME_CACHE_DIR = Path(self.tmp_dir) / "runtime"

    def tearDown(self):
        import app.ai.tts_engine as tts_mod
        tts_mod.CACHE_DIR = self._original_cache_dir
        tts_mod.RUNTIME_CACHE_DIR = self._original_runtime_cache_dir
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_cache_key_deterministic(self):
        from app.ai.tts_engine import _cache_key
        k1 = _cache_key("hello", "Kore")
        k2 = _cache_key("hello", "Kore")
        self.assertEqual(k1, k2)

    def test_cache_key_varies_by_voice(self):
        from app.ai.tts_engine import _cache_key
        k1 = _cache_key("hello", "Kore")
        k2 = _cache_key("hello", "Aoede")
        self.assertNotEqual(k1, k2)

    def test_cache_key_varies_by_persona(self):
        from app.ai.tts_engine import _cache_key
        k1 = _cache_key("hello", "Puck", "friendly", "Bạn là Kaito, hướng dẫn viên nam.")
        k2 = _cache_key("hello", "Puck", "friendly", "Bạn là ViVy, đại sứ sinh viên nữ.")
        self.assertNotEqual(k1, k2)

    def test_cache_miss(self):
        from app.ai.tts_engine import _get_cached, _cache_key
        key = _cache_key("nonexistent", "Kore")
        self.assertIsNone(_get_cached(key))

    def test_cache_roundtrip_wav(self):
        from app.ai.tts_engine import _get_cached, _save_cache, _cache_key, CONTENT_TYPE_WAV
        key = _cache_key("test", "Kore")
        data = b"\x00\x01\x02\x03"
        _save_cache(key, data, CONTENT_TYPE_WAV)
        result = _get_cached(key)
        self.assertIsNotNone(result)
        audio, ct = result
        self.assertEqual(audio, data)
        self.assertEqual(ct, CONTENT_TYPE_WAV)

    def test_cache_roundtrip_mp3(self):
        from app.ai.tts_engine import _get_cached, _save_cache, _cache_key, CONTENT_TYPE_MP3
        key = _cache_key("test_mp3", "HoaiMy")
        data = b"\xff\xfb\x90\x00"
        _save_cache(key, data, CONTENT_TYPE_MP3)
        result = _get_cached(key)
        self.assertIsNotNone(result)
        audio, ct = result
        self.assertEqual(audio, data)
        self.assertEqual(ct, CONTENT_TYPE_MP3)

    def test_runtime_cache_roundtrip(self):
        from app.ai.tts_engine import CONTENT_TYPE_WAV, get_runtime_cached, resolve_runtime_cache_file, save_runtime_cache

        filename = save_runtime_cache("a" * 32, b"wave-data", CONTENT_TYPE_WAV)
        self.assertEqual(filename, f"{'a' * 32}.wav")

        cached = get_runtime_cached("a" * 32)
        self.assertIsNotNone(cached)
        path, content_type, cached_filename = cached
        self.assertEqual(path.read_bytes(), b"wave-data")
        self.assertEqual(content_type, CONTENT_TYPE_WAV)
        self.assertEqual(cached_filename, filename)
        self.assertEqual(list(path.parent.glob("*.tmp")), [])

        resolved = resolve_runtime_cache_file(filename)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved[0], path)
        self.assertEqual(resolve_runtime_cache_file("../bad.wav"), None)
        self.assertEqual(get_runtime_cached("../bad"), None)
        with self.assertRaises(ValueError):
            save_runtime_cache("../bad", b"bad", CONTENT_TYPE_WAV)


# ============================================================
# TEST 4: Embedding Engine (Mocked API)
# ============================================================
class TestEmbeddingEngine(unittest.TestCase):

    @patch("app.ai.embedding_engine.get_client")
    @patch("app.ai.embedding_engine.get_settings")
    def test_embed_query(self, mock_settings, mock_client):
        from app.ai.embedding_engine import embed_query

        # Setup mock
        mock_settings.return_value = MagicMock(
            GEMINI_EMBEDDING_MODEL="gemini-embedding-001",
            GEMINI_EMBEDDING_DIMENSIONS=768,
        )
        mock_emb = MagicMock()
        mock_emb.values = [0.1] * 768
        mock_result = MagicMock()
        mock_result.embeddings = [mock_emb]
        mock_client.return_value.models.embed_content.return_value = mock_result

        vec = asyncio.run(embed_query("test query"))
        self.assertEqual(len(vec), 768)
        mock_client.return_value.models.embed_content.assert_called_once()

    @patch("app.ai.embedding_engine.get_client")
    @patch("app.ai.embedding_engine.get_settings")
    def test_embed_batch(self, mock_settings, mock_client):
        from app.ai.embedding_engine import embed_batch

        mock_settings.return_value = MagicMock(
            GEMINI_EMBEDDING_MODEL="gemini-embedding-001",
            GEMINI_EMBEDDING_DIMENSIONS=768,
        )
        mock_emb = MagicMock()
        mock_emb.values = [0.1] * 768
        mock_result = MagicMock()
        mock_result.embeddings = [mock_emb, mock_emb, mock_emb]
        mock_client.return_value.models.embed_content.return_value = mock_result

        vecs = asyncio.run(embed_batch(["a", "b", "c"], batch_size=10))
        self.assertEqual(len(vecs), 3)
        self.assertEqual(len(vecs[0]), 768)

    @patch("app.ai.embedding_engine.get_client")
    @patch("app.ai.embedding_engine.get_settings")
    def test_embed_batch_empty(self, mock_settings, mock_client):
        from app.ai.embedding_engine import embed_batch

        mock_settings.return_value = MagicMock(
            GEMINI_EMBEDDING_MODEL="gemini-embedding-001",
            GEMINI_EMBEDDING_DIMENSIONS=768,
        )
        vecs = asyncio.run(embed_batch([]))
        self.assertEqual(vecs, [])


# ============================================================
# TEST 5: Chat Engine (Mocked API)
# ============================================================
class TestChatEngine(unittest.TestCase):

    @patch("app.ai.chat_engine.get_client")
    @patch("app.ai.chat_engine.get_settings")
    def test_generate_response(self, mock_settings, mock_client):
        from app.ai.chat_engine import generate_response

        mock_settings.return_value = MagicMock(GEMINI_CHAT_MODEL="gemini-2.5-flash")

        answer_part = MagicMock()
        answer_part.thought = False
        answer_part.function_call = None
        answer_part.text = "Chào bạn!"

        candidate = MagicMock()
        candidate.content.parts = [answer_part]

        mock_result = MagicMock()
        mock_result.candidates = [candidate]
        mock_result.usage_metadata = None
        mock_client.return_value.models.generate_content.return_value = mock_result

        result = asyncio.run(generate_response("Xin chào"))
        self.assertEqual(result.text, "Chào bạn!")
        self.assertIsNone(result.thinking)

    @patch("app.ai.chat_engine.get_client")
    @patch("app.ai.chat_engine.get_settings")
    def test_generate_response_with_thinking(self, mock_settings, mock_client):
        from app.ai.chat_engine import generate_response

        mock_settings.return_value = MagicMock(GEMINI_CHAT_MODEL="gemini-2.5-flash")

        thinking_part = MagicMock()
        thinking_part.thought = True
        thinking_part.text = "Thinking..."

        answer_part = MagicMock()
        answer_part.thought = False
        answer_part.function_call = None
        answer_part.text = "Answer"

        candidate = MagicMock()
        candidate.content.parts = [thinking_part, answer_part]

        mock_result = MagicMock()
        mock_result.candidates = [candidate]
        mock_result.usage_metadata = None
        mock_client.return_value.models.generate_content.return_value = mock_result

        result = asyncio.run(generate_response("Test", enable_thinking=True))
        self.assertEqual(result.text, "Answer")
        self.assertEqual(result.thinking, "Thinking...")


# ============================================================
# TEST 6: TTS Engine (Mocked API)
# ============================================================
class TestTTSEngine(unittest.TestCase):

    def setUp(self):
        self.tmp_dir = os.path.join(TEST_TMP_DIR, f"case-{uuid.uuid4().hex}")
        os.makedirs(self.tmp_dir, exist_ok=True)
        import app.ai.tts_engine as tts_mod
        self._original_cache_dir = tts_mod.CACHE_DIR
        tts_mod.CACHE_DIR = self.tmp_dir

    def tearDown(self):
        import app.ai.tts_engine as tts_mod
        tts_mod.CACHE_DIR = self._original_cache_dir
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    @patch("app.ai.tts_engine.get_client")
    @patch("app.ai.tts_engine.get_settings")
    def test_synthesize_gemini(self, mock_settings, mock_client):
        from app.ai.tts_engine import synthesize, CONTENT_TYPE_WAV, _pcm_to_wav

        mock_settings.return_value = MagicMock(
            GEMINI_DEFAULT_VOICE="Kore",
            GEMINI_TTS_MODEL="gemini-2.5-flash-preview-tts",
            TTS_LOCAL_CACHE_ENABLED=False,
        )
        fake_audio = b"\x00" * 100
        inline_data = MagicMock()
        inline_data.data = fake_audio
        part = MagicMock()
        part.inline_data = inline_data
        candidate = MagicMock()
        candidate.content.parts = [part]
        mock_result = MagicMock()
        mock_result.candidates = [candidate]
        mock_client.return_value.models.generate_content.return_value = mock_result

        result = asyncio.run(synthesize("Hello"))
        self.assertEqual(result.audio_data, _pcm_to_wav(fake_audio))
        self.assertEqual(result.provider, "gemini")
        self.assertEqual(result.content_type, CONTENT_TYPE_WAV)
        self.assertFalse(result.cached)

    @patch("app.ai.tts_engine._edge_tts_fallback")
    @patch("app.ai.tts_engine.get_client")
    @patch("app.ai.tts_engine.get_settings")
    def test_synthesize_fallback(self, mock_settings, mock_client, mock_edge):
        from app.ai.tts_engine import synthesize, CONTENT_TYPE_MP3

        mock_settings.return_value = MagicMock(
            GEMINI_DEFAULT_VOICE="Kore",
            GEMINI_TTS_MODEL="gemini-2.5-flash-preview-tts",
            TTS_LOCAL_CACHE_ENABLED=False,
        )
        # Gemini raises error → trigger fallback
        mock_client.return_value.models.generate_content.side_effect = Exception("429 quota")

        fake_mp3 = b"\xff\xfb" * 50
        mock_edge.return_value = fake_mp3

        result = asyncio.run(
            synthesize(
                "Hello",
                voice_name="Puck",
                voice_style="friendly",
                personality_prompt="Bạn là Kaito, hướng dẫn viên nam.",
            )
        )
        self.assertEqual(result.audio_data, fake_mp3)
        self.assertEqual(result.provider, "edge-tts")
        self.assertEqual(result.content_type, CONTENT_TYPE_MP3)
        mock_edge.assert_called_once_with("Hello", "vi-VN-NamMinhNeural")

    @patch("app.ai.tts_engine.get_client")
    @patch("app.ai.tts_engine.get_settings")
    def test_synthesize_cache_hit(self, mock_settings, mock_client):
        from app.ai.tts_engine import synthesize, _save_cache, _cache_key, CONTENT_TYPE_WAV

        mock_settings.return_value = MagicMock(
            GEMINI_DEFAULT_VOICE="Kore",
            GEMINI_TTS_MODEL="gemini-2.5-flash-preview-tts",
            TTS_LOCAL_CACHE_ENABLED=True,
        )
        # Pre-fill cache
        key = _cache_key("cached text", "Kore")
        _save_cache(key, b"\x01\x02\x03", CONTENT_TYPE_WAV)

        result = asyncio.run(synthesize("cached text"))
        self.assertTrue(result.cached)
        self.assertEqual(result.provider, "cache")
        self.assertEqual(result.audio_data, b"\x01\x02\x03")
        # Gemini should NOT have been called
        mock_client.return_value.models.generate_content.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
