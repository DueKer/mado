# ============================================================
# MADO Backend - 内置工具集
# 移植自 frontend src/lib/tools/builtin-tools.ts
# 供 LangGraph 工具节点执行使用
# ============================================================

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Callable

from app.tools.schema import ToolCall, ToolDefinition, ToolParam, ToolResult, validate_args
from app.tools.web_search import fetch_page, search

_REGISTRY: dict[str, tuple[ToolDefinition, Callable[[ToolCall], ToolResult]]] = {}


def register_tool(definition: ToolDefinition, executor: Callable[[ToolCall], ToolResult]) -> None:
    _REGISTRY[definition.name] = (definition, executor)


def get_tool_definitions() -> list[ToolDefinition]:
    return [d for d, _ in _REGISTRY.values()]


def get_tool_executor(name: str) -> Callable[[ToolCall], ToolResult] | None:
    entry = _REGISTRY.get(name)
    return entry[1] if entry else None


# -------------------- web_search --------------------


def _exec_web_search(call: ToolCall) -> ToolResult:
    ok, err = validate_args(
        call.arguments,
        [
            ToolParam("query", "", "string", True),
            ToolParam("max_results", "", "number", False),
        ],
    )
    if not ok:
        return ToolResult(call.id, call.name, False, "", error=err)
    try:
        max_results = int(call.arguments.get("max_results", 5))
        results = search(str(call.arguments["query"]), max_results=max_results)
        formatted = "\n\n".join(
            f"[{i + 1}] {r['title']}\nURL: {r['url']}\n{r['snippet']}" for i, r in enumerate(results)
        )
        return ToolResult(
            call.id,
            call.name,
            True,
            f"搜索「{call.arguments['query']}」结果：\n\n{formatted}\n\n（共{len(results)}条结果）",
        )
    except Exception as e:
        return ToolResult(call.id, call.name, False, "", error=str(e))


register_tool(
    ToolDefinition(
        name="web_search",
        description="在互联网上搜索信息。当你不确定某些技术细节、最新文档、API用法或需要查证事实时使用。",
        category="search",
        parameters=[
            ToolParam("query", "搜索查询词，尽量具体，包含关键术语", "string", True),
            ToolParam("max_results", "最大返回结果数", "number", False, default=5),
        ],
    ),
    _exec_web_search,
)


# -------------------- web_fetch --------------------


def _exec_web_fetch(call: ToolCall) -> ToolResult:
    ok, err = validate_args(
        call.arguments,
        [
            ToolParam("url", "", "string", True),
            ToolParam("query", "", "string", False),
        ],
    )
    if not ok:
        return ToolResult(call.id, call.name, False, "", error=err)
    try:
        url = str(call.arguments["url"])
        query = str(call.arguments.get("query", ""))
        content = fetch_page(url, query)
        return ToolResult(call.id, call.name, True, f"页面内容（{url}）:\n\n{content}")
    except Exception as e:
        return ToolResult(call.id, call.name, False, "", error=str(e))


register_tool(
    ToolDefinition(
        name="web_fetch",
        description="获取指定网页的完整内容。用于查看技术文档、API说明、教程等。",
        category="search",
        parameters=[
            ToolParam("url", "网页完整 URL", "string", True),
            ToolParam("query", "你在此页面上想了解的具体内容（方便提取关键段落）", "string", False),
        ],
    ),
    _exec_web_fetch,
)


# -------------------- json_transform --------------------


def _exec_json_transform(call: ToolCall) -> ToolResult:
    start = time.time()
    try:
        raw_data = call.arguments.get("data")
        data = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
        operation = str(call.arguments.get("operation"))
        params = call.arguments.get("params")
        params = json.loads(params) if isinstance(params, str) and params else (params or {})

        if operation == "parse":
            result = json.loads(str(raw_data))
        elif operation == "stringify":
            result = json.dumps(data, ensure_ascii=False, indent=2)
        elif operation == "pick":
            fields = params.get("fields", [])
            result = {f: data.get(f) for f in fields}
        elif operation == "omit":
            fields = set(params.get("fields", []))
            result = {k: v for k, v in data.items() if k not in fields}
        elif operation == "merge":
            result = {**data, **params.get("data", {})}
        else:
            raise ValueError(f"Unsupported operation in backend: {operation}")

        return ToolResult(
            call.id,
            call.name,
            True,
            f"JSON {operation} 结果:\n{json.dumps(result, ensure_ascii=False, indent=2)}",
            durationMs=int((time.time() - start) * 1000),
        )
    except Exception as e:
        return ToolResult(
            call.id, call.name, False, "", error=str(e), durationMs=int((time.time() - start) * 1000)
        )


register_tool(
    ToolDefinition(
        name="json_transform",
        description="对 JSON 数据进行转换、过滤、映射等操作。",
        category="code",
        parameters=[
            ToolParam("data", "输入的 JSON 数据（字符串或对象）", "string", True),
            ToolParam(
                "operation",
                "要执行的操作类型",
                "string",
                True,
                enum=["parse", "stringify", "pick", "omit", "merge"],
            ),
            ToolParam("params", "操作参数（JSON 字符串）", "string", False),
        ],
    ),
    _exec_json_transform,
)


# -------------------- format_date --------------------


def _exec_format_date(call: ToolCall) -> ToolResult:
    timestamp = str(call.arguments.get("timestamp"))
    fmt = str(call.arguments.get("format", "YYYY-MM-DD HH:mm:ss"))
    try:
        if timestamp.replace(".", "", 1).isdigit():
            ts = float(timestamp)
            ts = ts if ts >= 1e12 else ts * 1000
            dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        else:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except Exception:
        return ToolResult(call.id, call.name, False, "", error="无效的时间戳")

    if fmt == "YYYY-MM-DD":
        result = dt.strftime("%Y-%m-%d")
    elif fmt == "unix":
        result = str(int(dt.timestamp()))
    elif fmt == "relative":
        diff_secs = int((datetime.now(timezone.utc) - dt).total_seconds())
        if diff_secs < 60:
            result = f"{diff_secs}秒前"
        elif diff_secs < 3600:
            result = f"{diff_secs // 60}分钟前"
        elif diff_secs < 86400:
            result = f"{diff_secs // 3600}小时前"
        else:
            result = f"{diff_secs // 86400}天前"
    else:
        result = dt.strftime("%Y-%m-%d %H:%M:%S")

    return ToolResult(call.id, call.name, True, result)


register_tool(
    ToolDefinition(
        name="format_date",
        description="格式化日期时间为指定格式字符串。",
        category="compute",
        parameters=[
            ToolParam("timestamp", "Unix 时间戳（秒或毫秒）或 ISO 日期字符串", "string", True),
            ToolParam(
                "format",
                "输出格式",
                "string",
                False,
                default="YYYY-MM-DD HH:mm:ss",
                enum=["YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss", "relative", "unix"],
            ),
        ],
    ),
    _exec_format_date,
)


# NOTE: code_interpreter (JS eval sandbox) was NOT ported — arbitrary JS execution has no safe
# equivalent on the Python side. If needed later, use a sandboxed subprocess (e.g. Deno --allow-none)
# rather than Python `exec`, to avoid trivial RCE.


def execute_tools(calls: list[ToolCall]) -> list[ToolResult]:
    results: list[ToolResult] = []
    for call in calls:
        executor = get_tool_executor(call.name)
        if not executor:
            results.append(ToolResult(call.id, call.name, False, "", error=f"Unknown tool: {call.name}"))
            continue
        try:
            results.append(executor(call))
        except Exception as e:
            results.append(ToolResult(call.id, call.name, False, "", error=str(e)))
    return results

