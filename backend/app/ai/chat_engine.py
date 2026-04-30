"""
Chat Engine — Orchestrator for Chat + Thinking functionality.
"""

import asyncio
from dataclasses import dataclass, field
from typing import AsyncGenerator
from google.genai import types

from app.ai.core_client import get_client
from app.config import get_settings
from app.ai.prompts.system_prompts import build_system_prompt


@dataclass
class ChatResult:
    """Structured result from a non-streaming chat call."""
    text: str
    thinking: str | None = None
    usage: dict = field(default_factory=dict)


@dataclass
class StreamChunk:
    """A single chunk yielded during streaming."""
    type: str    # "thinking" | "text" | "done"
    content: str


def _build_messages(
    query: str,
    history: list[dict] | None,
) -> list[types.Content]:
    """Build the list of Content messages from history + current query."""
    messages = []
    if history:
        for msg in history:
            role = "model" if msg["role"] == "assistant" else "user"
            messages.append(
                types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])])
            )
    messages.append(
        types.Content(role="user", parts=[types.Part.from_text(text=query)])
    )
    return messages


def _build_config(
    system_prompt: str,
    enable_thinking: bool,
    thinking_budget: int,
) -> types.GenerateContentConfig:
    """Build GenerateContentConfig with optional thinking."""
    config_args: dict = {
        "system_instruction": types.Content(
            parts=[types.Part.from_text(text=system_prompt)]
        )
    }
    if enable_thinking:
        config_args["thinking_config"] = types.ThinkingConfig(
            thinking_budget=thinking_budget
        )
    return types.GenerateContentConfig(**config_args)


def _parse_response(result) -> tuple[str, str | None, dict]:
    """
    Parse a Gemini response into (answer_text, thinking_text, usage_dict).
    Safely handles missing candidates or parts.
    """
    thinking_parts: list[str] = []
    answer_parts: list[str] = []

    candidates = getattr(result, "candidates", None)
    if candidates and len(candidates) > 0:
        content = getattr(candidates[0], "content", None)
        if content and getattr(content, "parts", None):
            for part in content.parts:
                if getattr(part, "thought", False):
                    thinking_parts.append(part.text)
                else:
                    answer_parts.append(part.text)

    thinking_text = "".join(thinking_parts).strip() or None
    answer_text = "".join(answer_parts).strip()

    usage_dict = {}
    usage = getattr(result, "usage_metadata", None)
    if usage:
        usage_dict = {
            "prompt_tokens": getattr(usage, "prompt_token_count", 0),
            "completion_tokens": getattr(usage, "candidates_token_count", 0),
            "total_tokens": getattr(usage, "total_token_count", 0),
        }

    return answer_text, thinking_text, usage_dict


async def generate_response(
    query: str,
    rag_context: list[str] | None = None,
    history: list[dict] | None = None,
    location_name: str = "Sảnh Chính",
    voice_style: str = "thân thiện",
    enable_thinking: bool = False,
    thinking_budget: int = 1024,
) -> ChatResult:
    """
    Calls Gemini Flash with RAG context and history.
    Returns a structured ChatResult with text, thinking, and usage.
    """
    settings = get_settings()

    rag_context_str = "\n".join(rag_context) if rag_context else ""
    system_prompt = build_system_prompt(
        location_name=location_name,
        voice_style=voice_style,
        rag_context=rag_context_str,
    )

    messages = _build_messages(query, history)
    config = _build_config(system_prompt, enable_thinking, thinking_budget)

    result = await asyncio.to_thread(
        get_client().models.generate_content,
        model=settings.GEMINI_CHAT_MODEL,
        contents=messages,
        config=config,
    )

    answer_text, thinking_text, usage_dict = _parse_response(result)
    return ChatResult(text=answer_text, thinking=thinking_text, usage=usage_dict)


async def generate_response_stream(
    query: str,
    rag_context: list[str] | None = None,
    history: list[dict] | None = None,
    location_name: str = "Sảnh Chính",
    voice_style: str = "thân thiện",
    enable_thinking: bool = False,
    thinking_budget: int = 1024,
) -> AsyncGenerator[StreamChunk, None]:
    """
    Stream response chunks via SSE.
    Uses an asyncio.Queue to bridge the blocking iterator from the SDK
    to the async generator consumed by FastAPI/SSE.
    """
    settings = get_settings()

    rag_context_str = "\n".join(rag_context) if rag_context else ""
    system_prompt = build_system_prompt(
        location_name=location_name,
        voice_style=voice_style,
        rag_context=rag_context_str,
    )

    messages = _build_messages(query, history)
    config = _build_config(system_prompt, enable_thinking, thinking_budget)

    queue: asyncio.Queue[StreamChunk | None] = asyncio.Queue()

    def _iterate_stream():
        """Runs in a worker thread — iterates the blocking SDK stream."""
        stream = get_client().models.generate_content_stream(
            model=settings.GEMINI_CHAT_MODEL,
            contents=messages,
            config=config,
        )
        for chunk in stream:
            candidates = getattr(chunk, "candidates", None)
            if not candidates:
                continue
            content = getattr(candidates[0], "content", None)
            if not content or not getattr(content, "parts", None):
                continue
            for part in content.parts:
                if getattr(part, "thought", False):
                    asyncio.get_event_loop().call_soon_threadsafe(
                        queue.put_nowait,
                        StreamChunk(type="thinking", content=part.text),
                    )
                else:
                    asyncio.get_event_loop().call_soon_threadsafe(
                        queue.put_nowait,
                        StreamChunk(type="text", content=part.text),
                    )
        # Signal completion
        asyncio.get_event_loop().call_soon_threadsafe(queue.put_nowait, None)

    # Start the blocking iteration in a background thread
    loop = asyncio.get_running_loop()
    task = loop.run_in_executor(None, _iterate_stream)

    # Yield chunks as they arrive in the queue
    while True:
        chunk = await queue.get()
        if chunk is None:
            break
        yield chunk

    # Ensure the thread has finished
    await task

    yield StreamChunk(type="done", content="")
