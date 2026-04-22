// ============================================================
// MADO - RAG Documents API
// 提供知识库文档的完整 CRUD 操作
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { ragDocuments, documentChunks } from '@/lib/db/schema';
import type { RagDocUpdate } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

// GET /api/db/rag - 获取所有知识库文档
export async function GET() {
  try {
    const db = getDb();
    const docs = await db.select().from(ragDocuments).orderBy(desc(ragDocuments.uploadTime));

    const formatted = docs.map(d => ({
      ...d,
      slices: JSON.parse(d.slices),
      uploadTime: d.uploadTime?.getTime() ?? 0,
    }));

    return NextResponse.json(formatted);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/db/rag - 添加知识库文档
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();

    // 插入文档
    await db.insert(ragDocuments).values({
      id: body.id,
      name: body.name,
      type: body.type,
      fileSize: body.fileSize ?? null,
      content: body.content,
      slices: JSON.stringify(body.slices ?? []),
      uploadTime: new Date(body.uploadTime ?? Date.now()),
    });

    // 插入切片
    if (body.slices?.length) {
      for (const slice of body.slices) {
        await db.insert(documentChunks).values({
          id: slice.id,
          docId: body.id,
          content: slice.content,
          keywords: JSON.stringify(slice.keywords ?? []),
          index: slice.index,
        });
      }
    }

    return NextResponse.json({ ok: true, id: body.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/db/rag?id=xxx - 删除文档
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = getDb();
    await db.delete(documentChunks).where(eq(documentChunks.docId, id));
    await db.delete(ragDocuments).where(eq(ragDocuments.id, id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/db/rag - 更新文档
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: RagDocUpdate = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.content !== undefined) updates.content = body.content;
    if (body.slices !== undefined) updates.slices = JSON.stringify(body.slices);

    if (Object.keys(updates).length > 0) {
      const existing = await db.select().from(ragDocuments).where(eq(ragDocuments.id, body.id)).limit(1);
      if (existing.length > 0) {
        await db.update(ragDocuments).set(updates).where(eq(ragDocuments.id, body.id));
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
