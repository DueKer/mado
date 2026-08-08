# ============================================================
# MADO Backend - 对话历史压缩
# 移植自 frontend src/lib/memory/context-compression.ts
# ============================================================

from __future__ import annotations

import math
import re
import time
from dataclasses import dataclass, field
from typing import Optional

from app.agents.state import ConversationMessage

DEFAULT_MAX_TOKENS = 60000
DEFAULT_KEEP_RECENT = 3

_CHINESE_RE = re.compile(r"[\u4e00-\u9fa5]")
_ENGLISH_WORD_RE = re.compile(r"[a-zA-Z]+")


def estimate_tokens(text: str) -> int:
    chinese_chars = len(_CHINESE_RE.findall(text))
    english_words = len(_ENGLISH_WORD_RE.findall(text))
    other_chars = len(text) - chinese_chars - english_words
    return math.ceil(chinese_chars + english_words * 1.3 + max(other_chars, 0) * 0.25)


def estimate_messages_tokens(messages: list[ConversationMessage]) -> int:
    return sum(m.get("tokens") or estimate_tokens(m["content"]) for m in messages)


@dataclass
class CompressionResult:
    compressed: list[ConversationMessage]
    total_tokens: int
    dropped_tokens: int
    summary: Optional[str] = None


def compress_context(
    messages: list[ConversationMessage],
    max_tokens: int = DEFAULT_MAX_TOKENS,
    keep_recent: int = DEFAULT_KEEP_RECENT,
) -> CompressionResult:
    with_tokens = [
        {**m, "tokens": m.get("tokens") or estimate_tokens(m["content"])} for m in messages
    ]
    total_tokens = sum(m["tokens"] for m in with_tokens)

    if total_tokens <= max_tokens:
        return CompressionResult(compressed=messages, total_tokens=total_tokens, dropped_tokens=0)

    system = [m for m in with_tokens if m["role"] == "system"]
    non_system = [m for m in with_tokens if m["role"] != "system"]

    recent = non_system[-keep_recent:] if keep_recent > 0 else []
    middle = non_system[:-keep_recent] if keep_recent > 0 else non_system

    middle_tokens = sum(m["tokens"] for m in middle)
    if middle_tokens == 0:
        return CompressionResult(compressed=system + recent, total_tokens=total_tokens, dropped_tokens=0)

    recent_user_summaries = [
        f"用户: {m['content'][:100]}..." for m in middle if m["role"] == "user"
    ][-5:]
    user_turns = sum(1 for m in middle if m["role"] == "user")
    summary_content = (
        f"【{len(middle)} 条对话历史已被压缩】\n\n原始对话概述：\n"
        + "\n".join(recent_user_summaries)
        + f"\n\n主要讨论内容涉及 {user_turns} 轮交互，包含代码生成和质量问题。"
    )
    middle_summary: ConversationMessage = {
        "id": f"summary_{int(time.time() * 1000)}",
        "role": "assistant",
        "content": summary_content,
        "agentId": None,
        "timestamp": middle[-1]["timestamp"] if middle else int(time.time() * 1000),
        "tokens": estimate_tokens(summary_content),
    }

    result = system + [middle_summary] + recent
    result_tokens = estimate_messages_tokens(result)

    return CompressionResult(
        compressed=result,
        total_tokens=result_tokens,
        dropped_tokens=total_tokens - result_tokens,
        summary=summary_content,
    )
