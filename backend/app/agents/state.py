# ============================================================
# MADO Backend - LangGraph 编排状态定义
# 对应 frontend src/lib/orchestrator.ts 里贯穿全流程的数据
# ============================================================

from __future__ import annotations

from typing import Any, Optional, TypedDict

AGENT_ORDER: list[str] = ["planner", "document", "generator", "quality", "delivery"]


class ConversationMessage(TypedDict):
    id: str
    role: str  # user | assistant | system
    content: str
    agentId: Optional[str]
    timestamp: int
    tokens: int


class OrchestratorState(TypedDict, total=False):
    # -------- 输入 --------
    requirement: str
    uploaded_files: str
    tech_stack: Optional[str]
    documents: list[dict[str, Any]]  # RAG 文档列表（来自 DB）
    model_mode: str  # dual | gpt-only | claude-only
    temperature: float
    max_tokens: int
    agent_order: list[str]
    agent_timeouts: dict[str, int]
    agent_retries: dict[str, int]
    enable_context_compression: bool
    max_context_tokens: int

    # -------- 运行态 --------
    current_agent_index: int
    previous_output: Any
    conversation_history: list[ConversationMessage]
    attempt: int

    # -------- 输出汇总 --------
    final_code: dict[str, str]
    quality_report: str
    instructions: str
    routes: str
    deployment: str

    # -------- 结束态 --------
    status: str  # running | completed | failed | interrupted
    error: Optional[str]

