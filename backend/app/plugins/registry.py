# ============================================================
# MADO Backend - Plugin Registry
# 移植自 frontend src/lib/plugins/plugin-system.ts
# 保留钩子接口，具体业务钩子实现后续再迁移
# ============================================================

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


@dataclass
class PluginContext:
    task_id: str
    requirement: str
    agent_id: str
    timestamp: int
    shared_data: dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentPlugin:
    id: str
    name: str
    version: str
    description: str = ""
    enabled: bool = True
    hooks: dict[str, Callable] = field(default_factory=dict)


class PluginRegistry:
    def __init__(self) -> None:
        self._plugins: dict[str, AgentPlugin] = {}

    def register(self, plugin: AgentPlugin) -> None:
        if plugin.id in self._plugins:
            logger.warning('Plugin "%s" already registered, skipping.', plugin.id)
            return
        self._plugins[plugin.id] = plugin

    def unregister(self, plugin_id: str) -> None:
        self._plugins.pop(plugin_id, None)

    def get_all(self) -> list[AgentPlugin]:
        return [p for p in self._plugins.values() if p.enabled]

    def _handlers(self, hook_name: str) -> list[Callable]:
        return [p.hooks[hook_name] for p in self.get_all() if hook_name in p.hooks]

    async def execute_hook(self, hook_name: str, ctx: PluginContext, *args: Any) -> None:
        for fn in self._handlers(hook_name):
            try:
                result = fn(ctx, *args)
                if hasattr(result, "__await__"):
                    await result
            except Exception:
                logger.exception('Hook "%s" error', hook_name)

    async def enhance_prompt(self, ctx: PluginContext, agent_id: str, base_prompt: str) -> str:
        prompt = base_prompt
        for fn in self._handlers("onBeforePrompt"):
            try:
                result = fn(ctx, agent_id, prompt)
                if hasattr(result, "__await__"):
                    result = await result
                if isinstance(result, str):
                    prompt = result
            except Exception:
                logger.exception('Hook "onBeforePrompt" error')
        return prompt

    async def enhance_rag_results(self, ctx: PluginContext, results: list[dict]) -> list[dict]:
        enhanced = results
        for fn in self._handlers("onRAGResults"):
            try:
                result = fn(ctx, enhanced)
                if hasattr(result, "__await__"):
                    result = await result
                if isinstance(result, list):
                    enhanced = result
            except Exception:
                logger.exception('Hook "onRAGResults" error')
        return enhanced

    async def post_process_output(self, ctx: PluginContext, agent_id: str, output: str) -> str:
        processed = output
        for fn in self._handlers("onAgentOutput"):
            try:
                result = fn(ctx, agent_id, processed)
                if hasattr(result, "__await__"):
                    result = await result
                if isinstance(result, str):
                    processed = result
            except Exception:
                logger.exception('Hook "onAgentOutput" error')
        return processed


plugin_registry = PluginRegistry()

