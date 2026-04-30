import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { getDb } from './client';

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  input TEXT NOT NULL,
  executions TEXT,
  status TEXT NOT NULL,
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_created_idx ON tasks (created_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agent_id TEXT,
  tokens INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS chat_messages_task_idx ON chat_messages (task_id);
CREATE INDEX IF NOT EXISTS chat_messages_created_idx ON chat_messages (created_at);

CREATE TABLE IF NOT EXISTS rag_documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  file_size INTEGER,
  content TEXT NOT NULL,
  slices TEXT NOT NULL,
  upload_time INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS rag_documents_type_idx ON rag_documents (type);

CREATE TABLE IF NOT EXISTS document_chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT NOT NULL,
  "index" INTEGER NOT NULL,
  FOREIGN KEY (doc_id) REFERENCES rag_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS document_chunks_doc_idx ON document_chunks (doc_id);

CREATE TABLE IF NOT EXISTS app_configs (
  id TEXT PRIMARY KEY,
  api_keys_openai TEXT NOT NULL DEFAULT '',
  api_keys_anthropic TEXT NOT NULL DEFAULT '',
  api_keys_groq TEXT NOT NULL DEFAULT '',
  api_keys_siliconflow TEXT NOT NULL DEFAULT '',
  base_url TEXT,
  gpt_model TEXT,
  claude_model TEXT,
  model_mode TEXT NOT NULL DEFAULT 'dual',
  temperature INTEGER NOT NULL DEFAULT 1,
  max_tokens INTEGER NOT NULL DEFAULT 4096,
  timeout INTEGER NOT NULL DEFAULT 30,
  agent_configs TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
`;

let initPromise: Promise<void> | null = null;

async function getColumnNames(table: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db.all(sql.raw(`PRAGMA table_info(${table})`));
  return new Set(rows.map((row) => String((row as { name: unknown }).name)));
}

async function renameColumnIfNeeded(table: string, from: string, to: string) {
  const db = getDb();
  const columns = await getColumnNames(table);
  if (columns.has(from) && !columns.has(to)) {
    await db.run(sql.raw(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`));
  }
}

async function addColumnIfMissing(table: string, column: string, definition: string) {
  const db = getDb();
  const columns = await getColumnNames(table);
  if (!columns.has(column)) {
    await db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`));
  }
}

async function migrateLegacyCamelCaseColumns() {
  await renameColumnIfNeeded('tasks', 'createdAt', 'created_at');
  await renameColumnIfNeeded('tasks', 'updatedAt', 'updated_at');

  await renameColumnIfNeeded('chat_messages', 'taskId', 'task_id');
  await renameColumnIfNeeded('chat_messages', 'agentId', 'agent_id');
  await renameColumnIfNeeded('chat_messages', 'createdAt', 'created_at');

  await renameColumnIfNeeded('rag_documents', 'fileSize', 'file_size');
  await renameColumnIfNeeded('rag_documents', 'uploadTime', 'upload_time');

  await renameColumnIfNeeded('document_chunks', 'docId', 'doc_id');

  await renameColumnIfNeeded('app_configs', 'apiKeysOpenai', 'api_keys_openai');
  await renameColumnIfNeeded('app_configs', 'apiKeysAnthropic', 'api_keys_anthropic');
  await renameColumnIfNeeded('app_configs', 'apiKeysGroq', 'api_keys_groq');
  await renameColumnIfNeeded('app_configs', 'baseUrl', 'base_url');
  await renameColumnIfNeeded('app_configs', 'gptModel', 'gpt_model');
  await renameColumnIfNeeded('app_configs', 'claudeModel', 'claude_model');
  await renameColumnIfNeeded('app_configs', 'modelMode', 'model_mode');
  await renameColumnIfNeeded('app_configs', 'maxTokens', 'max_tokens');
  await renameColumnIfNeeded('app_configs', 'agentConfigs', 'agent_configs');
  await renameColumnIfNeeded('app_configs', 'updatedAt', 'updated_at');

  await addColumnIfMissing('app_configs', 'api_keys_groq', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('app_configs', 'api_keys_siliconflow', "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing('app_configs', 'base_url', 'TEXT');
  await addColumnIfMissing('app_configs', 'gpt_model', 'TEXT');
  await addColumnIfMissing('app_configs', 'claude_model', 'TEXT');
}

export function initializeDatabase() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const dataDir = path.join(process.cwd(), 'data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const db = getDb();
    const statements = INIT_SQL.trim().split(';').filter((statement) => statement.trim());
    for (const statement of statements) {
      await db.run(sql.raw(statement));
    }

    await migrateLegacyCamelCaseColumns();
  })();

  return initPromise;
}

