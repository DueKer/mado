# ============================================================
# MADO Backend - FastAPI 入口
# 启动: uvicorn main:app --reload --port 8000
# ============================================================

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import config as config_routes
from app.api.routes import db_init, orchestrator_ws, rag_docs, rag_query, tasks
from app.config import get_settings
from app.db.session import init_db

logging.basicConfig(level=logging.INFO)

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="MADO Backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


app.include_router(db_init.router, prefix="/api/db/init")
app.include_router(tasks.router, prefix="/api/db/tasks")
app.include_router(config_routes.router, prefix="/api/db/config")
app.include_router(rag_docs.router, prefix="/api/db/rag")
app.include_router(rag_query.router, prefix="/api/rag")
app.include_router(orchestrator_ws.router)

