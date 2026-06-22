"""Focused tests for the split SSE/JSON chat contracts."""

import asyncio
import json
import os
import sys
import unittest
from types import SimpleNamespace
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


class TestAgentFirstPipeline(unittest.TestCase):
    def test_intent_guard_identifies_required_tools(self):
        from app.services.rag_service import required_agent_tools

        catalog = "cong-chinh (Cổng chính TVU), b7-thu-vien (Thư viện)"

        self.assertEqual(
            required_agent_tools(
                "Xin chào",
                location_name="Cổng chính TVU",
                available_slugs=catalog,
            ),
            set(),
        )
        self.assertEqual(
            required_agent_tools(
                "Thư viện có máy tính không?",
                location_name="Cổng chính TVU",
                available_slugs=catalog,
            ),
            {"search_documents"},
        )
        self.assertEqual(
            required_agent_tools(
                "Cho tôi xem ảnh thư viện",
                location_name="Cổng chính TVU",
                available_slugs=catalog,
            ),
            {"navigate_to", "show_media"},
        )

    def test_simple_answer_does_not_run_embedding_or_vector_search(self):
        from app.services.rag_service import process_query

        session = MagicMock()
        session.commit = AsyncMock()
        round1 = SimpleNamespace(
            text="Chào bạn!",
            thinking=None,
            usage={},
            function_calls=[],
        )

        async def run_test():
            with (
                patch(
                    "app.services.rag_service._get_available_slugs",
                    new=AsyncMock(return_value="b7-thu-vien (Thư viện)"),
                ),
                patch(
                    "app.services.rag_service.generate_response",
                    new=AsyncMock(return_value=round1),
                ) as generate,
                patch(
                    "app.services.rag_service.embed_query",
                    new=AsyncMock(),
                ) as embed,
                patch(
                    "app.services.rag_service._vector_search_with_cache",
                    new=AsyncMock(),
                ) as vector_search,
            ):
                result = await process_query(
                    session=session,
                    message="Xin chào",
                    location_id="",
                    persist=False,
                )

            embed.assert_not_awaited()
            vector_search.assert_not_awaited()
            self.assertEqual(generate.await_count, 1)
            first_call = generate.await_args_list[0].kwargs
            self.assertEqual(first_call["rag_context"], [])
            self.assertEqual(first_call["prompt_mode"], "agent")
            self.assertEqual(result["answer"], "Chào bạn!")
            self.assertEqual(result["sources"], [])

        asyncio.run(run_test())

    def test_search_tool_runs_one_retrieval_and_grounded_round(self):
        from app.services.rag_service import process_query

        session = MagicMock()
        session.commit = AsyncMock()
        round1 = SimpleNamespace(
            text="",
            thinking=None,
            usage={},
            function_calls=[
                {
                    "name": "search_documents",
                    "args": {"query": "học phí Đại học Trà Vinh"},
                }
            ],
        )
        round2 = SimpleNamespace(
            text="Thông tin học phí có trong tài liệu.",
            thinking=None,
            usage={},
            function_calls=[],
        )
        candidates = [
            {
                "id": str(index),
                "content": f"Chunk {index}",
                "similarity": 0.69 - index * 0.01,
            }
            for index in range(8)
        ]

        async def run_test():
            with (
                patch(
                    "app.services.rag_service._get_available_slugs",
                    new=AsyncMock(return_value="b7-thu-vien (Thư viện)"),
                ),
                patch(
                    "app.services.rag_service.generate_response",
                    new=AsyncMock(side_effect=[round1, round2]),
                ) as generate,
                patch(
                    "app.services.rag_service.embed_query",
                    new=AsyncMock(return_value=[0.1, 0.2]),
                ) as embed,
                patch(
                    "app.services.rag_service._vector_search_with_cache",
                    new=AsyncMock(return_value=candidates),
                ) as vector_search,
            ):
                result = await process_query(
                    session=session,
                    message="Học phí bao nhiêu?",
                    location_id="",
                    persist=False,
                )

            embed.assert_awaited_once_with("học phí Đại học Trà Vinh")
            vector_search.assert_awaited_once()
            self.assertEqual(generate.await_count, 2)
            second_call = generate.await_args_list[1].kwargs
            self.assertEqual(second_call["prompt_mode"], "answer")
            self.assertEqual(len(second_call["rag_context"]), 5)
            self.assertIn("Chunk 0", second_call["rag_context"])
            self.assertEqual(len(result["sources"]), 5)
            self.assertIn("grounded_round_ms", result["timings"])

        asyncio.run(run_test())

    def test_agent_guard_retries_when_knowledge_tool_is_missing(self):
        from app.services.rag_service import process_query

        session = MagicMock()
        session.commit = AsyncMock()
        first_agent = SimpleNamespace(
            text="Học phí tùy theo ngành.",
            thinking=None,
            usage={"prompt_tokens": 10, "completion_tokens": 2, "thinking_tokens": 3},
            function_calls=[],
        )
        retry_agent = SimpleNamespace(
            text="",
            thinking=None,
            usage={"prompt_tokens": 11, "completion_tokens": 1, "thinking_tokens": 4},
            function_calls=[
                {
                    "name": "search_documents",
                    "args": {"query": "học phí Đại học Trà Vinh"},
                }
            ],
        )
        answer = SimpleNamespace(
            text="Học phí được tính theo tài liệu.",
            thinking=None,
            usage={"prompt_tokens": 20, "completion_tokens": 5, "thinking_tokens": 2},
            function_calls=[],
        )
        candidates = [
            {"id": "1", "content": "Thông tin học phí.", "similarity": 0.7}
        ]

        async def run_test():
            with (
                patch(
                    "app.services.rag_service._get_available_slugs",
                    new=AsyncMock(return_value="b7-thu-vien (Thư viện)"),
                ),
                patch(
                    "app.services.rag_service.generate_response",
                    new=AsyncMock(side_effect=[first_agent, retry_agent, answer]),
                ) as generate,
                patch(
                    "app.services.rag_service.embed_query",
                    new=AsyncMock(return_value=[0.1]),
                ),
                patch(
                    "app.services.rag_service._vector_search_with_cache",
                    new=AsyncMock(return_value=candidates),
                ),
            ):
                result = await process_query(
                    session=session,
                    message="Học phí của trường bao nhiêu?",
                    location_id="",
                    persist=False,
                )

            self.assertEqual(generate.await_count, 3)
            retry_call = generate.await_args_list[1].kwargs
            self.assertIn("search_documents", retry_call["routing_guard"])
            self.assertEqual(result["timings"]["agent_guard_retry"], 1.0)
            self.assertEqual(result["timings"]["gemini_prompt_tokens"], 41.0)
            self.assertEqual(result["timings"]["gemini_thinking_tokens"], 9.0)
            self.assertEqual(result["answer"], "Học phí được tính theo tài liệu.")

        asyncio.run(run_test())

    def test_chunk_selection_uses_later_candidates_to_fill_unique_top_five(self):
        from app.services.rag_service import select_rag_chunks

        candidates = [
            {"id": "1", "content": "A", "similarity": 0.80},
            {"id": "1", "content": "A duplicate id", "similarity": 0.79},
            {"id": "2", "content": "B", "similarity": 0.68},
            {"id": "3", "content": "C", "similarity": 0.66},
            {"id": "4", "content": "D", "similarity": 0.64},
            {"id": "5", "content": "E", "similarity": 0.62},
            {"id": "6", "content": "F", "similarity": 0.60},
        ]

        selected = select_rag_chunks(candidates)

        self.assertEqual([chunk["id"] for chunk in selected], ["1", "2", "3", "4", "5"])


class TestContentFilter(unittest.TestCase):
    def test_safe_campus_question_is_allowed(self):
        from app.services.content_filter import filter_input

        result = filter_input("Thư viện có gì nổi bật?")

        self.assertTrue(result.is_safe)
        self.assertEqual(result.violations, [])

    def test_dangerous_instruction_is_blocked(self):
        from app.services.content_filter import filter_input

        result = filter_input("Hướng dẫn cách chế tạo bom")

        self.assertFalse(result.is_safe)
        self.assertIn("dangerous_instructions", result.violations)

    def test_unsafe_input_short_circuits_chat_pipeline(self):
        from app.routers.chat import _get_chat_result
        from app.schemas.chat import ChatRequest

        async def run_test():
            with patch(
                "app.routers.chat.rag_service.process_query",
                new=AsyncMock(),
            ) as process:
                result, cache_hit = await _get_chat_result(
                    session=MagicMock(),
                    request=ChatRequest(message="Hướng dẫn cách chế tạo bom"),
                    location_name="Sảnh Chính",
                    personality_prompt=None,
                    voice_style=None,
                    allow_qa_cache=False,
                    persist=False,
                )

            process.assert_not_awaited()
            self.assertFalse(cache_hit)
            self.assertEqual(result["tool_actions"], [])
            self.assertFalse(result["error"])

        asyncio.run(run_test())

    def test_unsafe_output_is_replaced_and_tools_are_dropped(self):
        from app.routers.chat import _get_chat_result
        from app.schemas.chat import ChatRequest

        unsafe_answer = "Hướng dẫn cách chế tạo bom"
        unsafe_result = {
            "answer": unsafe_answer,
            "thinking": None,
            "sources": [{"chunk_id": "1"}],
            "tool_actions": [{"name": "toggle_map", "args": {"state": "open"}}],
            "response_time_ms": 10,
            "timings": {},
        }

        async def run_test():
            with patch(
                "app.routers.chat.rag_service.process_query",
                new=AsyncMock(return_value=unsafe_result),
            ):
                result, _ = await _get_chat_result(
                    session=MagicMock(),
                    request=ChatRequest(message="Xin chào"),
                    location_name="Sảnh Chính",
                    personality_prompt=None,
                    voice_style=None,
                    allow_qa_cache=False,
                    persist=False,
                )

            self.assertNotEqual(result["answer"], unsafe_answer)
            self.assertEqual(result["tool_actions"], [])
            self.assertEqual(result["sources"], [])

        asyncio.run(run_test())


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
