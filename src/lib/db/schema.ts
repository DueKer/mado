// ============================================================
// MADO - Drizzle ORM Schema
// 使用 libsql (WASM) 驱动，支持本地文件或 Turso 云端
// ============================================================

import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export type TaskUpdate = Partial<Pick<typeof tasks.$inferSelect, 'name' | 'executions' | 'status' | 'result' | 'updatedAt'>>;
export type TaskInsert = typeof tasks.$inferInsert;
export type RagDocUpdate = Partial<Pick<typeof ragDocuments.$inferSelect, 'name' | 'content' | 'slices'>>;
export type AppConfigUpdate = Partial<Pick<typeof appConfigs.$inferSelect, 'apiKeysOpenai' | 'apiKeysAnthropic' | 'apiKeysGroq' | 'apiKeysSiliconflow' | 'baseUrl' | 'gptModel' | 'claudeModel' | 'modelMode' | 'temperature' | 'maxTokens' | 'timeout' | 'agentConfigs' | 'updatedAt'>>;

// -------------------- Tasks --------------------

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  input: text('input').notNull(), // JSON stringified TaskInput
  executions: text('executions'), // JSON stringified Record<AgentId, AgentExecution>
  status: text('status').notNull(), // 'pending' | 'running' | 'completed' | 'failed' | 'interrupted'
  result: text('result'), // JSON stringified DeliveryResult
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('tasks_status_idx').on(table.status),
  index('tasks_created_idx').on(table.createdAt),
]);

// -------------------- Chat Messages --------------------

export const chatMessages = sqliteTable('chat_messages', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  agentId: text('agent_id'), // which agent generated this message
  tokens: integer('tokens'), // estimated token count
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('chat_messages_task_idx').on(table.taskId),
  index('chat_messages_created_idx').on(table.createdAt),
]);

// -------------------- RAG Documents --------------------

export const ragDocuments = sqliteTable('rag_documents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'file' | 'rule'
  fileSize: integer('file_size'), // bytes
  content: text('content').notNull(),
  slices: text('slices').notNull(), // JSON stringified RagSlice[]
  uploadTime: integer('upload_time', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('rag_documents_type_idx').on(table.type),
]);

// -------------------- Document Chunks (for keyword search) --------------------

export const documentChunks = sqliteTable('document_chunks', {
  id: text('id').primaryKey(),
  docId: text('doc_id').notNull().references(() => ragDocuments.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  keywords: text('keywords').notNull(), // JSON stringified string[]
  index: integer('index').notNull(), // chunk position within doc
}, (table) => [
  index('document_chunks_doc_idx').on(table.docId),
]);

// -------------------- App Config (DB-backed, replaces localStorage) --------------------

export const appConfigs = sqliteTable('app_configs', {
  id: text('id').primaryKey(), // always 'default'
  apiKeysOpenai: text('api_keys_openai').notNull().default(''),
  apiKeysAnthropic: text('api_keys_anthropic').notNull().default(''),
  apiKeysGroq: text('api_keys_groq').notNull().default(''),
  apiKeysSiliconflow: text('api_keys_siliconflow').notNull().default(''),
  baseUrl: text('base_url'), // optional custom API base URL
  gptModel: text('gpt_model'), // optional custom GPT model name
  claudeModel: text('claude_model'), // optional custom Claude model name
  modelMode: text('model_mode').notNull().default('dual'),
  temperature: integer('temperature').notNull().default(1), // stored as int (0.1 = 1)
  maxTokens: integer('max_tokens').notNull().default(4096),
  timeout: integer('timeout').notNull().default(30),
  agentConfigs: text('agent_configs').notNull().default('{}'), // JSON stringified
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
