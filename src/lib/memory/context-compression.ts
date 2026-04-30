// ============================================================
// MADO - Context Compression / Memory Management
// 对话历史压缩，防止上下文溢出
// ============================================================

import type { AgentId } from '@/types';
import { readAITextStream } from '@/lib/ai-stream';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  agentId?: AgentId;
  timestamp: number;
  tokens?: number;
  compressed?: boolean; // 是否已被压缩
}

export interface CompressionConfig {
  maxTokens?: number;       // 最大 token 预算
  summaryThreshold?: number; // 超过此 token 数开始压缩
  keepRecent?: number;       // 保留最近 N 条完整消息
  summaryModel?: 'gpt' | 'claude'; // 用于摘要的模型
}

const DEFAULT_CONFIG: Required<CompressionConfig> = {
  maxTokens: 60000,         // 保留 60k tokens 空间
  summaryThreshold: 30000,  // 超过 30k 开始压缩
  keepRecent: 3,             // 最近 3 条保留原文
  summaryModel: 'gpt',
};

// -------------------- Token 估算 --------------------

export function estimateTokens(text: string): number {
  // 中文: 每字符 ≈ 1 token
  // 英文: 每词 ≈ 1.3 token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) ?? []).length;
  const otherChars = text.length - chineseChars - englishWords;
  return Math.ceil(chineseChars + englishWords * 1.3 + otherChars * 0.25);
}

export function estimateMessagesTokens(messages: ConversationMessage[]): number {
  return messages.reduce((sum, m) => sum + (m.tokens ?? estimateTokens(m.content)), 0);
}

// -------------------- 核心：滑动窗口压缩 --------------------

export interface CompressionResult {
  compressed: ConversationMessage[];
  totalTokens: number;
  droppedTokens: number;
  summary?: string;
}

/**
 * 智能压缩对话历史
 * 策略：
 * 1. 保留 system prompt
 * 2. 保留最近 N 条完整消息
 * 3. 中间部分用摘要替代
 * 4. 超过预算时递归压缩
 */
export function compressContext(
  messages: ConversationMessage[],
  config: CompressionConfig = {}
): CompressionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 估算所有消息的 token
  const withTokens = messages.map(m => ({
    ...m,
    tokens: m.tokens ?? estimateTokens(m.content),
  }));

  const totalTokens = withTokens.reduce((s, m) => s + m.tokens, 0);

  // 未超过阈值，无需压缩
  if (totalTokens <= cfg.maxTokens) {
    return { compressed: messages, totalTokens, droppedTokens: 0 };
  }

  // 分离 system / recent / middle
  const system = withTokens.filter(m => m.role === 'system');
  const nonSystem = withTokens.filter(m => m.role !== 'system');

  // 保留最近 keepRecent 条
  const recent = nonSystem.slice(-cfg.keepRecent).map(m => ({ ...m, compressed: false }));
  const middle = nonSystem.slice(0, -cfg.keepRecent);

  const middleTokens = middle.reduce((s, m) => s + m.tokens, 0);

  if (middleTokens === 0) {
    // 没有中间消息，只是 recent 太长
    return { compressed: [...system, ...recent], totalTokens, droppedTokens: 0 };
  }

  // 中间部分：用占位摘要替代
  const middleSummary: ConversationMessage = {
    id: `summary_${Date.now()}`,
    role: 'assistant',
    content: `【${middle.length} 条对话历史已被压缩】\n\n原始对话概述：\n${
  middle
    .filter(m => m.role === 'user')
    .slice(-5)
    .map(m => `用户: ${m.content.substring(0, 100)}...`)
    .join('\n')
}\n\n主要讨论内容涉及 ${middle.filter(m => m.role === 'user').length} 轮交互，包含代码生成和质量问题。`,
    timestamp: middle[middle.length - 1]?.timestamp ?? Date.now(),
    tokens: estimateTokens(
      `[${middle.length} messages compressed, last at ${new Date(middle[middle.length - 1]?.timestamp ?? 0).toISOString()}]`
    ),
    compressed: true,
  };

  const result = [...system, middleSummary, ...recent];
  const resultTokens = estimateMessagesTokens(result);

  return {
    compressed: result,
    totalTokens: resultTokens,
    droppedTokens: totalTokens - resultTokens,
    summary: middleSummary.content,
  };
}

// -------------------- Agent 输出压缩 --------------------

export interface CodeCompressionOptions {
  maxLines?: number;     // 最大保留行数
  maxChars?: number;     // 最大字符数
  keepImports?: boolean; // 是否保留 import 语句
  keepTypes?: boolean;   // 是否保留类型定义
}

const DEFAULT_CODE_OPTS: Required<CodeCompressionOptions> = {
  maxLines: 300,
  maxChars: 15000,
  keepImports: true,
  keepTypes: true,
};

/**
 * 压缩过长的代码输出
 * 策略：保留头部（imports/types）、中间部分用省略号、尾部保留关键逻辑
 */
export function compressCodeOutput(
  code: string,
  options: CodeCompressionOptions = {}
): { compressed: string; wasCompressed: boolean; originalLines: number } {
  const opts = { ...DEFAULT_CODE_OPTS, ...options };
  const lines = code.split('\n');
  const originalLines = lines.length;

  if (lines.length <= opts.maxLines && code.length <= opts.maxChars) {
    return { compressed: code, wasCompressed: false, originalLines };
  }

  const parts: string[] = [];
  let kept = 0;

  // 保留 import / export 行
  if (opts.keepImports) {
    const imports = lines.filter(l =>
      l.trimStart().startsWith('import ') ||
      l.trimStart().startsWith('export {') ||
      l.trimStart().startsWith('require(')
    );
    parts.push(...imports);
    kept += imports.length;
  }

  // 保留类型定义行
  if (opts.keepTypes) {
    const types = lines.filter(l =>
      l.includes('interface ') ||
      l.includes('type ') ||
      l.includes(': React.FC') ||
      l.includes(': FC<') ||
      l.includes('Props') ||
      l.includes('Props =') ||
      l.includes('Props)')
    );
    parts.push(...types);
    kept += types.length;
  }

  // 保留首尾关键部分
  const remainingLines = lines.filter((l, i) => {
    if (l.trimStart().startsWith('import ') || l.trimStart().startsWith('export {')) return false;
    if (l.includes('interface ') || l.includes('type ') || l.includes(': React.FC') || l.includes(': FC<') || l.includes('Props')) return false;
    return true;
  });

  const keepHead = Math.min(60, Math.floor(remainingLines.length * 0.4));
  const keepTail = Math.min(40, Math.floor(remainingLines.length * 0.3));

  parts.push(...remainingLines.slice(0, keepHead));
  parts.push('\n// ... [中间代码省略] ...\n');
  parts.push(...remainingLines.slice(-keepTail));

  const compressed = parts.join('\n');

  return {
    compressed: compressed.substring(0, opts.maxChars),
    wasCompressed: true,
    originalLines,
  };
}

// -------------------- 对话窗口管理 --------------------

export class ConversationWindow {
  private messages: ConversationMessage[] = [];
  private config: Required<CompressionConfig>;

  constructor(config: CompressionConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  add(message: Omit<ConversationMessage, 'id' | 'tokens'>): void {
    this.messages.push({
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      tokens: estimateTokens(message.content),
    });
    this.maybeCompress();
  }

  getMessages(): ConversationMessage[] {
    return this.messages;
  }

  getRecent(n: number): ConversationMessage[] {
    return this.messages.slice(-n);
  }

  getTotalTokens(): number {
    return estimateMessagesTokens(this.messages);
  }

  private maybeCompress(): void {
    if (this.messages.length < 5) return;

    const result = compressContext(this.messages, this.config);
    if (result.droppedTokens > 0) {
      this.messages = result.compressed;
    }
  }

  reset(): void {
    this.messages = [];
  }

  // 从已有消息构建（用于恢复）
  load(messages: ConversationMessage[]): void {
    this.messages = messages.map(m => ({
      ...m,
      tokens: m.tokens ?? estimateTokens(m.content),
    }));
  }

  // 获取摘要信息
  getStats(): { messageCount: number; totalTokens: number; compressedCount: number } {
    return {
      messageCount: this.messages.length,
      totalTokens: this.getTotalTokens(),
      compressedCount: this.messages.filter(m => m.compressed).length,
    };
  }
}

// -------------------- 摘要生成（调用 AI）--------------------

export interface SummaryOptions {
  model?: 'gpt' | 'claude';
}

/**
 * 用 AI 对话历史生成摘要
 */
export async function generateSummary(
  messages: ConversationMessage[],
  options: SummaryOptions = {}
): Promise<string> {
  const model = options.model ?? 'gpt';

  const conversation = messages
    .filter(m => !m.compressed && m.role !== 'system')
    .slice(-20)
    .map(m => `${m.role}: ${m.content.substring(0, 200)}`)
    .join('\n');

  const summaryPrompt = `请用 2-3 句话简要总结以下对话的核心内容，保留关键信息：\n\n${conversation}`;

  try {
    const response = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: model === 'gpt' ? 'openai' : 'anthropic',
        messages: [
          { role: 'system', content: '你是一个对话摘要助手。请简洁地总结对话内容。' },
          { role: 'user', content: summaryPrompt },
        ],
        temperature: 0.1,
        maxTokens: 200,
      }),
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

    const summary = await readAITextStream(response.body);

    return summary.trim() || '对话摘要生成失败';
  } catch {
    return '摘要生成失败，使用默认压缩';
  }
}
