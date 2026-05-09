import { desc } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { initializeDatabase } from '@/lib/db/init';
import { ragDocuments } from '@/lib/db/schema';
import type { RagDocument, RagSlice } from '@/types';

export async function loadRagDocumentsFromDb(): Promise<RagDocument[]> {
  await initializeDatabase();
  const db = getDb();
  const docs = await db.select().from(ragDocuments).orderBy(desc(ragDocuments.uploadTime));

  return docs.map(doc => ({
    id: doc.id,
    name: doc.name,
    type: doc.type as RagDocument['type'],
    fileSize: doc.fileSize ?? undefined,
    content: doc.content,
    slices: parseSlices(doc.slices),
    uploadTime: doc.uploadTime?.getTime() ?? 0,
  }));
}

function parseSlices(value: string): RagSlice[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
