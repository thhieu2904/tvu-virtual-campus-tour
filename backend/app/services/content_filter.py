"""Small deterministic safety filter for kiosk chat input and output."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

SAFE_REFUSAL_MESSAGE = (
    "Mình không thể hỗ trợ nội dung đó. "
    "Mình có thể giúp bạn tìm hiểu về Đại học Trà Vinh, tham quan khuôn viên "
    "hoặc sử dụng bản đồ."
)

SELF_HARM_SUPPORT_MESSAGE = (
    "Mình rất tiếc vì bạn đang gặp chuyện khó khăn. "
    "Nếu bạn có nguy cơ làm hại bản thân, hãy gọi ngay 115 hoặc tìm một người "
    "đáng tin cậy ở gần bạn để được hỗ trợ trực tiếp."
)


@dataclass(frozen=True)
class FilterResult:
    is_safe: bool
    filtered_text: str
    violations: list[str]


_PATTERNS: dict[str, tuple[re.Pattern[str], ...]] = {
    "sexual_explicit": (
        re.compile(r"\b(?:khiêu\s*dâm|ấu\s*dâm|quan\s*hệ\s*tình\s*dục)\b", re.IGNORECASE),
        re.compile(r"\b(?:porn|porno|sex\s*video|ảnh\s*sex)\b", re.IGNORECASE),
        re.compile(r"\b(?:địt|đụ|lồn|cặc)\b", re.IGNORECASE),
    ),
    "hate_or_harassment": (
        re.compile(r"\b(?:đồ\s*ngu|óc\s*chó|súc\s*vật)\b", re.IGNORECASE),
        re.compile(
            r"\b(?:giết|đuổi|tiêu\s*diệt)\b.{0,30}\b(?:dân\s*tộc|tôn\s*giáo|người\s*khuyết\s*tật)\b",
            re.IGNORECASE,
        ),
    ),
    "dangerous_instructions": (
        re.compile(
            r"\b(?:cách|hướng\s*dẫn|làm\s*sao)\b.{0,50}"
            r"\b(?:chế|chế\s*tạo|làm)\b.{0,30}"
            r"\b(?:bom|thuốc\s*nổ|vũ\s*khí|chất\s*độc)\b",
            re.IGNORECASE,
        ),
        re.compile(
            r"\b(?:cách|hướng\s*dẫn|làm\s*sao)\b.{0,50}"
            r"\b(?:hack|phá|xâm\s*nhập)\b.{0,30}"
            r"\b(?:tài\s*khoản|hệ\s*thống|máy\s*chủ)\b",
            re.IGNORECASE,
        ),
        re.compile(
            r"\b(?:đầu\s*độc|giết|tấn\s*công)\b.{0,40}\b(?:ai\s*đó|một\s*người|người\s*khác)\b",
            re.IGNORECASE,
        ),
    ),
    "self_harm": (
        re.compile(r"\b(?:cách|muốn|định|làm\s*sao)\b.{0,30}\b(?:tự\s*tử|tự\s*sát)\b", re.IGNORECASE),
        re.compile(r"\b(?:tự\s*làm\s*hại|cắt\s*tay)\b.{0,20}\b(?:bản\s*thân|mình)\b", re.IGNORECASE),
    ),
}


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", str(text or "")).strip()


def filter_text(text: str) -> FilterResult:
    """Return a safe replacement when deterministic rules detect a violation."""
    normalized = _normalize(text)
    violations = [
        category
        for category, patterns in _PATTERNS.items()
        if any(pattern.search(normalized) for pattern in patterns)
    ]
    if not violations:
        return FilterResult(is_safe=True, filtered_text=normalized, violations=[])

    replacement = (
        SELF_HARM_SUPPORT_MESSAGE
        if "self_harm" in violations
        else SAFE_REFUSAL_MESSAGE
    )
    return FilterResult(
        is_safe=False,
        filtered_text=replacement,
        violations=violations,
    )


def filter_input(text: str) -> FilterResult:
    return filter_text(text)


def filter_output(text: str) -> FilterResult:
    return filter_text(text)
