// ============================================================
// MADO - 数据库初始化 API
// 首次访问时自动创建表结构
// ============================================================

import { NextResponse } from 'next/server';
import { initializeDatabase } from '@/lib/db/init';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';

export async function POST() {
  try {
    await initializeDatabase();
    return NextResponse.json({ ok: true, message: 'Database initialized' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    await initializeDatabase();
    const db = getDb();

    // 检查各表是否存在
    const tables = ['tasks', 'chat_messages', 'rag_documents', 'document_chunks', 'app_configs'];
    const results: Record<string, boolean> = {};

    for (const table of tables) {
      try {
        await db.run(sql.raw(`SELECT 1 FROM ${table} LIMIT 1`));
        results[table] = true;
      } catch {
        results[table] = false;
      }
    }

    const allReady = Object.values(results).every(Boolean);
    return NextResponse.json({ ok: allReady, tables: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
