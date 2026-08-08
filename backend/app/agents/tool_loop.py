# ============================================================
# MADO Backend - Tool Call 解析与执行循环
# 移植自 frontend src/lib/tools/tool-engine.ts
# 工具审批通过 LangGraph interrupt() 实现（暂停等待 WebSocket 前端响应）
# ============================================================

from __future__ import annotations

import json
import re
import time
import uuid
from dataclasses import dataclass

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.config import get_stream_writer
from langgraph.types import interrupt

from app.tools.builtin import execute_tools, get_tool_definitions
from app.tools.schema import ToolCall, ToolResult

_TOOL_DESCRIPTIONS: dict[str, str] = {d.name: d.description for d in get_tool_definitions()}

_TOOL_CALL_RE = re.compile(r"__TOOL_CALL__\s*\n([\s\S]*?)\n__END_TOOL_CALL__")
_TOOL_CALL_GPT_RE = re.compile(r"tool_calls\s*:\s*\[([\s\S]*?)\]", re.IGNORECASE)

MAX_TOOL_LOOPS = 3


@dataclass
class ParsedToolCalls:
    calls: list[ToolCall]
    raw: str


def parse_tool_calls(text: str) -> ParsedToolCalls:
    calls: list[ToolCall] = []
    custom_match = _TOOL_CALL_RE.search(text)

    if custom_match:
        try:
            payload = json.loads(custom_match.group(1))
            items = payload if isinstance(payload, list) else [payload]
            for item in items:
                if not isinstance(item, dict):
                    continue
                name = item.get("tool") or item.get("name")
                if not name:
                    continue
                params = item.get("params", {})
                if isinstance(params, str):
                    try:
                        params = json.loads(params)
                    except Exception:
                        params = {}
                calls.append(
                    ToolCall(
                        id=item.get("id") or f"call_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}",
                        name=name,
                        arguments=params or {},
                    )
                )
        except Exception:
            pass

    if not calls:
        gpt_match = _TOOL_CALL_GPT_RE.search(text)
        if gpt_match:
            try:
                block = gpt_match.group(1)
                names = [m.group(1).strip() for m in re.finditer(r'name\s*:\s*"?([^",}]+)"?', block)]
                args_raw = [
                    m.group(1) for m in re.finditer(r"arguments\s*:\s*(\{[\s\S]*?\}(?=\s*,|\s*\}))", block)
                ]
                for i, name in enumerate(names):
                    args = {}
                    if i < len(args_raw):
                        try:
                            args = json.loads(args_raw[i])
                        except Exception:
                            args = {}
                    calls.append(
                        ToolCall(
                            id=f"call_{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}_{i}",
                            name=name,
                            arguments=args,
                        )
                    )
            except Exception:
                pass

    return ParsedToolCalls(calls=calls, raw=custom_match.group(1) if custom_match else "")


def strip_tool_calls(text: str) -> str:
    stripped = _TOOL_CALL_RE.sub("", text)
    stripped = _TOOL_CALL_GPT_RE.sub("", stripped)
    stripped = re.sub(r"\[(?:tool_calls|function_calls)\]", "", stripped, flags=re.IGNORECASE)
    return stripped.strip()


def _dict_messages_to_lc(messages: list[dict]) -> list[BaseMessage]:
    lc: list[BaseMessage] = []
    for m in messages:
        role = m.get("role")
        content = m.get("content", "")
        if role == "system":
            lc.append(SystemMessage(content=content))
        elif role == "assistant":
            lc.append(AIMessage(content=content))
        else:
            lc.append(HumanMessage(content=content))
    return lc


def _continue_with_results(llm, messages: list[dict]) -> str:
    """把工具结果发回模型继续生成（流式，通过 custom writer 推送 chunk）。"""
    writer = get_stream_writer()
    lc_messages = _dict_messages_to_lc(messages)
    output = ""
    try:
        for chunk in llm.stream(lc_messages):
            text = str(chunk.content or "")
            if text:
                output += text
                writer({"type": "stream", "text": text})
        return output
    except Exception as e:
        return f"\n[工具执行后无法继续生成: {e}]"


def execute_tool_loop(
    llm,
    messages: list[dict],
    raw_output: str,
    require_approval: bool = True,
) -> tuple[str, list[ToolResult]]:
    """执行工具调用循环。

    如果 require_approval 为真，会调用 langgraph interrupt() 暂停执行，
    等待前端（通过 WebSocket）返回 approve/reject 决定后再继续。
    """
    writer = get_stream_writer()
    parsed = parse_tool_calls(raw_output)

    if not parsed.calls:
        return raw_output, []

    all_results: list[ToolResult] = []
    final_output = strip_tool_calls(raw_output)
    loop_count = 0

    conversation = list(messages)
    conversation.append({"role": "assistant", "content": raw_output})

    calls_to_process = parsed.calls

    while calls_to_process and loop_count < MAX_TOOL_LOOPS:
        loop_count += 1

        approved_calls: list[ToolCall] = []
        rejected_calls: list[ToolCall] = []

        if require_approval:
            for call in calls_to_process:
                writer({"type": "tool_start", "callId": call.id, "name": call.name, "arguments": call.arguments})
                approved = interrupt(
                    {
                        "type": "tool_approval",
                        "callId": call.id,
                        "name": call.name,
                        "arguments": call.arguments,
                        "description": _TOOL_DESCRIPTIONS.get(call.name, ""),
                    }
                )
                if approved:
                    approved_calls.append(call)
                else:
                    rejected_calls.append(call)
                    all_results.append(
                        ToolResult(
                            callId=call.id,
                            toolName=call.name,
                            success=False,
                            content="",
                            error="用户拒绝了此工具的执行",
                        )
                    )
        else:
            approved_calls = list(calls_to_process)

        results = execute_tools(approved_calls)

        for result in results:
            writer(
                {
                    "type": "tool_result",
                    "callId": result.callId,
                    "toolName": result.toolName,
                    "success": result.success,
                    "content": result.content if result.success else (result.error or ""),
                }
            )
            all_results.append(result)

        for result in results:
            conversation.append(
                {
                    "role": "user",
                    "content": f"【工具执行结果 - {result.toolName}】\n"
                    + (result.content if result.success else f"错误: {result.error}"),
                }
            )
        for call in rejected_calls:
            conversation.append(
                {
                    "role": "user",
                    "content": f"【工具执行结果 - {call.name}】\n错误: 用户拒绝执行此工具",
                }
            )

        continued = _continue_with_results(llm, conversation)
        final_output = continued

        continued_calls = parse_tool_calls(continued).calls
        # 只保留仍未被上一轮覆盖到的新调用，避免死循环重复同一批
        calls_to_process = [
            c
            for c in continued_calls
            if not any(c.name == prev.name and c.arguments == prev.arguments for prev in parsed.calls)
        ]
        parsed = ParsedToolCalls(calls=calls_to_process, raw="")

    return final_output, all_results
