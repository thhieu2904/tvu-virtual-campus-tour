"""Focused tests for the split SSE/JSON chat contracts."""

import asyncio
import json
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
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


class TestToolValidation(unittest.TestCase):
    def test_unknown_slug_is_dropped_with_fuzzy_suggestion_in_log(self):
        from app.services.rag_service import validate_tool_actions

        db_result = MagicMock()
        db_result.all.return_value = [("cong-chinh", "Cổng chính TVU")]
        session = MagicMock()
        session.execute = AsyncMock(return_value=db_result)
        actions = [
            {
                "name": "navigate_to",
                "args": {"location_slug": "cong-chihn"},
            }
        ]

        with self.assertLogs("app.services.rag_service", level="WARNING") as logs:
            validated = asyncio.run(validate_tool_actions(session, actions))

        self.assertEqual(validated, [])
        message = "\n".join(logs.output)
        self.assertIn("slug='cong-chihn'", message)
        self.assertIn("active_slugs=['cong-chinh']", message)
        self.assertIn("closest_match=cong-chinh", message)


class TestPseudoToolRecovery(unittest.TestCase):
    def test_recovers_navigation_and_drops_tool_and_thought_markup(self):
        from app.services.rag_service import recover_pseudo_tool_actions

        raw = (
            "tool_code\n"
            "print(default_api.navigate_to(location_slug='cong-chinh'))\n"
            "thought\n"
            "Internal reasoning must not reach the user."
            "Mình đưa bạn về Cổng chính nhé!"
        )
        answer, tools = recover_pseudo_tool_actions(raw)

        self.assertEqual(answer, "")
        self.assertEqual(
            tools,
            [
                {
                    "name": "navigate_to",
                    "args": {"location_slug": "cong-chinh"},
                }
            ],
        )


    def test_main_hall_navigation_intent_gets_start_location_tool(self):
        from app.services.rag_service import apply_navigation_fallback

        db_result = MagicMock()
        db_result.scalar_one_or_none.return_value = "cong-chinh"
        session = MagicMock()
        session.execute = AsyncMock(return_value=db_result)

        tools, applied = asyncio.run(
            apply_navigation_fallback(session, "đưa mình lại sảnh nha", [])
        )

        self.assertTrue(applied)
        self.assertEqual(
            tools,
            [
                {
                    "name": "navigate_to",
                    "args": {"location_slug": "cong-chinh"},
                }
            ],
        )


    def test_main_hall_fallback_is_not_applied_without_start_location(self):
        from app.services.rag_service import apply_navigation_fallback

        db_result = MagicMock()
        db_result.scalar_one_or_none.return_value = None
        session = MagicMock()
        session.execute = AsyncMock(return_value=db_result)

        with self.assertLogs("app.services.rag_service", level="WARNING") as logs:
            tools, applied = asyncio.run(
                apply_navigation_fallback(session, "đưa mình lại sảnh nha", [])
            )

        self.assertFalse(applied)
        self.assertEqual(tools, [])
        self.assertIn("no active start location", "\n".join(logs.output))


class TestResponseFallbacks(unittest.TestCase):
    def test_empty_answer_and_no_tools_gets_clarification(self):
        from app.services.rag_service import ensure_response_text

        answer = asyncio.run(ensure_response_text(MagicMock(), "", []))
        self.assertEqual(
            answer,
            "Mình chưa hiểu ý bạn lắm, bạn có thể nói rõ hơn không?",
        )

    def test_tool_only_navigation_gets_location_intro(self):
        from app.services.rag_service import ensure_response_text

        db_result = MagicMock()
        db_result.scalar_one_or_none.return_value = "Sảnh Chính"
        session = MagicMock()
        session.execute = AsyncMock(return_value=db_result)
        tools = [
            {
                "name": "navigate_to",
                "args": {"location_slug": "sanh-chinh"},
            }
        ]

        answer = asyncio.run(ensure_response_text(session, None, tools))
        self.assertEqual(answer, "Được rồi, mình đưa bạn tới Sảnh Chính nhé!")

    def test_non_navigation_tool_only_gets_generic_intro(self):
        from app.services.rag_service import ensure_response_text

        tools = [{"name": "toggle_map", "args": {"state": "open"}}]
        answer = asyncio.run(ensure_response_text(MagicMock(), "   ", tools))
        self.assertEqual(answer, "Được rồi, mình xử lý ngay nhé!")


class TestChatContracts(unittest.TestCase):
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

    def test_text_stream_never_waits_for_or_emits_audio(self):
        from app.routers.chat import _stream_chat_events
        from app.schemas.chat import ChatRequest

        request = ChatRequest(message="Xin chào", stream=True, tts=False)
        background_tasks = BackgroundTasks()
        result = {
            "answer": "Chào bạn!",
            "tool_actions": [],
            "sources": [],
            "response_time_ms": 123,
            "timings": {"gemini_round1_ms": 100.0},
        }

        async def run_test():
            with (
                patch("app.routers.chat.async_session", return_value=_FakeSessionContext()),
                patch(
                    "app.routers.chat._get_chat_result",
                    new=AsyncMock(return_value=(result, False)),
                ),
                patch(
                    "app.routers.chat.chat_tts_service.resolve_chat_audio",
                    new=AsyncMock(),
                ) as resolve_audio,
            ):
                stream = _stream_chat_events(
                    request=request,
                    background_tasks=background_tasks,
                    location_name="Sảnh Chính",
                    personality_prompt=None,
                    voice_style=None,
                )
                events = [event async for event in stream]

                self.assertEqual(
                    [event["event"] for event in events],
                    ["start", "answer", "sources", "done"],
                )
                resolve_audio.assert_not_awaited()
                done = json.loads(events[-1]["data"])
                self.assertFalse(done["has_audio"])

        asyncio.run(run_test())

    def test_sse_emits_error_event_when_pipeline_fails(self):
        from app.routers.chat import _stream_chat_events
        from app.schemas.chat import ChatRequest

        async def run_test():
            with (
                patch("app.routers.chat.async_session", return_value=_FakeSessionContext()),
                patch(
                    "app.routers.chat._get_chat_result",
                    new=AsyncMock(side_effect=RuntimeError("pipeline failed")),
                ),
            ):
                stream = _stream_chat_events(
                    request=ChatRequest(message="Xin chào", stream=True, tts=False),
                    background_tasks=BackgroundTasks(),
                    location_name="Sảnh Chính",
                    personality_prompt=None,
                    voice_style=None,
                )
                events = [event async for event in stream]

            self.assertEqual([event["event"] for event in events], ["start", "error"])
            start = json.loads(events[0]["data"])
            error = json.loads(events[1]["data"])
            self.assertEqual(error["request_id"], start["request_id"])
            self.assertEqual(error["code"], "CHAT_FAILED")
            self.assertFalse(error["recoverable"])

        asyncio.run(run_test())

    def test_tts_true_overrides_stream_and_returns_one_json_response(self):
        from app.routers.chat import chat
        from app.schemas.chat import ChatRequest

        request = ChatRequest(message="Xin chào", stream=True, tts=True)
        result = {
            "answer": "Chào bạn!",
            "tool_actions": [],
            "sources": [],
            "response_time_ms": 123,
            "timings": {"gemini_round1_ms": 100.0},
            "audio_url": "https://example.test/audio.wav",
            "audio_content_type": "audio/wav",
            "tts_provider": "cache",
        }

        async def run_test():
            with (
                patch(
                    "app.routers.chat._get_chat_result",
                    new=AsyncMock(return_value=(result, True)),
                ),
                patch(
                    "app.routers.chat.chat_tts_service.resolve_chat_audio",
                    new=AsyncMock(),
                ) as resolve_audio,
            ):
                response = await chat(
                    request=request,
                    api_request=MagicMock(),
                    background_tasks=BackgroundTasks(),
                    session=MagicMock(),
                )

            resolve_audio.assert_not_awaited()
            self.assertIsInstance(response, JSONResponse)
            payload = json.loads(response.body)
            self.assertEqual(payload["answer"], "Chào bạn!")
            self.assertEqual(payload["audio_url"], "https://example.test/audio.wav")
            self.assertEqual(payload["tts_provider"], "cache")
            self.assertTrue(payload["request_id"])
            self.assertIn("total_ms", payload["timing"])

        asyncio.run(run_test())

    def test_invalid_location_id_returns_422_before_db_lookup(self):
        from app.routers.chat import _validated_location_id

        with self.assertRaises(HTTPException) as context:
            _validated_location_id("not-a-uuid")
        self.assertEqual(context.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main(verbosity=2)
