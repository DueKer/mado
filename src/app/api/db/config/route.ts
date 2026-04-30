// ============================================================
// MADO - Config API
// 提供配置的统一读写（DB-backed, 替代 localStorage）
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { initializeDatabase } from '@/lib/db/init';
import { appConfigs } from '@/lib/db/schema';
import type { AppConfigUpdate } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const CONFIG_ID = 'default';
const DEFAULT_AGENT_CONFIGS = {
  planner: { enabled: true, timeout: 30 },
  document: { enabled: true, timeout: 60 },
  generator: { enabled: true, timeout: 60 },
  quality: { enabled: true, timeout: 30 },
  delivery: { enabled: true, timeout: 30 },
};

function parseAgentConfigs(value: string | null) {
  try {
    const parsed = value ? JSON.parse(value) : {};
    return { ...DEFAULT_AGENT_CONFIGS, ...parsed };
  } catch {
    return DEFAULT_AGENT_CONFIGS;
  }
}

export async function GET() {
  try {
    await initializeDatabase();
    const db = getDb();
    const rows = await db.select().from(appConfigs).where(eq(appConfigs.id, CONFIG_ID)).limit(1);

    if (rows.length === 0) {
      // 初始化默认配置
      await db.insert(appConfigs).values({
        id: CONFIG_ID,
        apiKeysOpenai: '',
        apiKeysAnthropic: '',
        apiKeysGroq: '',
        apiKeysSiliconflow: '',
        modelMode: 'dual',
        temperature: 1,
        maxTokens: 4096,
        timeout: 30,
        agentConfigs: JSON.stringify(DEFAULT_AGENT_CONFIGS),
        updatedAt: new Date(),
      });
      return NextResponse.json({
        apiKeys: { openai: '', anthropic: '', groq: '', siliconflow: '' },
        modelMode: 'gpt-only',
        temperature: 0.1,
        maxTokens: 4096,
        timeout: 30,
        agentConfigs: DEFAULT_AGENT_CONFIGS,
      });
    }

    const row = rows[0];
    return NextResponse.json({
      apiKeys: {
        openai: row.apiKeysOpenai || process.env.OPENAI_API_KEY || '',
        anthropic: row.apiKeysAnthropic || process.env.ANTHROPIC_API_KEY || '',
        groq: row.apiKeysGroq || process.env.GROQ_API_KEY || '',
        siliconflow: row.apiKeysSiliconflow || process.env.SILICONFLOW_API_KEY || '',
      },
      baseUrl: row.baseUrl || undefined,
      gptModel: row.gptModel || undefined,
      claudeModel: row.claudeModel || undefined,
      modelMode: row.modelMode,
      temperature: row.temperature / 10, // int → float
      maxTokens: row.maxTokens,
      timeout: row.timeout,
      agentConfigs: parseAgentConfigs(row.agentConfigs),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await initializeDatabase();
    const body = await request.json();
    const db = getDb();

    const updates: AppConfigUpdate = { updatedAt: new Date() };
    if (body.apiKeys?.openai !== undefined) updates.apiKeysOpenai = body.apiKeys.openai;
    if (body.apiKeys?.anthropic !== undefined) updates.apiKeysAnthropic = body.apiKeys.anthropic;
    if (body.apiKeys?.groq !== undefined) updates.apiKeysGroq = body.apiKeys.groq;
    if (body.apiKeys?.siliconflow !== undefined) updates.apiKeysSiliconflow = body.apiKeys.siliconflow;
    if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl || null;
    if (body.gptModel !== undefined) updates.gptModel = body.gptModel || null;
    if (body.claudeModel !== undefined) updates.claudeModel = body.claudeModel || null;
    if (body.modelMode !== undefined) updates.modelMode = body.modelMode;
    if (body.temperature !== undefined) updates.temperature = Math.round(body.temperature * 10); // float → int
    if (body.maxTokens !== undefined) updates.maxTokens = body.maxTokens;
    if (body.timeout !== undefined) updates.timeout = body.timeout;
    if (body.agentConfigs !== undefined) updates.agentConfigs = JSON.stringify(body.agentConfigs);

    // upsert
    const existing = await db.select().from(appConfigs).where(eq(appConfigs.id, CONFIG_ID)).limit(1);
    if (existing.length > 0) {
      await db.update(appConfigs).set(updates).where(eq(appConfigs.id, CONFIG_ID));
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.insert(appConfigs).values({ id: CONFIG_ID, ...updates } as any);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
