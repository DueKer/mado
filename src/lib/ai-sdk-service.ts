// ============================================================
// MADO AI Service
// 前端统一调用本项目的 /api/ai/stream，由服务端代理访问模型供应商。
// 这样避免浏览器直连 api.openai.com 造成 CORS/网络问题，也避免 API Key 暴露。
// ============================================================

import { isEncoded, decodeSecret } from './utils';
import { readAITextStream, type AIStreamChunk } from './ai-stream';

export type { AIStreamChunk };

type Provider = 'openai' | 'anthropic' | 'groq' | 'siliconflow';

export interface AIRequestOptions {
  model: 'gpt' | 'claude';
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onChunk?: (chunk: AIStreamChunk) => void;
  signal?: AbortSignal;
}

interface ClientConfig {
  apiKeys?: {
    openai?: string;
    anthropic?: string;
    groq?: string;
    siliconflow?: string;
  };
  baseUrl?: string;
  gptModel?: string;
  claudeModel?: string;
}

function readConfig(): ClientConfig {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem('mado_config');
    if (!stored) return {};
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

function decodeMaybe(value: string | undefined): string {
  if (!value) return '';
  return isEncoded(value) ? decodeSecret(value) : value;
}

function resolveProvider(model: 'gpt' | 'claude', config: ClientConfig): Provider {
  if (model === 'claude') return 'anthropic';
  const openaiKey = decodeMaybe(config.apiKeys?.openai);
  const groqKey = decodeMaybe(config.apiKeys?.groq);
  const siliconflowKey = decodeMaybe(config.apiKeys?.siliconflow);
  if (!openaiKey && siliconflowKey) return 'siliconflow';
  if (!openaiKey && !siliconflowKey && groqKey) return 'groq';
  return 'openai';
}

function resolveModelName(model: 'gpt' | 'claude', provider: Provider, config: ClientConfig): string {
  if (model === 'claude') return config.claudeModel || 'claude-sonnet-4-20250514';
  if (config.gptModel) return config.gptModel;
  if (provider === 'groq') return 'llama-3.3-70b-versatile';
  if (provider === 'siliconflow') return 'Qwen/Qwen2.5-7B-Instruct';
  return 'gpt-5.4-mini';
}

async function parseError(response: Response): Promise<string> {
  try {
    const json = await response.json();
    if (json?.error) return String(json.error);
  } catch {}
  return response.statusText || `HTTP ${response.status}`;
}

export async function callAI(
  model: 'gpt' | 'claude',
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
    onChunk?: (chunk: AIStreamChunk) => void;
    signal?: AbortSignal;
  }
): Promise<string> {
  const { temperature = 0.1, maxTokens = 4096, onChunk, signal } = options ?? {};
  const config = readConfig();
  const provider = resolveProvider(model, config);
  const modelName = resolveModelName(model, provider, config);

  console.log(`[AI Service] 通过 /api/ai/stream 调用 ${provider}，model=${modelName}`);

  const response = await fetch('/api/ai/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      messages,
      model: modelName,
      temperature,
      maxTokens,
      baseUrl: provider === 'openai' ? config.baseUrl : (provider === 'siliconflow' ? 'https://api.siliconflow.cn/v1' : undefined),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`AI API 错误 ${response.status}: ${await parseError(response)}`);
  }
  if (!response.body) throw new Error('AI API 没有返回响应体');

  return readAITextStream(response.body, onChunk);
}
