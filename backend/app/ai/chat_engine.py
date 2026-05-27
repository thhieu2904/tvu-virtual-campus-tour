"""
Chat Engine — Orchestrator for Chat + Thinking functionality.
"""

import asyncio
import json
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
    function_calls: list[dict] = field(default_factory=list)


@dataclass
class StreamChunk:
    """A single chunk yielded during streaming."""
    type: str    # "thinking" | "text" | "tool_call" | "done"
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
    tools: list | None = None,
) -> types.GenerateContentConfig:
    """Build GenerateContentConfig with optional thinking and tools."""
    config_args: dict = {
        "system_instruction": types.Content(
            parts=[types.Part.from_text(text=system_prompt)]
        )
    }
    if enable_thinking:
        config_args["thinking_config"] = types.ThinkingConfig(
            thinking_budget=thinking_budget
        )
    if tools:
        config_args["tools"] = tools
        # Disable auto function calling — we orchestrate manually in rag_service
        # because search tools need DB access that the SDK can't auto-invoke.
        config_args["automatic_function_calling"] = types.AutomaticFunctionCallingConfig(
            disable=True
        )
    return types.GenerateContentConfig(**config_args)


def _parse_response(result) -> tuple[str, str | None, dict, list[dict]]:
    """
    Parse a Gemini response into (answer_text, thinking_text, usage_dict, function_calls).
    Safely handles missing candidates, parts, and function_call parts.
    """
    thinking_parts: list[str] = []
    answer_parts: list[str] = []
    function_calls: list[dict] = []

    candidates = getattr(result, "candidates", None)
    if candidates and len(candidates) > 0:
        content = getattr(candidates[0], "content", None)
        if content and getattr(content, "parts", None):
            for part in content.parts:
                if getattr(part, "thought", False):
                    thinking_parts.append(part.text)
                elif getattr(part, "function_call", None):
                    fc = part.function_call
                    function_calls.append({
                        "name": fc.name,
                        "args": dict(fc.args) if fc.args else {},
                    })
                else:
                    answer_parts.append(part.text)

    thinking_text = "".join(thinking_parts).strip() or None
    answer_text = "".join(answer_parts).strip()

    # Robust fallback: Parse text-based tool calls if they were generated as raw text
    if answer_text and ("default_api." in answer_text or "tool_code" in answer_text):
        import re
        import json
        
        # Match print(default_api.tool_name(args...)) or default_api.tool_name(args...)
        pattern = r"(?:print\()?(?:default_api\.)?(\w+)\(([^)]*)\)\)?"
        matches = re.finditer(pattern, answer_text)
        
        seen_keys = set()
        for match in matches:
            tool_name = match.group(1)
            args_str = match.group(2)
            
            # Avoid matching standard explanations in thought blocks
            if tool_name in ["navigate_to", "show_media", "toggle_map", "search_documents"]:
                # Parse keyword arguments
                args = {}
                arg_pattern = r"(\w+)\s*=\s*(?:['\"]([^'\"]*)['\"]|([^\s,]+))"
                arg_matches = re.finditer(arg_pattern, args_str)
                for am in arg_matches:
                    key = am.group(1)
                    val = am.group(2) if am.group(2) is not None else am.group(3)
                    if val.lower() == 'true':
                        val = True
                    elif val.lower() == 'false':
                        val = False
                    args[key] = val
                
                # Deduplicate tool calls
                key = (tool_name, json.dumps(args, sort_keys=True))
                if key not in seen_keys:
                    seen_keys.add(key)
                    function_calls.append({
                        "name": tool_name,
                        "args": args
                    })
        
        # Clean answer_text to remove tool_code, print(default_api...), thought, and explanations
        lines = answer_text.split("\n")
        cleaned_lines = []
        for line in lines:
            stripped = line.strip()
            if stripped in ["tool_code", "thought"] or stripped.startswith("print(default_api.") or stripped.startswith("default_api."):
                continue
            if "The user wants to" in line or "tool call" in line or "appropriate" in line:
                continue
            cleaned_lines.append(line)
        answer_text = "\n".join(cleaned_lines).strip()

    usage_dict = {}
    usage = getattr(result, "usage_metadata", None)
    if usage:
        usage_dict = {
            "prompt_tokens": getattr(usage, "prompt_token_count", 0),
            "completion_tokens": getattr(usage, "candidates_token_count", 0),
            "total_tokens": getattr(usage, "total_token_count", 0),
        }

    return answer_text, thinking_text, usage_dict, function_calls


async def generate_response(
    query: str,
    rag_context: list[str] | None = None,
    history: list[dict] | None = None,
    location_name: str = "Sảnh Chính",
    voice_style: str = "thân thiện",
    personality_prompt: str = "Bạn là ViVy, đại sứ sinh viên nữ của Đại học Trà Vinh.",
    enable_thinking: bool = False,
    thinking_budget: int = 1024,
    tools: list | None = None,
    available_slugs: str = "",
) -> ChatResult:
    """
    Calls Gemini Flash with RAG context, history, and optional tools.
    Returns a structured ChatResult with text, thinking, usage, and function_calls.
    """
    settings = get_settings()

    rag_context_str = "\n".join(rag_context) if rag_context else ""
    system_prompt = build_system_prompt(
        location_name=location_name,
        voice_style=voice_style,
        personality_prompt=personality_prompt,
        rag_context=rag_context_str,
        available_slugs=available_slugs,
    )

    messages = _build_messages(query, history)
    config = _build_config(system_prompt, enable_thinking, thinking_budget, tools=tools)

    result = await asyncio.to_thread(
        get_client().models.generate_content,
        model=settings.GEMINI_CHAT_MODEL,
        contents=messages,
        config=config,
    )

    answer_text, thinking_text, usage_dict, function_calls = _parse_response(result)
    return ChatResult(
        text=answer_text,
        thinking=thinking_text,
        usage=usage_dict,
        function_calls=function_calls,
    )


async def generate_response_stream(
    query: str,
    rag_context: list[str] | None = None,
    history: list[dict] | None = None,
    location_name: str = "Sảnh Chính",
    voice_style: str = "thân thiện",
    personality_prompt: str = "Bạn là ViVy, đại sứ sinh viên nữ của Đại học Trà Vinh.",
    enable_thinking: bool = False,
    thinking_budget: int = 1024,
    tools: list | None = None,
    available_slugs: str = "",
) -> AsyncGenerator[StreamChunk, None]:
    """
    Stream response chunks via SSE.
    Uses an asyncio.Queue to bridge the blocking iterator from the SDK
    to the async generator consumed by FastAPI/SSE.

    Supports function_call chunks when tools are provided.
    """
    settings = get_settings()

    rag_context_str = "\n".join(rag_context) if rag_context else ""
    system_prompt = build_system_prompt(
        location_name=location_name,
        voice_style=voice_style,
        personality_prompt=personality_prompt,
        rag_context=rag_context_str,
        available_slugs=available_slugs,
    )

    messages = _build_messages(query, history)
    config = _build_config(system_prompt, enable_thinking, thinking_budget, tools=tools)

    queue: asyncio.Queue[StreamChunk | None] = asyncio.Queue()

    loop = asyncio.get_running_loop()

    def _iterate_stream():
        """Runs in a worker thread — iterates the blocking SDK stream."""
        try:
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
                        loop.call_soon_threadsafe(
                            queue.put_nowait,
                            StreamChunk(type="thinking", content=part.text),
                        )
                    elif getattr(part, "function_call", None):
                        fc = part.function_call
                        loop.call_soon_threadsafe(
                            queue.put_nowait,
                            StreamChunk(
                                type="tool_call",
                                content=json.dumps({
                                    "name": fc.name,
                                    "args": dict(fc.args) if fc.args else {},
                                }, ensure_ascii=False),
                            ),
                        )
                    else:
                        loop.call_soon_threadsafe(
                            queue.put_nowait,
                            StreamChunk(type="text", content=part.text),
                        )
        except Exception as e:
            # Send error to queue if it fails
            loop.call_soon_threadsafe(
                queue.put_nowait,
                StreamChunk(type="error", content=f"Xin lỗi, có lỗi kết nối với AI ({str(e)})."),
            )
        finally:
            # Signal completion
            loop.call_soon_threadsafe(queue.put_nowait, None)

    # Start the blocking iteration in a background thread
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
