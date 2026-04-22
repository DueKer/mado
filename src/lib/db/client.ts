// ============================================================
// MADO - Database Client
// 懒加载单例模式，避免 Next.js 热更新重复初始化
// ============================================================

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;

  const url = process.env.DATABASE_URL ?? 'file:./data/mado.db';

  const client = createClient({ url });
  _db = drizzle({ client, schema });

  return _db;
}

export type DB = ReturnType<typeof drizzle<typeof schema>>;
