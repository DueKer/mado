// ============================================================
// MADO AI Stream API Route
// 服务端代理：用 Vercel AI SDK 调用 OpenAI / Claude
// 支持 SSE 流式输出，前端通过 /api/ai/stream 调用
// API Key 从环境变量读取，更安全
// ============================================================

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, type CoreMessage } from 'ai';

// -------------------- 请求体类型 --------------------

type Provider = 'openai' | 'anthropic' | 'groq' | 'siliconflow';

interface AIStreamRequest {
  provider: Provider;
  messages: CoreMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  baseUrl?: string;
}

// -------------------- 模型工厂（在 handler 内创建，确保 env 已注入） --------------------

function createModel(provider: Provider, modelName?: string, apiKey?: string, baseUrl?: string) {
  if (provider === 'openai') {
    return createOpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY })(modelName ?? 'gpt-4o');
  } else if (provider === 'anthropic') {
    return createAnthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY })(modelName ?? 'claude-sonnet-4-20250514');
  } else if (provider === 'groq') {
    return createOpenAI({
      apiKey: apiKey ?? process.env.GROQ_API_KEY,
      baseURL: baseUrl ?? 'https://api.groq.com/openai/v1',
    })(modelName ?? 'llama-4-scout-17b-16e-instruct');
  } else {
    // SiliconFlow - OpenAI-compatible, 国内可用
    return createOpenAI({
      apiKey: apiKey ?? process.env.SILICONFLOW_API_KEY,
      baseURL: baseUrl ?? 'https://api.siliconflow.cn/v1',
    })(modelName ?? 'Qwen/Qwen2.5-7B-Instruct');
  }
}

// -------------------- POST Handler --------------------

export async function POST(request: Request) {
  try {
    const body: AIStreamRequest = await request.json();

    const {
      provider,
      messages,
      model,
      temperature = 0.1,
      maxTokens = 4096,
      baseUrl,
    } = body;

    // 从环境变量获取 API Key（服务端安全读取）
    const apiKeyMap: Record<Provider, string | undefined> = {
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      groq: process.env.GROQ_API_KEY,
      siliconflow: process.env.SILICONFLOW_API_KEY,
    };
    const apiKey = apiKeyMap[provider];

    if (!apiKey) {
      const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : provider === 'groq' ? 'GROQ_API_KEY' : 'SILICONFLOW_API_KEY';
      return new Response(
        JSON.stringify({
          error: `${provider === 'openai' ? 'OpenAI' : provider === 'anthropic' ? 'Anthropic' : provider === 'groq' ? 'Groq' : 'SiliconFlow'} API Key 未配置。请在 .env.local 中设置 ${keyName}。`
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const aiModel = createModel(provider, model, apiKey, baseUrl);

    // 构建 system prompt（如果有）
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    const system = systemMessages.map(m => String(m.content)).join('\n');

    const result = streamText({
      model: aiModel,
      system: system || undefined,
      messages: nonSystemMessages as CoreMessage[],
      temperature,
      maxTokens,
    });

    return result.toDataStreamResponse();

  } catch (error) {
    console.error('[AI Stream API Error]', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: `AI 服务调用失败: ${message}` }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// -------------------- GET Handler --------------------

export async function GET() {
  return new Response(
    JSON.stringify({
      name: 'MADO AI Stream API',
      version: '1.0.0',
      providers: ['openai', 'anthropic', 'groq', 'siliconflow'],
      models: {
        openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
        anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
        groq: ['llama-4-scout-17b-16e-instruct', 'llama-4-maverick-17b-128e-instruct', 'qwen-3.5-32b'],
        siliconflow: ['Qwen/Qwen2.5-7B-Instruct', 'deepseek-ai/DeepSeek-V2.5', 'THUDM/glm-4-9b-chat'],
      },
      usage: 'POST /api/ai/stream with { provider, messages, model, temperature, maxTokens }',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
