# ============================================================
# MADO Backend - RAG Document Loader
# 从数据库加载知识库文档
# ============================================================

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from app.db.models import RagDocument as RagDocumentModel


def load_rag_documents_from_db(db: Session) -> list[dict]:
    rows = (
        db.query(RagDocumentModel)
        .order_by(RagDocumentModel.upload_time.desc())
        .all()
    )
    documents: list[dict] = []
    for doc in rows:
        try:
            slices = json.loads(doc.slices) if doc.slices else []
            if not isinstance(slices, list):
                slices = []
        except Exception:
            slices = []
        documents.append(
            {
                "id": doc.id,
                "name": doc.name,
                "type": doc.type,
                "fileSize": doc.file_size,
                "content": doc.content,
                "slices": slices,
                "uploadTime": doc.upload_time,
            }
        )
    return documents
