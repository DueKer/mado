import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, type CoreMessage } from 'ai';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { initializeDatabase } from '@/lib/db/init';
import { appConfigs } from '@/lib/db/schema';

type Provider = 'openai' | 'anthropic' | 'groq' | 'siliconflow';

const CONFIG_ID = 'default';

async function readStoredConfig() {
  await initializeDatabase();
  const db = getDb();
  const rows = await db.select().from(appConfigs).where(eq(appConfigs.id, CONFIG_ID)).limit(1);
  return rows[0];
}

function normalizeOpenAIBaseURL(baseUrl: string | undefined) {
  if (!baseUrl) return undefined;

  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    if (url.pathname === '' || url.pathname === '/') {
      return `${url.origin}/v1`;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function normalizeOpenAIModelName(modelName: string | undefined) {
  if (!modelName || ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'].includes(modelName)) {
    return 'gpt-5.4-mini';
  }

  return modelName;
}

function createModel(provider: Provider, modelName?: string, apiKey?: string, baseUrl?: string) {
  if (provider === 'openai') {
    return createOpenAI({
      apiKey: apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: normalizeOpenAIBaseURL(baseUrl || process.env.OPENAI_BASE_URL),
    })(normalizeOpenAIModelName(modelName));
  }

  if (provider === 'anthropic') {
    return createAnthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY })(modelName ?? 'claude-sonnet-4-20250514');
  }

  if (provider === 'groq') {
    return createOpenAI({
      apiKey: apiKey ?? process.env.GROQ_API_KEY,
      baseURL: baseUrl ?? 'https://api.groq.com/openai/v1',
    })(modelName ?? 'llama-4-scout-17b-16e-instruct');
  }

  return createOpenAI({
    apiKey: apiKey ?? process.env.SILICONFLOW_API_KEY,
    baseURL: baseUrl ?? 'https://api.siliconflow.cn/v1',
  })(modelName ?? 'Qwen/Qwen2.5-7B-Instruct');
}

export async function generateServerAIText({
  provider = 'openai',
  messages,
  model,
  temperature = 0.1,
  maxTokens = 1600,
}: {
  provider?: Provider;
  messages: CoreMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}) {
  const storedConfig = await readStoredConfig();

  const apiKeyMap: Record<Provider, string | undefined> = {
    openai: storedConfig?.apiKeysOpenai || process.env.OPENAI_API_KEY,
    anthropic: storedConfig?.apiKeysAnthropic || process.env.ANTHROPIC_API_KEY,
    groq: storedConfig?.apiKeysGroq || process.env.GROQ_API_KEY,
    siliconflow: storedConfig?.apiKeysSiliconflow || process.env.SILICONFLOW_API_KEY,
  };
  const apiKey = apiKeyMap[provider];

  if (!apiKey) {
    throw new Error(`${provider} API Key 未配置`);
  }

  const modelName = model ?? (provider === 'openai' ? storedConfig?.gptModel ?? undefined : storedConfig?.claudeModel ?? undefined);
  const baseUrl = provider === 'openai' ? storedConfig?.baseUrl ?? process.env.OPENAI_BASE_URL ?? undefined : undefined;
  const aiModel = createModel(provider, modelName, apiKey, baseUrl);
  const systemMessages = messages.filter(m => m.role === 'system');
  const nonSystemMessages = messages.filter(m => m.role !== 'system');

  const result = await generateText({
    model: aiModel,
    system: systemMessages.map(m => String(m.content)).join('\n') || undefined,
    messages: nonSystemMessages,
    temperature,
    maxTokens,
  });

  return result.text;
}
