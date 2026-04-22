// ============================================================
// MADO - 调度引擎核心 v2
// 串联5个Agent，实现任务自动流转
// 支持 Pipeline 配置、插件系统、上下文压缩
// ============================================================

import type {
  AgentId,
  AgentExecution,
  TaskInput,
  DeliveryResult,
  RagDocument,
  ModelType,
  PerAgentConfig,
} from '@/types';
import { callAI } from './ai-sdk-service';
import { buildMessages } from './agent-prompts';
import { getToolDefinitions } from './tools/builtin-tools';
import { executeToolLoop } from './tools/tool-engine';
import type { ToolDefinition } from './tools/tool-schema';
import { buildContextWindow } from './rag/rag-middleware';
import { compressContext, estimateTokens, type ConversationMessage } from './memory/context-compression';
import { pluginRegistry } from './plugins/plugin-system';
import type { PipelineStep } from '@/components/pipeline/PipelineEditor';

export interface OrchestratorCallbacks {
  onAgentStart: (agentId: AgentId) => void;
  onAgentProgress: (agentId: AgentId, progress: number) => void;
  onAgentLog: (agentId: AgentId, log: string) => void;
  onAgentOutput: (agentId: AgentId, output: unknown) => void;
  onAgentError: (agentId: AgentId, error: string) => void;
  onAgentComplete: (agentId: AgentId, output: unknown) => void;
  onStream: (text: string) => void;
  /** 请求工具审批 - 返回 Promise，resolve=true 表示批准，resolve=false 表示拒绝 */
  onToolApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  onToolResult?: (toolName: string, result: string) => void;
  onComplete: (result: DeliveryResult) => void;
  onError: (error: string) => void;
}

export interface OrchestratorConfig {
  pipeline?: PipelineStep[];  // 自定义 Pipeline，默认使用内置顺序
  enableContextCompression?: boolean;
  maxContextTokens?: number;
}

const DEFAULT_MAX_TOKENS = 60000;

// -------------------- 单个 Agent 执行 --------------------

async function executeAgent(
  agentId: AgentId,
  input: TaskInput,
  documents: RagDocument[],
  modelMode: ModelType,
  temperature: number,
  maxTokens: number,
  agentTimeout: number,
  previousOutput: unknown,
  callbacks: OrchestratorCallbacks,
  signal: AbortSignal,
  tools: ToolDefinition[],
  conversationHistory: ConversationMessage[],
  config: OrchestratorConfig
): Promise<unknown> {
  const log = (msg: string) => callbacks.onAgentLog(agentId, msg);

  callbacks.onAgentStart(agentId);
  log(`[${agentId}] 开始执行...`);

  // 执行插件钩子: onAgentStart
  await pluginRegistry.executeHook('onAgentStart', {
    taskId: input.requirement.substring(0, 20),
    requirement: input.requirement,
    agentId,
    timestamp: Date.now(),
    sharedData: new Map(),
    registerData: () => {},
    signal,
  }, agentId);

  // RAG 检索（增强版 middleware）
  const ragContext = buildContextWindow(documents, input.requirement, agentId);
  const ragResults = ragContext.documents;
  if (ragResults.length > 0) {
    log(`RAG 检索命中 ${ragResults.length} 条相关内容（约 ${ragContext.totalTokens} tokens）`);
  }

  // 执行插件钩子: onRAGResults
  const enhancedResults = await pluginRegistry.enhanceRAGResults({
    taskId: input.requirement.substring(0, 20),
    requirement: input.requirement,
    agentId,
    timestamp: Date.now(),
    sharedData: new Map(),
    registerData: () => {},
    signal,
  }, ragResults);

  // 确定使用哪个模型
  let model: 'gpt' | 'claude';
  if (agentId === 'document') {
    model = 'claude';
  } else {
    model = 'gpt';
  }
  if (modelMode === 'gpt-only') model = 'gpt';
  if (modelMode === 'claude-only') model = 'claude';

  const uploadedFiles = input.files
    ?.map(f => `【文件: ${f.name}】\n${f.content}`)
    .join('\n\n') ?? '';

  let messages = buildMessages(agentId, {
    requirement: input.requirement,
    uploadedFiles,
    ragResults: enhancedResults,
    previousAgentOutput: previousOutput,
    agentConfig: { temperature, maxTokens },
  }, tools);

  // 上下文压缩（如果启用）
  if (config.enableContextCompression && conversationHistory.length > 0) {
    const compressed = compressContext(conversationHistory, {
      maxTokens: config.maxContextTokens ?? DEFAULT_MAX_TOKENS,
      keepRecent: 2,
    });
    if (compressed.droppedTokens > 0) {
      log(`上下文压缩: ${compressed.droppedTokens} tokens → ${compressed.totalTokens} tokens`);
      // 在 system prompt 追加压缩说明
      messages = messages.map((m, i) =>
        i === 0 && m.role === 'system'
          ? { ...m, content: m.content + `\n\n[注意: 对话历史已被压缩，超出${config.maxContextTokens ?? DEFAULT_MAX_TOKENS} tokens限制]` }
          : m
      );
    }
  }

  // 执行插件钩子: onBeforePrompt
  if (messages[0]?.role === 'system') {
    messages[0].content = await pluginRegistry.enhancePrompt(
      {
        taskId: input.requirement.substring(0, 20),
        requirement: input.requirement,
        agentId,
        timestamp: Date.now(),
        sharedData: new Map(),
        registerData: () => {},
        signal,
      },
      agentId,
      messages[0].content
    );
  }

  callbacks.onAgentProgress(agentId, 30);
  log(`[${agentId}] 调用 ${model} 模型...`);

  // 记录本次对话
  const userMessage: ConversationMessage = {
    id: `user_${Date.now()}`,
    role: 'user',
    content: input.requirement,
    agentId,
    timestamp: Date.now(),
    tokens: estimateTokens(input.requirement),
  };
  conversationHistory.push(userMessage);

  let output = '';

  // 超时控制
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[${agentId}] 执行超时（${agentTimeout}秒）`));
    }, agentTimeout * 1000);
    signal.addEventListener('abort', () => clearTimeout(timer));
  });

  const aiPromise = new Promise<string>((resolve, reject) => {
    const internalSignal = AbortSignal.any
      ? AbortSignal.any([signal])
      : signal;

    callAI(model, messages, {
      temperature,
      maxTokens: Math.min(maxTokens, 32000),
      stream: true,
      onChunk: (chunk) => {
        if (chunk.text) {
          output += chunk.text;
          callbacks.onStream(chunk.text);
        }
        const prog = Math.min(90, 30 + Math.floor((output.length / (maxTokens * 4)) * 60));
        callbacks.onAgentProgress(agentId, prog);
      },
      signal: internalSignal,
    }).then(async (rawOutput) => {
      // 执行 Tool Loop（如果需要审批，暂停等待）
      if (tools.length > 0) {
        callbacks.onAgentLog(agentId, `[${agentId}] 检测到工具调用，执行 Tool Loop...`);
        const result = await executeToolLoop(
          model,
          messages,
          rawOutput,
          {
            onToolStart: (call) => {
              callbacks.onAgentLog(agentId, `  → 调用工具: ${call.name}`);
            },
            onToolResult: (res) => {
              callbacks.onAgentLog(agentId, `  ← 工具 ${res.toolName} 执行${res.success ? '成功' : '失败'}`);
              callbacks.onToolResult?.(res.toolName, res.success ? res.content : res.error ?? '');
            },
            onToolError: (_, err) => {
              callbacks.onAgentLog(agentId, `  ✗ 工具错误: ${err}`);
            },
          },
          internalSignal,
          callbacks.onToolApproval
            ? async (call) => callbacks.onToolApproval!(call.name, call.arguments)
            : undefined
        );
        resolve(result.output);
      } else {
        resolve(rawOutput);
      }
    }).catch(reject);
  });

  try {
    await Promise.race([aiPromise, timeoutPromise]);
  } catch (err) {
    if (err instanceof Error && err.message.includes('执行超时')) throw err;
    throw err;
  }

  // 执行插件钩子: onAgentOutput（后处理）
  output = await pluginRegistry.postProcessOutput({
    taskId: input.requirement.substring(0, 20),
    requirement: input.requirement,
    agentId,
    timestamp: Date.now(),
    sharedData: new Map(),
    registerData: () => {},
    signal,
  }, agentId, output);

  callbacks.onAgentProgress(agentId, 95);
  callbacks.onAgentOutput(agentId, output);
  log(`[${agentId}] 执行完成`);

  // 执行插件钩子: onAgentEnd
  await pluginRegistry.executeHook('onAgentEnd', {
    taskId: input.requirement.substring(0, 20),
    requirement: input.requirement,
    agentId,
    timestamp: Date.now(),
    sharedData: new Map(),
    registerData: () => {},
    signal,
  }, agentId, output);

  // 记录 assistant 输出
  conversationHistory.push({
    id: `assistant_${Date.now()}`,
    role: 'assistant',
    content: output,
    agentId,
    timestamp: Date.now(),
    tokens: estimateTokens(output),
  });

  return output;
}

// -------------------- 调度引擎主入口 --------------------

export async function runOrchestrator(
  input: TaskInput,
  documents: RagDocument[],
  modelMode: ModelType,
  temperature: number,
  maxTokens: number,
  enabledAgents: Set<AgentId>,
  agentConfigs: Record<AgentId, PerAgentConfig>,
  callbacks: OrchestratorCallbacks,
  config: OrchestratorConfig = {}
): Promise<void> {
  const controller = new AbortController();
  callbacks.onAgentLog('planner', '=== MADO 多Agent协同开始 ===');
  callbacks.onAgentLog('planner', `需求: ${input.requirement.substring(0, 100)}...`);

  // 执行插件钩子: onTaskStart
  await pluginRegistry.executeHook('onTaskStart', {
    taskId: input.requirement.substring(0, 20),
    requirement: input.requirement,
    agentId: 'planner',
    timestamp: Date.now(),
    sharedData: new Map(),
    registerData: () => {},
    signal: controller.signal,
  });

  // 确定 Agent 执行顺序
  const pipeline = config.pipeline;
  const agentOrder: AgentId[] = pipeline
    ? pipeline
        .filter(s => s.enabled && enabledAgents.has(s.agentId))
        .map(s => s.agentId)
    : (['planner', 'document', 'generator', 'quality', 'delivery'] as AgentId[]).filter(id => enabledAgents.has(id));

  if (agentOrder.length === 0) {
    callbacks.onError('没有启用的 Agent');
    return;
  }

  // 对话历史（用于上下文压缩）
  const conversationHistory: ConversationMessage[] = [];

  let previousOutput: unknown = null;
  let finalCode: Record<string, string> = {};
  let qualityReport = '';
  let instructions = '';
  let routes = '';
  let deployment = '';

  try {
    for (const agentId of agentOrder) {
      callbacks.onAgentProgress(agentId, 0);

      // 从 pipeline 获取超时配置
      const pipelineStep = pipeline?.find(s => s.agentId === agentId);
      const agentConfig = pipelineStep
        ? { enabled: true, timeout: pipelineStep.timeout }
        : agentConfigs[agentId];
      const timeout = agentConfig?.timeout ?? 30;
      const maxRetries = pipelineStep?.retryCount ?? 2;

      let result: unknown;
      let attempt = 0;

      while (attempt <= maxRetries) {
        try {
          result = await executeAgent(
            agentId,
            input,
            documents,
            modelMode,
            temperature,
            maxTokens,
            timeout,
            previousOutput,
            callbacks,
            controller.signal,
            getToolDefinitions(),
            conversationHistory,
            config
          );
          break;
        } catch (err) {
          attempt++;
          if (attempt > maxRetries) throw err;
          const retryDelay = 1000;
          callbacks.onAgentLog(agentId, `执行失败（尝试 ${attempt}/${maxRetries}），${retryDelay / 1000}秒后重试...`);
          await new Promise(r => setTimeout(r, retryDelay));
        }
      }

      previousOutput = result;
      callbacks.onAgentComplete(agentId, previousOutput);

      if (agentId === 'delivery' && typeof previousOutput === 'string') {
        const result = parseDeliveryResult(previousOutput);
        finalCode = result.code;
        instructions = result.instructions;
        routes = result.routes;
        deployment = result.deployment;
        qualityReport = result.qualityReport;
      }

      if (agentId === 'quality' && typeof previousOutput === 'string') {
        qualityReport = previousOutput;
      }
    }

    const deliveryResult: DeliveryResult = {
      code: finalCode,
      instructions,
      routes,
      deployment,
      qualityReport,
    };

    callbacks.onComplete(deliveryResult);
    callbacks.onAgentLog('planner', '=== 任务执行完成 ===');

    // 执行插件钩子: onTaskEnd
    await pluginRegistry.executeHook('onTaskEnd', {
      taskId: input.requirement.substring(0, 20),
      requirement: input.requirement,
      agentId: 'delivery',
      timestamp: Date.now(),
      sharedData: new Map(),
      registerData: () => {},
      signal: controller.signal,
    }, deliveryResult);

  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      callbacks.onError('任务已被中断');
    } else {
      callbacks.onError((err as Error).message);
    }

    // 执行插件钩子: onTaskError
    await pluginRegistry.executeHook('onTaskError', {
      taskId: input.requirement.substring(0, 20),
      requirement: input.requirement,
      agentId: 'planner',
      timestamp: Date.now(),
      sharedData: new Map(),
      registerData: () => {},
      signal: controller.signal,
    }, err as Error);
  }
}

// -------------------- 解析交付结果 --------------------

interface DeliveryResultJSON {
  code?: Record<string, string>;
  instructions?: string;
  routes?: string;
  deployment?: string;
  qualityReport?: string;
}

function parseDeliveryResult(text: string): DeliveryResult {
  const jsonResult = tryParseJSON(text);
  if (jsonResult) return jsonResult;

  const codeBlockRegex = /```(?:typescript|tsx|ts|jsx|js|html|css|json)?\s*\n?([\s\S]*?)```/g;
  const files: Record<string, string> = {};
  let match;
  let fileIndex = 1;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const code = match[1].trim();
    if (!code) continue;
    const filename = extractFilename(code) || `generated_${fileIndex}.tsx`;
    files[filename] = code;
    fileIndex++;
  }

  return {
    code: files,
    instructions: extractSection(text, '使用说明') || extractSection(text, 'instructions') || '',
    routes: extractSection(text, '路由说明') || extractSection(text, 'routes') || '',
    deployment: extractSection(text, '部署步骤') || extractSection(text, 'deployment') || '',
    qualityReport: extractSection(text, '质检报告') || extractSection(text, 'qualityReport') || '',
  };
}

function tryParseJSON(text: string): DeliveryResult | null {
  const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/gi;
  let match;

  while ((match = jsonBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as DeliveryResultJSON;
      if (isValidDeliveryResult(parsed)) {
        return {
          code: parsed.code ?? {},
          instructions: parsed.instructions ?? '',
          routes: parsed.routes ?? '',
          deployment: parsed.deployment ?? '',
          qualityReport: parsed.qualityReport ?? '',
        };
      }
    } catch {}
  }

  const jsonObjRegex = /\{[\s\S]*?"code"[\s\S]*?\}/;
  const objMatch = text.match(jsonObjRegex);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]) as DeliveryResultJSON;
      if (isValidDeliveryResult(parsed)) {
        return {
          code: parsed.code ?? {},
          instructions: parsed.instructions ?? '',
          routes: parsed.routes ?? '',
          deployment: parsed.deployment ?? '',
          qualityReport: parsed.qualityReport ?? '',
        };
      }
    } catch {}
  }

  return null;
}

function isValidDeliveryResult(obj: unknown): obj is DeliveryResultJSON {
  return typeof obj === 'object' && obj !== null && Object.keys(obj).length > 0;
}

function extractSection(text: string, section: string): string {
  const lines = text.split('\n');
  let capturing = false;
  const result: string[] = [];

  for (const line of lines) {
    if (line.includes(section) || line.startsWith('#')) {
      capturing = true;
      result.push(line);
    } else if (capturing && line.startsWith('#')) {
      break;
    } else if (capturing) {
      result.push(line);
    }
  }

  return result.join('\n');
}

function extractFilename(code: string): string | null {
  const match = code.match(/filename[:\s]*["']?([^"'\n]+)["']?/i);
  if (match) return match[1];
  const firstLine = code.split('\n')[0];
  const commentMatch = firstLine.match(/filename[:\s]*([^\s]+)/);
  if (commentMatch) return commentMatch[1];
  return null;
}
