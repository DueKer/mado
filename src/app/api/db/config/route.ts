// ============================================================
// MADO - Config API
// 提供配置的统一读写（DB-backed, 替代 localStorage）
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { appConfigs } from '@/lib/db/schema';
import type { AppConfigUpdate } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const CONFIG_ID = 'default';

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(appConfigs).where(eq(appConfigs.id, CONFIG_ID)).limit(1);

    if (rows.length === 0) {
      // 初始化默认配置
      await db.insert(appConfigs).values({
        id: CONFIG_ID,
        apiKeysOpenai: '',
        apiKeysAnthropic: '',
        modelMode: 'dual',
        temperature: 1,
        maxTokens: 4096,
        timeout: 30,
        agentConfigs: '{}',
        updatedAt: new Date(),
      });
      return NextResponse.json({
        apiKeys: { openai: '', anthropic: '' },
        modelMode: 'gpt-only',
        temperature: 0.1,
        maxTokens: 4096,
        timeout: 30,
        agentConfigs: {},
      });
    }

    const row = rows[0];
    return NextResponse.json({
      apiKeys: {
        openai: row.apiKeysOpenai || process.env.OPENAI_API_KEY || '',
        anthropic: row.apiKeysAnthropic || process.env.ANTHROPIC_API_KEY || '',
      },
      baseUrl: row.baseUrl || undefined,
      gptModel: row.gptModel || undefined,
      claudeModel: row.claudeModel || undefined,
      modelMode: row.modelMode,
      temperature: row.temperature / 10, // int → float
      maxTokens: row.maxTokens,
      timeout: row.timeout,
      agentConfigs: JSON.parse(row.agentConfigs),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();

    const updates: AppConfigUpdate = { updatedAt: new Date() };
    if (body.apiKeys?.openai !== undefined) updates.apiKeysOpenai = body.apiKeys.openai;
    if (body.apiKeys?.anthropic !== undefined) updates.apiKeysAnthropic = body.apiKeys.anthropic;
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
