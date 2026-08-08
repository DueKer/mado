# ============================================================
# MADO Backend - /api/db/init
# ============================================================

from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import get_engine, init_db

router = APIRouter()

TABLE_NAMES = ["tasks", "chat_messages", "rag_documents", "document_chunks", "app_configs"]


@router.post("")
def db_init_post():
    """Initialize database (create tables, run migrations)."""
    try:
        init_db()
        return {"ok": True, "message": "Database initialized"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.get("")
def db_init_get():
    """Check which tables exist."""
    try:
        init_db()
        engine = get_engine()
        results: dict[str, bool] = {}
        with engine.connect() as conn:
            for table in TABLE_NAMES:
                try:
                    conn.execute(text(f"SELECT 1 FROM {table} LIMIT 1"))
                    results[table] = True
                except Exception:
                    results[table] = False
        all_ready = all(results.values())
        return {"ok": all_ready, "tables": results}
    except Exception as e:
        return {"ok": False, "error": str(e)}
