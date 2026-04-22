// ============================================================
// MADO - Agent Plugin System
// 可插拔架构：允许注册自定义 Agent、工具、生命周期钩子
// ============================================================

import type { AgentId, RagQueryResult } from '@/types';
import type { ToolDefinition } from '@/lib/tools/tool-schema';

// -------------------- Plugin 定义 --------------------

export interface AgentPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  enabled?: boolean;

  // Agent 相关
  agents?: PluginAgent[];

  // 工具
  tools?: ToolDefinition[];

  // 生命周期钩子
  hooks?: PluginHooks;

  // 初始化（可选）
  init?: () => void | Promise<void>;
}

export interface PluginAgent {
  id: AgentId;
  name: string;
  shortName: string;
  description: string;
  systemPrompt: string;
  model: 'gpt' | 'claude';
  tools?: string[];     // 此 Agent 可用的工具名列表
  icon?: string;
  color?: string;
}

// -------------------- 生命周期钩子 --------------------

export interface PluginHooks {
  // 任务生命周期
  onTaskStart?: (ctx: PluginContext) => void | Promise<void>;
  onTaskEnd?: (ctx: PluginContext, result: unknown) => void | Promise<void>;
  onTaskError?: (ctx: PluginContext, error: Error) => void | Promise<void>;

  // Agent 生命周期
  onAgentStart?: (ctx: PluginContext, agentId: string) => void | Promise<void>;
  onAgentEnd?: (ctx: PluginContext, agentId: string, output: unknown) => void | Promise<void>;

  // Prompt 增强（可修改 system prompt）
  onBeforePrompt?: (ctx: PluginContext, agentId: string, prompt: string) => string | Promise<string>;

  // RAG 结果增强
  onRAGResults?: (ctx: PluginContext, results: RagQueryResult[]) => RagQueryResult[] | Promise<RagQueryResult[]>;

  // Tool 结果处理
  onToolResult?: (ctx: PluginContext, toolName: string, result: unknown) => unknown;

  // 输出后处理
  onAgentOutput?: (ctx: PluginContext, agentId: string, output: string) => string | Promise<string>;
}

// -------------------- Plugin Context --------------------

export interface PluginContext {
  taskId: string;
  requirement: string;
  agentId: string;
  timestamp: number;

  // 共享数据存储（插件间通信）
  sharedData: Map<string, unknown>;

  // 获取当前 Agent 配置
  getAgentConfig?: () => Record<string, unknown>;

  // 注册自定义数据
  registerData: (key: string, value: unknown) => void;

  // 取消信号
  signal?: AbortSignal;
}

// -------------------- Plugin Registry --------------------

type PluginHookName = keyof NonNullable<PluginHooks>;

class PluginRegistry {
  private plugins: Map<string, AgentPlugin> = new Map();
  private hookCache: Map<PluginHookName, Array<{ plugin: AgentPlugin; fn: (...args: unknown[]) => unknown }>> = new Map();

  /**
   * 注册插件
   */
  register(plugin: AgentPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[PluginRegistry] Plugin "${plugin.id}" already registered, skipping.`);
      return;
    }

    // 初始化插件
    plugin.init?.();

    this.plugins.set(plugin.id, plugin);

    // 缓存钩子
    if (plugin.hooks) {
      for (const [hookName, fn] of Object.entries(plugin.hooks)) {
        if (fn) {
          const name = hookName as PluginHookName;
          if (!this.hookCache.has(name)) {
            this.hookCache.set(name, []);
          }
          this.hookCache.get(name)!.push({ plugin, fn });
        }
      }
    }

    console.log(`[PluginRegistry] Plugin "${plugin.name}" v${plugin.version} registered.`);
  }

  /**
   * 注销插件
   */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    this.plugins.delete(pluginId);

    // 清除钩子缓存
    for (const [, handlers] of this.hookCache) {
      const idx = handlers.findIndex(h => h.plugin.id === pluginId);
      if (idx !== -1) handlers.splice(idx, 1);
    }

    console.log(`[PluginRegistry] Plugin "${plugin.name}" unregistered.`);
  }

  /**
   * 获取所有插件
   */
  getAll(): AgentPlugin[] {
    return Array.from(this.plugins.values()).filter(p => p.enabled !== false);
  }

  /**
   * 获取启用的 Agent 插件
   */
  getAgentPlugins(): AgentPlugin[] {
    return this.getAll().filter(p => p.agents && p.agents.length > 0);
  }

  /**
   * 获取启用的工具插件
   */
  getToolPlugins(): AgentPlugin[] {
    return this.getAll().filter(p => p.tools && p.tools.length > 0);
  }

  /**
   * 获取指定 Agent ID 对应的插件
   */
  getPluginByAgentId(agentId: AgentId): AgentPlugin | undefined {
    return this.getAgentPlugins().find(p =>
      p.agents?.some(a => a.id === agentId)
    );
  }

  /**
   * 获取指定 Agent 可用的工具列表
   */
  getToolsForAgent(agentId: AgentId): ToolDefinition[] {
    const allTools: ToolDefinition[] = [];
    for (const plugin of this.getToolPlugins()) {
      if (!plugin.tools) continue;
      for (const tool of plugin.tools) {
        const agent = plugin.agents?.find(a => a.id === agentId);
        if (!agent || !agent.tools || agent.tools.includes(tool.name) || plugin.agents?.length === 0) {
          allTools.push(tool);
        } else if (agent.tools.includes(tool.name)) {
          allTools.push(tool);
        }
      }
    }
    return allTools;
  }

  /**
   * 执行钩子（所有注册了此钩子的插件）
   */
  async executeHook<K extends PluginHookName>(
    hookName: K,
    ctx: PluginContext,
    ...args: unknown[]
  ): Promise<void> {
    const handlers = this.hookCache.get(hookName) ?? [];
    for (const { fn } of handlers) {
      try {
        const result = fn.apply(null, [ctx, ...args]);
        if (result instanceof Promise) {
          await result;
        }
      } catch (e) {
        console.error(`[PluginRegistry] Hook "${hookName}" error:`, e);
      }
    }
  }

  /**
   * 执行 Prompt 增强钩子（返回修改后的 prompt）
   */
  async enhancePrompt(ctx: PluginContext, agentId: string, basePrompt: string): Promise<string> {
    let prompt = basePrompt;
    const handlers = this.hookCache.get('onBeforePrompt') ?? [];
    for (const { fn } of handlers) {
      try {
        const result = await fn(ctx, agentId, prompt);
        if (typeof result === 'string') {
          prompt = result;
        }
      } catch (e) {
        console.error(`[PluginRegistry] Hook "onBeforePrompt" error:`, e);
      }
    }
    return prompt;
  }

  /**
   * 执行 RAG 结果增强
   */
  async enhanceRAGResults(ctx: PluginContext, results: RagQueryResult[]): Promise<RagQueryResult[]> {
    let enhanced = results;
    const handlers = this.hookCache.get('onRAGResults') ?? [];
    for (const { fn } of handlers) {
      try {
        const result = await fn(ctx, enhanced);
        if (Array.isArray(result)) {
          enhanced = result;
        }
      } catch (e) {
        console.error(`[PluginRegistry] Hook "onRAGResults" error:`, e);
      }
    }
    return enhanced;
  }

  /**
   * 执行输出后处理
   */
  async postProcessOutput(ctx: PluginContext, agentId: string, output: string): Promise<string> {
    let processed = output;
    const handlers = this.hookCache.get('onAgentOutput') ?? [];
    for (const { fn } of handlers) {
      try {
        const result = await fn(ctx, agentId, processed);
        if (typeof result === 'string') {
          processed = result;
        }
      } catch (e) {
        console.error(`[PluginRegistry] Hook "onAgentOutput" error:`, e);
      }
    }
    return processed;
  }

  /**
   * 获取插件统计
   */
  getStats(): { total: number; enabled: number; agents: number; tools: number } {
    const all = Array.from(this.plugins.values());
    const enabled = this.getAll();
    return {
      total: all.length,
      enabled: enabled.length,
      agents: enabled.reduce((sum, p) => sum + (p.agents?.length ?? 0), 0),
      tools: enabled.reduce((sum, p) => sum + (p.tools?.length ?? 0), 0),
    };
  }
}

// -------------------- 单例导出 --------------------

export const pluginRegistry = new PluginRegistry();

// -------------------- 示例插件：空壳 --------------------

export function createExamplePlugin(): AgentPlugin {
  return {
    id: 'example-plugin',
    name: '示例插件',
    version: '1.0.0',
    description: '演示插件系统的用法',
    enabled: true,
    agents: [],
    tools: [],
    hooks: {
      onAgentStart: (ctx) => {
        console.log(`[ExamplePlugin] Agent ${ctx.agentId} starting for task ${ctx.taskId}`);
      },
      onAgentEnd: (ctx, agentId, output) => {
        console.log(`[ExamplePlugin] Agent ${agentId} finished, output length: ${String(output).length}`);
      },
    },
  };
}
