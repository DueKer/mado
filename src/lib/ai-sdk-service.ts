// ============================================================
// MADO AI Service - 浏览器直调 OpenAI / Claude
// 从 localStorage 读取 API Key，直接调用官方 API
// ============================================================

import { isEncoded, decodeSecret } from './utils';

export interface AIStreamChunk {
  text: string;
  done: boolean;
}

export interface AIRequestOptions {
  model: 'gpt' | 'claude';
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onChunk?: (chunk: AIStreamChunk) => void;
  signal?: AbortSignal;
}

const OPENAI_BASE = 'https://api.openai.com/v1';
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';

// -------------------- Key 读取 --------------------

function getAPIKey(model: 'gpt' | 'claude'): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem('mado_config');
    if (!stored) return '';
    const config = JSON.parse(stored);
    const rawKey = model === 'gpt'
      ? (config.apiKeys?.openai ?? '')
      : (config.apiKeys?.anthropic ?? '');
    if (isEncoded(rawKey)) return decodeSecret(rawKey);
    return rawKey;
  } catch {}
  return '';
}

function getBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const stored = localStorage.getItem('mado_config');
    if (!stored) return '';
    const config = JSON.parse(stored);
    return config.baseUrl ?? '';
  } catch {}
  return '';
}

function getGptModel(): string {
  if (typeof window === 'undefined') return 'gpt-4o';
  try {
    const stored = localStorage.getItem('mado_config');
    if (!stored) return 'gpt-4o';
    const config = JSON.parse(stored);
    return config.gptModel || 'gpt-4o';
  } catch {}
  return 'gpt-4o';
}

function getClaudeModel(): string {
  if (typeof window === 'undefined') return 'claude-sonnet-4-20250514';
  try {
    const stored = localStorage.getItem('mado_config');
    if (!stored) return 'claude-sonnet-4-20250514';
    const config = JSON.parse(stored);
    return config.claudeModel || 'claude-sonnet-4-20250514';
  } catch {}
  return 'claude-sonnet-4-20250514';
}

// -------------------- 统一入口 --------------------

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
  const { temperature = 0.1, maxTokens = 4096, stream = false, onChunk, signal } = options ?? {};

  const apiKey = getAPIKey(model);
  const baseUrl = getBaseUrl();
  const modelName = model === 'gpt' ? getGptModel() : getClaudeModel();
  console.log(`[AI Service] 读取 ${model} key: ${apiKey ? `成功 (${apiKey.length}字符)` : '失败(空)'}, baseUrl: ${baseUrl || '(默认)'}, model: ${modelName}`);
  if (!apiKey) {
    const err = new Error(`请先在设置中配置 ${model === 'gpt' ? 'OpenAI' : 'Claude'} API Key`);
    console.error('[AI Service]', err.message);
    throw err;
  }

  console.log(`[AI Service] 调用 ${model}，temperature=${temperature}, maxTokens=${maxTokens}, baseUrl=${baseUrl || 'api.openai.com'}, model=${modelName}`);

  if (stream && onChunk) {
    return model === 'gpt'
      ? streamGPT(apiKey, messages, temperature, maxTokens, onChunk, signal, baseUrl, modelName)
      : streamClaude(apiKey, messages, temperature, maxTokens, onChunk, signal, modelName);
  }

  return model === 'gpt'
    ? callGPT(apiKey, messages, temperature, maxTokens, signal, baseUrl, modelName)
    : callClaude(apiKey, messages, temperature, maxTokens, signal, modelName);
}

// -------------------- GPT 流式 --------------------

async function streamGPT(
  apiKey: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  temperature: number,
  maxTokens: number,
  onChunk: (chunk: AIStreamChunk) => void,
  signal?: AbortSignal,
  baseUrl?: string,
  model?: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  const mergedSignal = signal
    ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : signal)
    : controller.signal;

  const endpoint = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/chat/completions`
    : `${OPENAI_BASE}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages,
      temperature,
      max_tokens: Math.min(maxTokens, 32000),
      stream: true,
    }),
    signal: mergedSignal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`GPT API 错误 ${response.status}: ${err.error?.message ?? response.statusText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const content = JSON.parse(data).choices?.[0]?.delta?.content ?? '';
        if (content) {
          fullText += content;
          onChunk({ text: content, done: false });
        }
      } catch {}
    }
  }

  onChunk({ text: '', done: true });
  return fullText;
}

// -------------------- GPT 非流式 --------------------

async function callGPT(
  apiKey: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  temperature: number,
  maxTokens: number,
  signal?: AbortSignal,
  baseUrl?: string,
  model?: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  const mergedSignal = signal
    ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : signal)
    : controller.signal;

  const endpoint = baseUrl
    ? `${baseUrl.replace(/\/$/, '')}/chat/completions`
    : `${OPENAI_BASE}/chat/completions`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages,
      temperature,
      max_tokens: Math.min(maxTokens, 32000),
    }),
    signal: mergedSignal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`GPT API 错误 ${response.status}: ${err.error?.message ?? response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// -------------------- Claude 流式 --------------------

async function streamClaude(
  apiKey: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  temperature: number,
  maxTokens: number,
  onChunk: (chunk: AIStreamChunk) => void,
  signal?: AbortSignal,
  model?: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  const mergedSignal = signal
    ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : signal)
    : controller.signal;

  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs = messages.filter(m => m.role !== 'system');

  const response = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: Math.min(maxTokens, 8192),
      temperature,
      system: systemMsg?.content ?? '',
      messages: userMsgs,
      stream: true,
    }),
    signal: mergedSignal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`Claude API 错误 ${response.status}: ${err.error?.message ?? response.statusText}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const content = JSON.parse(line.slice(6))?.delta?.text ?? '';
        if (content) {
          fullText += content;
          onChunk({ text: content, done: false });
        }
      } catch {}
    }
  }

  onChunk({ text: '', done: true });
  return fullText;
}

// -------------------- Claude 非流式 --------------------

async function callClaude(
  apiKey: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  temperature: number,
  maxTokens: number,
  signal?: AbortSignal,
  _model?: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  const mergedSignal = signal
    ? (AbortSignal.any ? AbortSignal.any([signal, controller.signal]) : signal)
    : controller.signal;

  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs = messages.filter(m => m.role !== 'system');

  const response = await fetch(`${ANTHROPIC_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: _model || 'claude-sonnet-4-20250514',
      max_tokens: Math.min(maxTokens, 8192),
      temperature,
      system: systemMsg?.content ?? '',
      messages: userMsgs,
    }),
    signal: mergedSignal,
  });
  clearTimeout(timeoutId);

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`Claude API 错误 ${response.status}: ${err.error?.message ?? response.statusText}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text ?? '';
}
