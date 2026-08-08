# ============================================================
# MADO Backend - LangGraph 编排图
# 移植自 frontend src/lib/orchestrator.ts
# 节点顺序: planner -> document -> generator -> quality -> delivery
# ============================================================

from __future__ import annotations

import json
import re
import time
from typing import Any, Optional

from langgraph.checkpoint.memory import MemorySaver
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from app.agents.context import compress_context, estimate_tokens
from app.agents.prompts import build_messages
from app.agents.state import AGENT_ORDER, OrchestratorState
from app.agents.tool_loop import execute_tool_loop
from app.plugins.registry import PluginContext, plugin_registry
from app.rag.middleware import RagMiddlewareConfig, build_context_window
from app.services.providers import get_chat_model
from app.tools.builtin import get_tool_definitions

DEFAULT_MAX_CONTEXT_TOKENS = 60000


def _now_ms() -> int:
    return int(time.time() * 1000)


def _make_agent_node(agent_id: str, db_factory):
    """为指定 agentId 构建 LangGraph 节点闭包。db_factory: () -> Session"""

    def node(state: OrchestratorState) -> dict[str, Any]:
        writer = get_stream_writer()
        db: Session = db_factory()
        try:
            return _run_agent(agent_id, state, db, writer)
        finally:
            db.close()

    return node


def _run_agent(agent_id: str, state: OrchestratorState, db: Session, writer) -> dict[str, Any]:
    def log(msg: str) -> None:
        writer({"type": "agent_log", "agentId": agent_id, "log": msg})

    writer({"type": "agent_start", "agentId": agent_id})
    log(f"[{agent_id}] 开始执行...")

    ctx = PluginContext(
        task_id=state["requirement"][:20],
        requirement=state["requirement"],
        agent_id=agent_id,
        timestamp=_now_ms(),
    )

    documents = state.get("documents", [])
    rag_config = RagMiddlewareConfig()
    context_window = build_context_window(documents, state["requirement"], agent_id, rag_config)
    rag_results = context_window.documents
    if rag_results:
        log(f"RAG 检索命中 {len(rag_results)} 条相关内容（约 {context_window.totalTokens} tokens）")

    # 确定模型
    model_mode = state.get("model_mode", "dual")
    provider = "anthropic" if agent_id == "document" else "openai"
    if model_mode == "gpt-only":
        provider = "openai"
    elif model_mode == "claude-only":
        provider = "anthropic"

    uploaded_files = state.get("uploaded_files", "")
    tools = get_tool_definitions()

    messages = build_messages(
        agent_id,
        requirement=state["requirement"],
        uploaded_files=uploaded_files,
        tech_stack=state.get("tech_stack"),
        rag_results=rag_results,
        previous_agent_output=state.get("previous_output"),
        tools=tools,
    )

    # 上下文压缩
    conversation_history = list(state.get("conversation_history", []))
    if state.get("enable_context_compression") and conversation_history:
        compressed = compress_context(
            conversation_history,
            max_tokens=state.get("max_context_tokens") or DEFAULT_MAX_CONTEXT_TOKENS,
            keep_recent=2,
        )
        if compressed.dropped_tokens > 0:
            log(f"上下文压缩: 节省 {compressed.dropped_tokens} tokens")
            if messages and messages[0]["role"] == "system":
                limit = state.get("max_context_tokens") or DEFAULT_MAX_CONTEXT_TOKENS
                messages[0]["content"] += f"\n\n[注意: 对话历史已被压缩，超出{limit} tokens限制]"

    writer({"type": "agent_progress", "agentId": agent_id, "progress": 30})
    log(f"[{agent_id}] 调用 {provider} 模型...")

    user_message = {
        "id": f"user_{_now_ms()}",
        "role": "user",
        "content": state["requirement"],
        "agentId": agent_id,
        "timestamp": _now_ms(),
        "tokens": estimate_tokens(state["requirement"]),
    }
    conversation_history.append(user_message)

    temperature = state.get("temperature", 1.0)
    max_tokens = min(state.get("max_tokens", 4096), 32000)

    llm = get_chat_model(db, provider=provider, temperature=temperature, max_tokens=max_tokens)

    agent_timeout = state.get("agent_timeouts", {}).get(agent_id, 30)
    start_time = time.monotonic()

    output = ""
    for chunk in llm.stream(messages):
        if time.monotonic() - start_time > agent_timeout:
            raise TimeoutError(f"[{agent_id}] 执行超时（{agent_timeout}秒）")
        text = str(chunk.content or "")
        if text:
            output += text
            writer({"type": "stream", "agentId": agent_id, "text": text})
            progress = min(90, 30 + int((len(output) / (max_tokens * 4)) * 60))
            writer({"type": "agent_progress", "agentId": agent_id, "progress": progress})

    if tools:
        log(f"[{agent_id}] 检测到工具调用，执行 Tool Loop...")
        output, _tool_results = execute_tool_loop(llm, messages, output, require_approval=True)

    output = _post_process_output(agent_id, output)

    writer({"type": "agent_progress", "agentId": agent_id, "progress": 95})
    writer({"type": "agent_output", "agentId": agent_id, "output": output})
    log(f"[{agent_id}] 执行完成")

    conversation_history.append(
        {
            "id": f"assistant_{_now_ms()}",
            "role": "assistant",
            "content": output,
            "agentId": agent_id,
            "timestamp": _now_ms(),
            "tokens": estimate_tokens(output),
        }
    )

    writer({"type": "agent_complete", "agentId": agent_id, "output": output})

    updates: dict[str, Any] = {
        "previous_output": output,
        "conversation_history": conversation_history,
        "current_agent_index": state.get("current_agent_index", 0) + 1,
        "attempt": 0,
    }

    if agent_id == "quality":
        updates["quality_report"] = output

    if agent_id == "delivery":
        delivery = _parse_delivery_result(output)
        updates["final_code"] = delivery["code"]
        updates["instructions"] = delivery["instructions"]
        updates["routes"] = delivery["routes"]
        updates["deployment"] = delivery["deployment"]
        if delivery["qualityReport"]:
            updates["quality_report"] = delivery["qualityReport"]

    return updates


def _post_process_output(agent_id: str, output: str) -> str:
    # 插件后处理钩子留空实现（同步接口，钩子系统目前无注册的异步实现）
    return output


# -------------------- 重试节点包装 --------------------


def _make_retry_wrapper(agent_id: str, inner_node):
    """包一层重试逻辑：捕获异常，若还有重试次数则递增 attempt 并重新进入本节点。"""

    def node(state: OrchestratorState) -> dict[str, Any]:
        writer = get_stream_writer()
        max_retries = state.get("agent_retries", {}).get(agent_id, 2)
        attempt = state.get("attempt", 0)
        try:
            return inner_node(state)
        except Exception as e:
            if attempt < max_retries:
                writer(
                    {
                        "type": "agent_log",
                        "agentId": agent_id,
                        "log": f"执行失败（尝试 {attempt + 1}/{max_retries}）: {e}，准备重试...",
                    }
                )
                return {"attempt": attempt + 1}
            writer({"type": "agent_error", "agentId": agent_id, "error": str(e)})
            raise

    return node


def _route_after_agent(agent_id: str):
    """路由函数始终从运行时 state["agent_order"]（每次请求可不同，取决于 enabledAgents）
    读取顺序和当前下标，而不是编译期固定的顺序，这样同一张编译好的图可以服务
    "只跑 generator" 或 "跑全部 5 个 agent" 等不同的 enabledAgents 组合。"""

    def router(state: OrchestratorState) -> str:
        max_retries = state.get("agent_retries", {}).get(agent_id, 2)
        if state.get("attempt", 0) > 0 and state.get("attempt", 0) <= max_retries:
            # 重试：回到本节点
            return agent_id
        order = state.get("agent_order") or AGENT_ORDER
        idx = state.get("current_agent_index", 0)
        if idx >= len(order):
            return END
        return order[idx]

    return router


def _route_start(state: OrchestratorState) -> str:
    order = state.get("agent_order") or AGENT_ORDER
    return order[0] if order else END


# -------------------- 图构建 --------------------


def build_orchestrator_graph(db_factory):
    """构建包含全部 5 个 Agent 节点的编排图。

    实际每次运行执行哪些 Agent、以什么顺序执行，由运行时 state["agent_order"]
    （对应请求里的 enabledAgents / pipeline 配置）决定，而不是图的静态边。
    这样同一个编译好的图可以复用于不同的 enabledAgents 组合，不需要每次请求重新编图。
    """
    graph = StateGraph(OrchestratorState)

    for agent_id in AGENT_ORDER:
        base_node = _make_agent_node(agent_id, db_factory)
        wrapped = _make_retry_wrapper(agent_id, base_node)
        graph.add_node(agent_id, wrapped)

    graph.add_conditional_edges(START, _route_start, {**{a: a for a in AGENT_ORDER}, END: END})
    for agent_id in AGENT_ORDER:
        graph.add_conditional_edges(
            agent_id,
            _route_after_agent(agent_id),
            {**{a: a for a in AGENT_ORDER}, END: END},
        )

    return graph.compile(checkpointer=MemorySaver())


# -------------------- 交付结果解析 --------------------


def _try_parse_json(text: str) -> Optional[dict]:
    for match in re.finditer(r"```json\s*\n?([\s\S]*?)\n?```", text, re.IGNORECASE):
        try:
            parsed = json.loads(match.group(1).strip())
            if isinstance(parsed, dict) and parsed:
                return parsed
        except Exception:
            continue

    obj_match = re.search(r'\{[\s\S]*?"code"[\s\S]*?\}', text)
    if obj_match:
        try:
            parsed = json.loads(obj_match.group(0))
            if isinstance(parsed, dict) and parsed:
                return parsed
        except Exception:
            pass
    return None


def _infer_extension_from_code(code: str) -> str:
    trimmed = code.lstrip().lower()
    if trimmed.startswith("<template") or "</template>" in trimmed:
        return "vue"
    if trimmed.startswith("<!doctype") or trimmed.startswith("<html") or "</html>" in trimmed:
        return "html"
    if trimmed.startswith("{") or trimmed.startswith("["):
        return "json"
    if "function " in trimmed or "const " in trimmed or "document." in trimmed:
        return "js"
    if "{" in trimmed and ":" in trimmed and ";" in trimmed:
        return "css"
    return "txt"


def _default_generated_filename(index: int, code: str = "") -> str:
    ext = _infer_extension_from_code(code)
    return f"generated.{ext}" if index == 1 else f"generated_{index}.{ext}"


def _normalize_escaped_code(code: str) -> str:
    value = code.strip()
    if len(value) >= 2 and (
        (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'"))
    ):
        try:
            value = json.loads(value)
        except Exception:
            value = value[1:-1]

    if "\\n" not in value and '\\"' not in value and "\\t" not in value:
        return value

    return (
        value.replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
        .replace('\\"', '"')
        .replace("\\'", "'")
        .strip()
    )


def _normalize_code_map(code: Optional[dict[str, str]]) -> dict[str, str]:
    if not code:
        return {}
    result: dict[str, str] = {}
    for index, (filename, content) in enumerate(code.items()):
        normalized_code = _normalize_escaped_code(str(content))
        if filename.endswith(".txt") and filename.startswith("generated_"):
            filename = _default_generated_filename(index + 1, normalized_code)
        result[filename] = normalized_code
    return result


def _extract_section(text: str, section: str) -> str:
    lines = text.split("\n")
    capturing = False
    result: list[str] = []
    for line in lines:
        if section in line or line.startswith("#"):
            if capturing and line.startswith("#") and section not in line:
                break
            capturing = True
            result.append(line)
        elif capturing:
            result.append(line)
    return "\n".join(result)


def _extract_filename(code: str) -> Optional[str]:
    match = re.search(r'filename[:\s]*["\']?([^"\'\n]+)["\']?', code, re.IGNORECASE)
    if match:
        return match.group(1)
    first_line = code.split("\n")[0]
    comment_match = re.search(r"filename[:\s]*(\S+)", first_line)
    if comment_match:
        return comment_match.group(1)
    return None


def _parse_delivery_result(text: str) -> dict[str, Any]:
    parsed = _try_parse_json(text)
    if parsed:
        return {
            "code": _normalize_code_map(parsed.get("code")),
            "instructions": parsed.get("instructions", ""),
            "routes": parsed.get("routes", ""),
            "deployment": parsed.get("deployment", ""),
            "qualityReport": parsed.get("qualityReport", ""),
        }

    code_block_re = re.compile(
        r"```(?:typescript|tsx|ts|jsx|js|html|css|vue|scss|less|json)?\s*\n?([\s\S]*?)```"
    )
    files: dict[str, str] = {}
    file_index = 1
    for match in code_block_re.finditer(text):
        code = match.group(1).strip()
        if not code:
            continue
        normalized_code = _normalize_escaped_code(code)
        filename = _extract_filename(normalized_code) or _default_generated_filename(file_index, normalized_code)
        files[filename] = normalized_code
        file_index += 1

    return {
        "code": files,
        "instructions": _extract_section(text, "使用说明") or _extract_section(text, "instructions") or "",
        "routes": _extract_section(text, "路由说明") or _extract_section(text, "routes") or "",
        "deployment": _extract_section(text, "部署步骤") or _extract_section(text, "deployment") or "",
        "qualityReport": _extract_section(text, "质检报告") or _extract_section(text, "qualityReport") or "",
    }
