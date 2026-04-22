// ============================================================
// MADO - 数据库初始化 API
// 首次访问时自动创建表结构
// ============================================================

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { sql } from 'drizzle-orm';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

// 自动建表 SQL（兼容 SQLite 约束限制）
const INIT_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  executions TEXT,
  status TEXT NOT NULL,
  result TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_created_idx ON tasks (createdAt);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  taskId TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agentId TEXT,
  tokens INTEGER,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chat_messages_task_idx ON chat_messages (taskId);
CREATE INDEX IF NOT EXISTS chat_messages_created_idx ON chat_messages (createdAt);

CREATE TABLE IF NOT EXISTS rag_documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  fileSize INTEGER,
  content TEXT NOT NULL,
  slices TEXT NOT NULL,
  uploadTime INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS rag_documents_type_idx ON rag_documents (type);

CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  docId TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  FOREIGN KEY (docId) REFERENCES rag_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS document_chunks_doc_idx ON document_chunks (docId);

CREATE TABLE IF NOT EXISTS app_configs (
  id TEXT PRIMARY KEY,
  apiKeysOpenai TEXT NOT NULL DEFAULT '',
  apiKeysAnthropic TEXT NOT NULL DEFAULT '',
  baseUrl TEXT,
  gptModel TEXT,
  claudeModel TEXT,
  modelMode TEXT NOT NULL DEFAULT 'dual',
  temperature INTEGER NOT NULL DEFAULT 1,
  maxTokens INTEGER NOT NULL DEFAULT 4096,
  timeout INTEGER NOT NULL DEFAULT 30,
  agentConfigs TEXT NOT NULL DEFAULT '{}',
  updatedAt INTEGER NOT NULL
);
`;

export async function POST() {
  try {
    // 确保 data 目录存在
    const dataDir = path.join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const db = getDb();

    // 执行建表语句
    const statements = INIT_SQL.trim().split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        await db.run(sql.raw(stmt));
      }
    }

    return NextResponse.json({ ok: true, message: 'Database initialized' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
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
