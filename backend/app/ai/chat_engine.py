"""
Chat Engine — Orchestrator for Chat + Thinking functionality.
"""

import asyncio
import logging
from dataclasses import dataclass, field

from google.api_core.exceptions import ResourceExhausted
from google.genai import types

from app.ai.core_client import get_client
from app.ai.prompts.system_prompts import build_system_prompt
from app.config import get_settings

logger = logging.getLogger(__name__)

# Retry config for 429 RESOURCE_EXHAUSTED
_MAX_RETRIES = 3
_BASE_DELAY = 1.0  # seconds — will double each retry (1s → 2s → 4s)


@dataclass
class ChatResult:
    """Structured result from a non-streaming chat call."""
    text: str
    thinking: str | None = None
    usage: dict = field(default_factory=dict)
    function_calls: list[dict] = field(default_factory=list)


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
    thinking_level: str | None = None,
) -> types.GenerateContentConfig:
    """Build GenerateContentConfig with optional thinking and tools."""
    config_args: dict = {
        "system_instruction": types.Content(
            parts=[types.Part.from_text(text=system_prompt)]
        )
    }
    normalized_level = str(thinking_level or "").strip().upper()
    if normalized_level not in {"", "DEFAULT", "AUTO"}:
        try:
            level = types.ThinkingLevel(normalized_level)
        except ValueError as exc:
            raise ValueError(
                f"Unsupported Gemini thinking level: {thinking_level}"
            ) from exc
        config_args["thinking_config"] = types.ThinkingConfig(
            thinking_level=level,
            include_thoughts=enable_thinking,
        )
    elif enable_thinking:
        config_args["thinking_config"] = types.ThinkingConfig(
            thinking_budget=thinking_budget,
            include_thoughts=True,
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

    # We rely entirely on native part.function_call from the Gemini API.
    # Removed the legacy text-based fallback because it incorrectly stripped valid text responses.

    usage_dict = {}
    usage = getattr(result, "usage_metadata", None)
    if usage:
        usage_dict = {
            "prompt_tokens": getattr(usage, "prompt_token_count", 0),
            "completion_tokens": getattr(usage, "candidates_token_count", 0),
            "thinking_tokens": getattr(usage, "thoughts_token_count", 0),
            "tool_prompt_tokens": getattr(usage, "tool_use_prompt_token_count", 0),
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
    prompt_mode: str = "answer",
    planned_actions: str = "",
    routing_guard: str = "",
    model_override: str | None = None,
    thinking_level_override: str | None = None,
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
        prompt_mode=prompt_mode,
        planned_actions=planned_actions,
        routing_guard=routing_guard,
    )

    messages = _build_messages(query, history)
    if prompt_mode == "agent":
        model = model_override or settings.GEMINI_AGENT_MODEL
        thinking_level = (
            thinking_level_override or settings.GEMINI_AGENT_THINKING_LEVEL
        )
    else:
        model = model_override or settings.GEMINI_ANSWER_MODEL
        thinking_level = (
            thinking_level_override or settings.GEMINI_ANSWER_THINKING_LEVEL
        )
    config = _build_config(
        system_prompt,
        enable_thinking,
        thinking_budget,
        tools=tools,
        thinking_level=thinking_level,
    )

    for attempt in range(_MAX_RETRIES + 1):
        try:
            result = await asyncio.to_thread(
                get_client().models.generate_content,
                model=model,
                contents=messages,
                config=config,
            )
            break
        except (ResourceExhausted, Exception) as e:
            is_rate_limit = (
                isinstance(e, ResourceExhausted)
                or "429" in str(e)
                or "RESOURCE_EXHAUSTED" in str(e)
            )
            if is_rate_limit and attempt < _MAX_RETRIES:
                delay = _BASE_DELAY * (2 ** attempt)
                logger.warning(
                    f"⏳ Chat rate limited (429), retrying in {delay:.1f}s "
                    f"(attempt {attempt + 1}/{_MAX_RETRIES})..."
                )
                await asyncio.sleep(delay)
                continue
            raise

    answer_text, thinking_text, usage_dict, function_calls = _parse_response(result)
    return ChatResult(
        text=answer_text,
        thinking=thinking_text,
        usage=usage_dict,
        function_calls=function_calls,
    )
