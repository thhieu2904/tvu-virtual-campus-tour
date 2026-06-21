"""Focused tests for the unified chat SSE contract."""

import asyncio
import json
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import BackgroundTasks
from pydantic import ValidationError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class _FakeSessionContext:
    async def __aenter__(self):
        return MagicMock()

    async def __aexit__(self, exc_type, exc, tb):
        return False


class TestToolActionSchemas(unittest.TestCase):
    def test_valid_tool_action_is_normalized(self):
        from app.schemas.chat import TOOL_ACTION_ADAPTER

        action = TOOL_ACTION_ADAPTER.validate_python(
            {"name": "toggle_map", "args": {"state": "open"}}
        )
        self.assertEqual(
            action.model_dump(exclude_none=True),
            {"name": "toggle_map", "args": {"state": "open"}},
        )

    def test_invalid_tool_action_is_rejected(self):
        from app.schemas.chat import TOOL_ACTION_ADAPTER

        with self.assertRaises(ValidationError):
            TOOL_ACTION_ADAPTER.validate_python(
                {"name": "show_media", "args": {"media_type": "document"}}
            )


class TestSseContract(unittest.TestCase):
    def test_build_sse_event_encodes_payload_once(self):
        from app.routers.chat import build_sse_event

        event = build_sse_event(
            "tool_actions",
            {"actions": [{"name": "toggle_map", "args": {"state": "open"}}]},
        )
        payload = json.loads(event["data"])
        self.assertEqual(event["event"], "tool_actions")
        self.assertIsInstance(payload["actions"], list)
        self.assertIsInstance(payload["actions"][0], dict)

    def test_stream_emits_answer_before_tts_is_awaited(self):
        from app.routers.chat import _stream_chat_events
        from app.schemas.chat import ChatRequest
        from app.services.chat_tts_service import ChatAudioResult

        request = ChatRequest(message="Xin chào", stream=True, tts=True)
        api_request = MagicMock()
        api_request.is_disconnected = AsyncMock(return_value=False)
        background_tasks = BackgroundTasks()
        result = {
            "answer": "Chào bạn!",
            "tool_actions": [],
            "sources": [],
            "response_time_ms": 123,
            "timings": {"gemini_round1_ms": 100.0},
        }
        audio = ChatAudioResult(
            audio_url="https://example.test/audio.wav",
            provider="cache",
            content_type="audio/wav",
            cache_status="r2",
        )

        async def run_test():
            with (
                patch("app.routers.chat.async_session", return_value=_FakeSessionContext()),
                patch("app.routers.chat._get_chat_result", new=AsyncMock(return_value=(result, False))),
                patch(
                    "app.routers.chat.chat_tts_service.resolve_chat_audio",
                    new=AsyncMock(return_value=audio),
                ) as resolve_audio,
            ):
                stream = _stream_chat_events(
                    request=request,
                    api_request=api_request,
                    background_tasks=background_tasks,
                    location=None,
                    location_name="Sảnh Chính",
                    personality_prompt=None,
                    voice_style=None,
                )

                start_event = await anext(stream)
                answer_event = await anext(stream)
                sources_event = await anext(stream)
                self.assertEqual(start_event["event"], "start")
                self.assertEqual(answer_event["event"], "answer")
                self.assertEqual(sources_event["event"], "sources")
                resolve_audio.assert_not_awaited()

                audio_event = await anext(stream)
                done_event = await anext(stream)
                self.assertEqual(audio_event["event"], "audio_ready")
                self.assertEqual(done_event["event"], "done")
                resolve_audio.assert_awaited_once()

                with self.assertRaises(StopAsyncIteration):
                    await anext(stream)

        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main(verbosity=2)
