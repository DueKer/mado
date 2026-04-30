// ============================================================
// MADO - Tool Execution Engine
// 解析模型输出中的 tool call，执行并返回结果
// ============================================================

import type { ToolCall, ToolResult } from './tool-schema';
import { executeTools } from './builtin-tools';
import { readAITextStream } from '@/lib/ai-stream';

// -------------------- 解析 Tool Calls --------------------

const TOOL_CALL_REGEX = /__TOOL_CALL__\s*\n([\s\S]*?)\n__END_TOOL_CALL__/;
const TOOL_CALL_GPT_REGEX = /tool_calls\s*:\s*\[([\s\S]*?)\]/i;

export interface ParsedToolCalls {
  calls: ToolCall[];
  raw: string;
}

/**
 * 从模型输出中解析 Tool Calls
 * 支持两种格式：
 * 1. 自定义格式: __TOOL_CALL__\n{...}\n__END_TOOL_CALL__
 * 2. OpenAI 格式: tool_calls: [{ name: "...", arguments: {...} }]
 */
export function parseToolCalls(text: string): ParsedToolCalls {
  const calls: ToolCall[] = [];

  // 方式1: 自定义格式
  const customMatch = text.match(TOOL_CALL_REGEX);
  if (customMatch) {
    try {
      const payload = JSON.parse(customMatch[1]);
      if (Array.isArray(payload)) {
        for (const item of payload) {
          calls.push({
            id: item.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: item.tool ?? item.name,
            arguments: typeof item.params === 'string' ? JSON.parse(item.params) : (item.params ?? {}),
          });
        }
      } else if (payload.tool || payload.name) {
        calls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: payload.tool ?? payload.name,
          arguments: typeof payload.params === 'string' ? JSON.parse(payload.params) : (payload.params ?? {}),
        });
      }
    } catch (e) {
      console.warn('[ToolEngine] Failed to parse custom tool call:', e);
    }
  }

  // 方式2: OpenAI tool_calls 格式
  if (calls.length === 0) {
    const gptMatch = text.match(TOOL_CALL_GPT_REGEX);
    if (gptMatch) {
      try {
        const block = gptMatch[1];
        const funcMatches = block.matchAll(/name\s*:\s*"?([^",}]+)"?/g);
        const argMatches = block.matchAll(/arguments\s*:\s*(\{[\s\S]*?\}(?=\s*,|\s*\}))/g);

        const names: string[] = [];
        for (const m of funcMatches) names.push(m[1].trim());

        const args: string[] = [];
        for (const m of argMatches) args.push(m[1]);

        for (let i = 0; i < names.length; i++) {
          calls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}_${i}`,
            name: names[i],
            arguments: args[i] ? JSON.parse(args[i]) : {},
          });
        }
      } catch (e) {
        console.warn('[ToolEngine] Failed to parse GPT tool_calls:', e);
      }
    }
  }

  return { calls, raw: customMatch?.[1] ?? '' };
}

/**
 * 从文本中移除 tool call 块，保留其他内容
 */
export function stripToolCalls(text: string): string {
  return text
    .replace(TOOL_CALL_REGEX, '')
    .replace(TOOL_CALL_GPT_REGEX, '')
    .replace(/\[(?:tool_calls|function_calls)\]/gi, '')
    .trim();
}

// -------------------- 执行 Tool Loop --------------------

export interface ToolLoopCallbacks {
  onToolStart?: (call: ToolCall) => void;
  onToolResult?: (result: ToolResult) => void;
  onToolError?: (call: ToolCall, error: string) => void;
}

const MAX_TOOL_LOOPS = 3; // 防止无限循环

/**
 * 在模型输出中执行所有 tool calls，将结果注入到对话中继续
 * 返回处理后的文本（tool calls 部分已被替换为结果）
 */
export async function executeToolLoop(
  model: 'gpt' | 'claude',
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  rawOutput: string,
  callbacks: ToolLoopCallbacks = {},
  signal?: AbortSignal,
  requestApproval?: (call: ToolCall) => Promise<boolean>
): Promise<{ output: string; allResults: ToolResult[] }> {
  const parsed = parseToolCalls(rawOutput);

  if (parsed.calls.length === 0) {
    return { output: rawOutput, allResults: [] };
  }

  const allResults: ToolResult[] = [];
  let finalOutput = stripToolCalls(rawOutput);
  let loopCount = 0;

  // 将模型输出追加为 assistant message
  const conversation: typeof messages = [...messages];
  conversation.push({ role: 'assistant', content: rawOutput });

  while (parsed.calls.length > 0 && loopCount < MAX_TOOL_LOOPS) {
    loopCount++;

    // 执行前检查审批
    const approvedCalls: ToolCall[] = [];
    const rejectedCalls: ToolCall[] = [];

    if (requestApproval) {
      for (const call of parsed.calls) {
        callbacks.onToolStart?.(call);
        try {
          const approved = await Promise.race([
            requestApproval(call),
            new Promise<false>((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), 30000) // 30s 超时拒绝
            ),
          ]);
          if (approved) {
            approvedCalls.push(call);
          } else {
            rejectedCalls.push(call);
            allResults.push({
              callId: call.id,
              toolName: call.name,
              success: false,
              content: '',
              error: '用户拒绝了此工具的执行',
            });
          }
        } catch {
          rejectedCalls.push(call);
          allResults.push({
            callId: call.id,
            toolName: call.name,
            success: false,
            content: '',
            error: '审批超时或被拒绝',
          });
        }
      }
    } else {
      // 无审批函数，全部自动执行
      approvedCalls.push(...parsed.calls);
    }

    // 执行已批准的工具
    const results = await executeTools(approvedCalls);

    for (const result of results) {
      if (result.success) {
        callbacks.onToolResult?.(result);
      } else {
        callbacks.onToolError?.(result.callId ? { id: result.callId, name: result.toolName, arguments: {} } : {
          id: result.callId,
          name: result.toolName,
          arguments: {},
        }, result.error ?? 'Unknown error');
      }
      allResults.push(result);
    }

    // 将结果注入为 tool message
    for (const result of results) {
      conversation.push({
        role: 'user',
        content: `【工具执行结果 - ${result.toolName}】\n${result.success ? result.content : `错误: ${result.error}`}`,
      });
    }
    for (const call of rejectedCalls) {
      conversation.push({
        role: 'user',
        content: `【工具执行结果 - ${call.name}】\n错误: 用户拒绝执行此工具`,
      });
    }

    // 再次解析（可能工具执行后又触发了新的 tool calls）
    const continued = await continueWithResults(model, conversation, signal);
    finalOutput = continued;
    parsed.calls.forEach(c => {
      const match = parseToolCalls(continued).calls.find(nc => nc.name === c.name && JSON.stringify(nc.arguments) === JSON.stringify(c.arguments));
      if (match) parsed.calls.splice(parsed.calls.indexOf(c), 1);
    });
  }

  return { output: finalOutput, allResults };
}

/**
 * 将工具结果发回模型继续生成
 */
async function continueWithResults(
  model: 'gpt' | 'claude',
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  signal?: AbortSignal
): Promise<string> {
  try {
    const response = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: model === 'gpt' ? 'openai' : 'anthropic',
        messages,
        temperature: 0.1,
        maxTokens: 2048,
      }),
      signal,
    });

    if (!response.ok) {
      let msg = `API error: ${response.status}`;
      try {
        const json = await response.json();
        if (json?.error) msg = json.error;
      } catch {}
      throw new Error(msg);
    }
    if (!response.body) throw new Error('No response body');
    return readAITextStream(response.body);
  } catch (e) {
    return `\n[工具执行后无法继续生成: ${e instanceof Error ? e.message : String(e)}]`;
  }
}
