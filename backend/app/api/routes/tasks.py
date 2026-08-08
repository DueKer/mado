# ============================================================
# MADO Backend - /api/db/tasks  (CRUD)
# ============================================================

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.models import Task
from app.db.session import get_db, init_db
from app.schemas import TaskCreate, TaskOut, TaskUpdate

router = APIRouter()


def _row_to_out(row: Task) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "input": json.loads(row.input),
        "executions": json.loads(row.executions) if row.executions else None,
        "status": row.status,
        "result": json.loads(row.result) if row.result else None,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    }


@router.get("")
def list_tasks(
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
    db: Session = Depends(get_db),
):
    init_db()
    q = db.query(Task)
    if status:
        q = q.filter(Task.status == status)
    rows = q.order_by(Task.created_at.desc()).limit(limit).offset(offset).all()
    return [_row_to_out(r) for r in rows]


@router.post("")
def create_task(body: TaskCreate, db: Session = Depends(get_db)):
    init_db()
    existing = db.get(Task, body.id)
    task_data = {
        "id": body.id,
        "name": body.name,
        "input": json.dumps(body.input if isinstance(body.input, dict) else body.input.model_dump()),
        "executions": json.dumps(body.executions) if body.executions is not None else None,
        "status": body.status,
        "result": json.dumps(body.result.model_dump() if hasattr(body.result, "model_dump") else body.result)
        if body.result is not None
        else None,
        "created_at": body.createdAt,
        "updated_at": body.updatedAt or body.createdAt,
    }
    if existing:
        for k, v in task_data.items():
            setattr(existing, k, v)
    else:
        db.add(Task(**task_data))
    db.commit()
    return {"ok": True, "id": body.id}


@router.patch("")
def update_task(body: TaskUpdate, db: Session = Depends(get_db)):
    init_db()
    row = db.get(Task, body.id)
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    import time
    if body.name is not None:
        row.name = body.name
    if body.executions is not None:
        row.executions = json.dumps(body.executions)
    if body.status is not None:
        row.status = body.status
    if body.result is not None:
        row.result = json.dumps(
            body.result.model_dump() if hasattr(body.result, "model_dump") else body.result
        )
    row.updated_at = int(time.time() * 1000)
    db.commit()
    return {"ok": True}


@router.delete("")
def delete_task(id: str = Query(...), db: Session = Depends(get_db)):
    init_db()
    row = db.get(Task, id)
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}
