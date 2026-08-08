# ============================================================
# MADO Backend - SQLAlchemy Models
# 对齐 frontend/src/lib/db/schema.ts 的表结构
# ============================================================

from __future__ import annotations

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    input: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    executions: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    status: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    created_at: Mapped[int] = mapped_column(Integer, nullable=False)  # epoch ms
    updated_at: Mapped[int] = mapped_column(Integer, nullable=False)  # epoch ms

    __table_args__ = (
        Index("tasks_status_idx", "status"),
        Index("tasks_created_idx", "created_at"),
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    task_id: Mapped[str] = mapped_column(
        String, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    agent_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        Index("chat_messages_task_idx", "task_id"),
        Index("chat_messages_created_idx", "created_at"),
    )


class RagDocument(Base):
    __tablename__ = "rag_documents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)  # 'file' | 'rule'
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    slices: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    upload_time: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (Index("rag_documents_type_idx", "type"),)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    doc_id: Mapped[str] = mapped_column(
        String, ForeignKey("rag_documents.id", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    keywords: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    index: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (Index("document_chunks_doc_idx", "doc_id"),)


class AppConfigModel(Base):
    __tablename__ = "app_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # always 'default'
    api_keys_openai: Mapped[str] = mapped_column(Text, nullable=False, default="")
    api_keys_anthropic: Mapped[str] = mapped_column(Text, nullable=False, default="")
    api_keys_groq: Mapped[str] = mapped_column(Text, nullable=False, default="")
    api_keys_siliconflow: Mapped[str] = mapped_column(Text, nullable=False, default="")
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    gpt_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    claude_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_mode: Mapped[str] = mapped_column(Text, nullable=False, default="dual")
    temperature: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # int(float*10)
    max_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=4096)
    timeout: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    agent_configs: Mapped[str] = mapped_column(Text, nullable=False, default="{}")  # JSON string
    updated_at: Mapped[int] = mapped_column(Integer, nullable=False)
