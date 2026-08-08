# ============================================================
# MADO Backend - /api/rag/search, /api/rag/ask
# ============================================================

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.rag.loader import load_rag_documents_from_db
from app.rag.middleware import RagMiddlewareConfig, build_context_window
from app.schemas import RagAskRequest, RagSearchRequest
from app.services.providers import generate_server_ai_text

router = APIRouter()


@router.post("/search")
def rag_search_route(body: RagSearchRequest, db: Session = Depends(get_db)):
    query = body.query.strip() if body.query else ""
    if not query:
        raise HTTPException(status_code=400, detail="query is required")

    documents = load_rag_documents_from_db(db)
    config = RagMiddlewareConfig.from_overrides(
        topK=body.topK,
        maxTokensPerSlice=body.maxTokensPerSlice,
        enableBM25=body.enableBM25,
        enableAgentAwareness=body.enableAgentAwareness,
    )
    context = build_context_window(documents, query, body.agentId or "generator", config)

    return {
        "query": query,
        "documents": context.documents,
        "totalTokens": context.totalTokens,
        "summary": context.summary,
        "corpus": {
            "documents": len(documents),
            "slices": sum(len(d["slices"]) for d in documents),
        },
    }


@router.post("/ask")
def rag_ask_route(body: RagAskRequest, db: Session = Depends(get_db)):
    question = body.question.strip() if body.question else ""
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    documents = load_rag_documents_from_db(db)
    config = RagMiddlewareConfig.from_overrides(
        topK=body.topK,
        maxTokensPerSlice=body.maxTokensPerSlice,
        enableBM25=body.enableBM25,
        enableAgentAwareness=body.enableAgentAwareness,
    )
    context = build_context_window(documents, question, "document", config)

    if not context.documents:
        return {
            "answer": "没有检索到相关知识库内容，无法基于私有知识回答。",
            "sources": [],
            "totalTokens": 0,
        }

    source_text = "\n\n".join(
        f"【来源{i + 1}】文档: {item['doc']['name']}；切片: {item['slice']['index'] + 1}；分数: {item['score']:.2f}\n{item['slice']['content']}"
        for i, item in enumerate(context.documents)
    )

    history_messages = [
        {"role": h.role, "content": h.content} for h in (body.history or [])[-6:]
    ]

    system_prompt = "\n".join(
        [
            "你是私有知识库 RAG 问答助手。",
            "必须只基于【知识库来源】回答，不能编造未给出的事实。",
            "如果来源不足以回答，要明确说明缺少依据。",
            "回答中的关键结论必须使用 [来源1]、[来源2] 这样的编号引用。",
            "回答末尾输出“引用来源”列表，列出使用过的来源编号和文档名。",
        ]
    )

    messages = (
        [{"role": "system", "content": system_prompt}]
        + history_messages
        + [{"role": "user", "content": f"【用户问题】\n{question}\n\n【知识库来源】\n{source_text}"}]
    )

    try:
        answer = generate_server_ai_text(
            db, messages=messages, provider="openai", temperature=0.1, max_tokens=1800
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "answer": answer,
        "sources": context.documents,
        "totalTokens": context.totalTokens,
        "summary": context.summary,
    }
