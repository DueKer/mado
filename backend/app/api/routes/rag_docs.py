# ============================================================
# MADO Backend - /api/db/rag  (RAG Document CRUD)
# ============================================================

from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.models import DocumentChunk, RagDocument
from app.db.session import get_db, init_db
from app.schemas import RagDocumentCreate, RagDocumentOut, RagDocumentUpdate

router = APIRouter()


def _row_to_out(row: RagDocument) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "type": row.type,
        "fileSize": row.file_size,
        "content": row.content,
        "slices": json.loads(row.slices) if row.slices else [],
        "uploadTime": row.upload_time,
    }


@router.get("")
def list_rag_docs(db: Session = Depends(get_db)):
    init_db()
    rows = db.query(RagDocument).order_by(RagDocument.upload_time.desc()).all()
    return [_row_to_out(r) for r in rows]


@router.post("")
def create_rag_doc(body: RagDocumentCreate, db: Session = Depends(get_db)):
    init_db()
    # Upsert document
    existing = db.get(RagDocument, body.id)
    now = body.uploadTime or int(time.time() * 1000)
    slices_json = json.dumps([s.model_dump() for s in body.slices])
    if existing:
        existing.name = body.name
        existing.type = body.type
        existing.file_size = body.fileSize
        existing.content = body.content
        existing.slices = slices_json
        existing.upload_time = now
    else:
        db.add(
            RagDocument(
                id=body.id,
                name=body.name,
                type=body.type,
                file_size=body.fileSize,
                content=body.content,
                slices=slices_json,
                upload_time=now,
            )
        )
    db.flush()

    # Insert / replace chunks
    db.query(DocumentChunk).filter(DocumentChunk.doc_id == body.id).delete()
    for s in body.slices:
        db.add(
            DocumentChunk(
                id=s.id,
                doc_id=body.id,
                content=s.content,
                keywords=json.dumps(s.keywords),
                index=s.index,
            )
        )
    db.commit()
    return {"ok": True, "id": body.id}


@router.patch("")
def update_rag_doc(body: RagDocumentUpdate, db: Session = Depends(get_db)):
    init_db()
    row = db.get(RagDocument, body.id)
    if not row:
        raise HTTPException(status_code=404, detail="Document not found")
    if body.name is not None:
        row.name = body.name
    if body.content is not None:
        row.content = body.content
    if body.slices is not None:
        row.slices = json.dumps([s.model_dump() for s in body.slices])
        # Rebuild chunks
        db.query(DocumentChunk).filter(DocumentChunk.doc_id == body.id).delete()
        for s in body.slices:
            db.add(
                DocumentChunk(
                    id=s.id,
                    doc_id=body.id,
                    content=s.content,
                    keywords=json.dumps(s.keywords),
                    index=s.index,
                )
            )
    db.commit()
    return {"ok": True}


@router.delete("")
def delete_rag_doc(id: str = Query(...), db: Session = Depends(get_db)):
    init_db()
    db.query(DocumentChunk).filter(DocumentChunk.doc_id == id).delete()
    row = db.get(RagDocument, id)
    if row:
        db.delete(row)
    db.commit()
    return {"ok": True}
