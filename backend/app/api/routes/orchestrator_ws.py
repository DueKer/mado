# ============================================================
# MADO Backend - WebSocket /ws/orchestrator
# 任务编排 + 流式输出 + 工具审批（双向交互）
#
# 关键点：_run_graph() 在后台 asyncio.Task 里跑，
# 主循环 while True: receive_text() 始终能继续读下一条消息，
# 这样 "interrupt"（中断）消息才能在任务流式输出期间被及时处理，
# 不会被阻塞到当前 agent/graph 跑完才处理。
# ============================================================

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from langgraph.types import Command

from app.agents.graph import build_orchestrator_graph
from app.agents.state import AGENT_ORDER
from app.db.session import get_session_factory, init_db
from app.rag.loader import load_rag_documents_from_db

logger = logging.getLogger(__name__)
router = APIRouter()

_DEFAULT_AGENT_TIMEOUTS = {
    "planner": 30,
    "document": 60,
    "generator": 60,
    "quality": 30,
    "delivery": 30,
}


def _db_factory():
    factory = get_session_factory()
    return factory()


# 每个 WebSocket 连接一个独立的编排图实例（各自的 checkpointer 内存）
_graph = build_orchestrator_graph(_db_factory)


async def _send_json(ws: WebSocket, payload: dict[str, Any]) -> None:
    try:
        await ws.send_json(payload)
    except Exception:
        pass


class _ConnectionState:
    """每条 WebSocket 连接的运行态：当前跑图的后台任务 + 是否已请求中断。"""

    def __init__(self) -> None:
        self.graph_task: asyncio.Task | None = None
        self.interrupted = False


@router.websocket("/ws/orchestrator")
async def orchestrator_ws(ws: WebSocket) -> None:
    await ws.accept()
    init_db()

    thread_id = uuid.uuid4().hex
    config = {"configurable": {"thread_id": thread_id}}
    conn = _ConnectionState()

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                await _send_json(ws, {"type": "error", "error": "无法解析的消息格式"})
                continue

            msg_type = msg.get("type")

            if msg_type == "start":
                if conn.graph_task is not None and not conn.graph_task.done():
                    await _send_json(ws, {"type": "error", "error": "已有任务正在运行"})
                    continue
                try:
                    initial_state = await _build_initial_state(ws, msg)
                except Exception as e:  # noqa: BLE001
                    await _send_json(ws, {"type": "task_error", "error": str(e)})
                    continue
                if initial_state is None:
                    continue
                conn.interrupted = False
                await _send_json(ws, {"type": "task_started"})
                conn.graph_task = asyncio.create_task(_run_graph(ws, initial_state, config))

            elif msg_type == "tool_approval":
                if conn.graph_task is None or not conn.graph_task.done():
                    await _send_json(ws, {"type": "error", "error": "当前没有待处理的审批"})
                    continue
                conn.interrupted = False
                conn.graph_task = asyncio.create_task(
                    _run_graph(ws, Command(resume=bool(msg.get("approved"))), config)
                )

            elif msg_type == "interrupt":
                if conn.graph_task is not None and not conn.graph_task.done():
                    conn.interrupted = True
                    conn.graph_task.cancel()
                await _send_json(ws, {"type": "task_error", "error": "任务已被中断"})

            else:
                await _send_json(ws, {"type": "error", "error": f"未知消息类型: {msg_type}"})
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected (thread_id=%s)", thread_id)
        if conn.graph_task is not None and not conn.graph_task.done():
            conn.graph_task.cancel()
    except Exception as e:
        logger.exception("orchestrator_ws error")
        await _send_json(ws, {"type": "error", "error": str(e)})
        if conn.graph_task is not None and not conn.graph_task.done():
            conn.graph_task.cancel()


async def _build_initial_state(ws: WebSocket, msg: dict[str, Any]) -> dict[str, Any] | None:
    input_data = msg.get("input", {})
    requirement = input_data.get("requirement", "")
    tech_stack = input_data.get("techStack")
    files = input_data.get("files") or []
    uploaded_files = "\n\n".join(
        f"【文件: {f.get('name', '')}】\n{f.get('content', '')}" for f in files
    )

    model_mode = msg.get("modelMode", "dual")
    temperature = msg.get("temperature", 1.0)
    max_tokens = msg.get("maxTokens", 4096)
    agent_configs = msg.get("agentConfigs") or {}
    enabled_agents = set(msg.get("enabledAgents") or list(AGENT_ORDER))
    # pipeline: 可选的自定义步骤顺序 [{agentId, enabled, timeout, retryCount}, ...]，
    # 对齐旧版 src/lib/orchestrator.ts 的语义：传了 pipeline 就按它的顺序/超时/重试次数为准，
    # 否则按默认 AGENT_ORDER + agentConfigs 的 timeout（重试次数固定 2）。
    pipeline = msg.get("pipeline") or []
    pipeline_by_agent = {s["agentId"]: s for s in pipeline if s.get("agentId")}

    if pipeline:
        agent_order = [
            s["agentId"] for s in pipeline if s.get("enabled") and s["agentId"] in enabled_agents
        ]
    else:
        agent_order = [a for a in AGENT_ORDER if a in enabled_agents]

    if not agent_order:
        await _send_json(ws, {"type": "task_error", "error": "没有启用的 Agent"})
        return None

    agent_timeouts: dict[str, int] = {}
    agent_retries: dict[str, int] = {}
    for agent_id in AGENT_ORDER:
        step = pipeline_by_agent.get(agent_id)
        if step is not None:
            agent_timeouts[agent_id] = step.get("timeout", _DEFAULT_AGENT_TIMEOUTS.get(agent_id, 30))
            agent_retries[agent_id] = step.get("retryCount", 2)
        else:
            agent_timeouts[agent_id] = (agent_configs.get(agent_id, {}) or {}).get(
                "timeout", _DEFAULT_AGENT_TIMEOUTS.get(agent_id, 30)
            )
            agent_retries[agent_id] = 2

    loop = asyncio.get_running_loop()

    def _load_documents() -> list[dict[str, Any]]:
        factory = get_session_factory()
        db = factory()
        try:
            init_db()
            return load_rag_documents_from_db(db)
        finally:
            db.close()

    documents = await loop.run_in_executor(None, _load_documents)

    return {
        "requirement": requirement,
        "uploaded_files": uploaded_files,
        "tech_stack": tech_stack,
        "documents": documents,
        "model_mode": model_mode,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "agent_order": agent_order,
        "agent_timeouts": agent_timeouts,
        "agent_retries": agent_retries,
        "enable_context_compression": bool(msg.get("enableContextCompression")),
        "max_context_tokens": msg.get("maxContextTokens", 60000),
        "current_agent_index": 0,
        "previous_output": None,
        "conversation_history": [],
        "attempt": 0,
        "final_code": {},
        "quality_report": "",
        "instructions": "",
        "routes": "",
        "deployment": "",
        "status": "running",
        "error": None,
    }


async def _run_graph(ws: WebSocket, graph_input: Any, config: dict[str, Any]) -> None:
    """在后台线程里跑同步的 graph.stream()，把每个事件实时转发到 WebSocket。

    LangGraph 的 stream() 是同步生成器（底层模型调用也是同步的），所以放到线程池执行，
    通过线程安全队列把事件搬回事件循环，逐条 send_json，而不是等全部跑完再一次性发送。

    这个函数作为独立的 asyncio.Task 被调用（而不是直接 await），这样上层的
    WebSocket 消息循环可以在它运行期间继续接收"interrupt"消息。若被 cancel，
    只会停止转发事件、提前返回；后台线程里的同步 LLM 调用无法被强行打断，
    会在后台自然跑完（结果被丢弃），这是 Python 同步流式调用场景下的合理妥协。
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()
    _SENTINEL_DONE = object()
    _SENTINEL_ERROR = object()

    def _stream_sync() -> None:
        try:
            for stream_type, payload in _graph.stream(
                graph_input, config, stream_mode=["custom", "updates"]
            ):
                loop.call_soon_threadsafe(queue.put_nowait, (stream_type, payload))
        except Exception as e:  # noqa: BLE001
            loop.call_soon_threadsafe(queue.put_nowait, (_SENTINEL_ERROR, str(e)))
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, (_SENTINEL_DONE, None))

    loop.run_in_executor(None, _stream_sync)

    try:
        while True:
            stream_type, payload = await queue.get()
            if stream_type is _SENTINEL_DONE:
                break
            if stream_type is _SENTINEL_ERROR:
                await _send_json(ws, {"type": "task_error", "error": payload})
                return
            if stream_type == "custom":
                await _send_json(ws, payload)
            elif stream_type == "updates":
                if "__interrupt__" in payload:
                    interrupt_obj = payload["__interrupt__"][0]
                    # interrupt_obj.value 已经带有区分用的 "type" 字段（如 "tool_approval"），
                    # 不能再套一层 "type": "interrupt"，否则 dict 展开会用后者覆盖前者，
                    # 导致前端收到的消息丢失了原本的 type 判别字段。
                    await _send_json(ws, dict(interrupt_obj.value))
    except asyncio.CancelledError:
        # 任务被"interrupt"取消：不再转发后续事件，直接返回。
        return

    state = _graph.get_state(config)
    if state.next:
        # 还有待恢复的中断（工具审批），等待前端下一条消息
        return

    final_values = state.values
    await _send_json(
        ws,
        {
            "type": "task_complete",
            "result": {
                "code": final_values.get("final_code", {}),
                "instructions": final_values.get("instructions", ""),
                "routes": final_values.get("routes", ""),
                "deployment": final_values.get("deployment", ""),
                "qualityReport": final_values.get("quality_report", ""),
            },
        },
    )
