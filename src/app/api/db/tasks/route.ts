// ============================================================
// MADO - Tasks API
// 提供任务的完整 CRUD 操作
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { tasks } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

type TaskRow = typeof tasks.$inferSelect;
type TaskInsert = typeof tasks.$inferInsert;

// GET /api/db/tasks - 获取所有任务
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') ?? '50');
    const offset = parseInt(searchParams.get('offset') ?? '0');
    const status = searchParams.get('status');

    let results: TaskRow[];
    if (status) {
      results = await db
        .select()
        .from(tasks)
        .where(eq(tasks.status, status))
        .orderBy(desc(tasks.createdAt))
        .limit(limit)
        .offset(offset);
    } else {
      results = await db
        .select()
        .from(tasks)
        .orderBy(desc(tasks.createdAt))
        .limit(limit)
        .offset(offset);
    }

    const formatted = results.map(r => ({
      id: r.id,
      name: r.name,
      input: JSON.parse(r.input),
      executions: r.executions ? JSON.parse(r.executions) : null,
      status: r.status,
      result: r.result ? JSON.parse(r.result) : null,
      createdAt: (r.createdAt as Date)?.getTime() ?? 0,
      updatedAt: (r.updatedAt as Date)?.getTime() ?? 0,
    }));

    return NextResponse.json(formatted);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/db/tasks - 创建任务
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();

    const insertData: TaskInsert = {
      id: body.id,
      name: body.name,
      input: JSON.stringify(body.input),
      executions: body.executions ? JSON.stringify(body.executions) : null,
      status: body.status,
      result: body.result ? JSON.stringify(body.result) : null,
      createdAt: new Date(body.createdAt),
      updatedAt: new Date(body.createdAt),
    };

    await db.insert(tasks).values(insertData);
    return NextResponse.json({ ok: true, id: body.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/db/tasks - 更新任务
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();

    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updates: Partial<TaskInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.executions !== undefined) updates.executions = JSON.stringify(body.executions);
    if (body.status !== undefined) updates.status = body.status;
    if (body.result !== undefined) updates.result = JSON.stringify(body.result);

    await db.update(tasks).set(updates).where(eq(tasks.id, body.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/db/tasks?id=xxx - 删除任务
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const db = getDb();
    await db.delete(tasks).where(eq(tasks.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
