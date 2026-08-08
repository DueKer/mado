# ============================================================
# MADO Backend - DB Session / Engine
# ============================================================

from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings
from app.db.models import Base

_engine = None
_SessionLocal = None


def get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        db_url = settings.database_url
        # 确保本地 SQLite 目录存在
        if db_url.startswith("sqlite:///"):
            db_path = db_url.replace("sqlite:///", "")
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(
            db_url,
            connect_args={"check_same_thread": False},
        )
    return _engine


def get_session_factory():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), autoflush=False, autocommit=False)
    return _SessionLocal


def get_db() -> Session:
    """FastAPI dependency: yield a DB session."""
    factory = get_session_factory()
    db: Session = factory()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables if they don't exist (idempotent)."""
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
    # Run legacy column migration (in case SQLite file was created by the old TS app)
    _migrate_legacy_columns(engine)


def _migrate_legacy_columns(engine) -> None:
    """Rename camelCase columns from the old libsql/Drizzle schema if they still exist."""
    renames = [
        ("tasks", "createdAt", "created_at"),
        ("tasks", "updatedAt", "updated_at"),
        ("chat_messages", "taskId", "task_id"),
        ("chat_messages", "agentId", "agent_id"),
        ("chat_messages", "createdAt", "created_at"),
        ("rag_documents", "fileSize", "file_size"),
        ("rag_documents", "uploadTime", "upload_time"),
        ("document_chunks", "docId", "doc_id"),
        ("app_configs", "apiKeysOpenai", "api_keys_openai"),
        ("app_configs", "apiKeysAnthropic", "api_keys_anthropic"),
        ("app_configs", "apiKeysGroq", "api_keys_groq"),
        ("app_configs", "baseUrl", "base_url"),
        ("app_configs", "gptModel", "gpt_model"),
        ("app_configs", "claudeModel", "claude_model"),
        ("app_configs", "modelMode", "model_mode"),
        ("app_configs", "maxTokens", "max_tokens"),
        ("app_configs", "agentConfigs", "agent_configs"),
        ("app_configs", "updatedAt", "updated_at"),
    ]
    with engine.begin() as conn:
        for table, old_col, new_col in renames:
            try:
                # Check if old column exists via PRAGMA
                result = conn.execute(text(f"PRAGMA table_info({table})"))
                cols = {row[1] for row in result.fetchall()}
                if old_col in cols and new_col not in cols:
                    conn.execute(
                        text(f"ALTER TABLE {table} RENAME COLUMN {old_col} TO {new_col}")
                    )
            except Exception:
                pass  # Table may not exist yet; that's fine

        # Add missing columns added in later migrations
        additions = [
            ("app_configs", "api_keys_groq", "TEXT NOT NULL DEFAULT ''"),
            ("app_configs", "api_keys_siliconflow", "TEXT NOT NULL DEFAULT ''"),
            ("app_configs", "base_url", "TEXT"),
            ("app_configs", "gpt_model", "TEXT"),
            ("app_configs", "claude_model", "TEXT"),
        ]
        for table, col, definition in additions:
            try:
                result = conn.execute(text(f"PRAGMA table_info({table})"))
                cols = {row[1] for row in result.fetchall()}
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {definition}"))
            except Exception:
                pass
