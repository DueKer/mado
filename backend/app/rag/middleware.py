# ============================================================
# MADO Backend - RAG Middleware
# 增强版检索：BM25 + Query 扩展 + Agent 感知 + 重排序
# 移植自 frontend src/lib/rag/rag-middleware.ts
# ============================================================

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Optional

DEFAULT_TOP_K = 5
DEFAULT_MAX_TOKENS_PER_SLICE = 500

SYNONYMS: dict[str, list[str]] = {
    "组件": ["component", "组件", "部件"],
    "API": ["api", "接口", "rest", "endpoint"],
    "路由": ["route", "router", "路由", "path", "页面"],
    "状态": ["state", "状态", "状态管理", "store"],
    "样式": ["style", "css", "样式", "tailwind", "className"],
    "类型": ["type", "typescript", "类型", "interface", "typedef"],
    "错误": ["error", "异常", "bug", "fix"],
    "测试": ["test", "测试", "spec", "unit"],
    "性能": ["performance", "性能", "优化", "optimize", "fast"],
    "部署": ["deploy", "部署", "build", "production"],
}

AGENT_KEYWORDS: dict[str, list[str]] = {
    "planner": ["需求", "任务", "规划", "拆解", "workflow", "requirement", "task"],
    "document": ["接口", "api", "文档", "规范", "类型", "type", "interface", "spec", "doc"],
    "generator": ["组件", "代码", "实现", "component", "code", "render", "hook", "import", "export", "tsx", "jsx"],
    "quality": ["错误", "bug", "类型", "type", "error", "lint", "test", "fix", "issue"],
    "delivery": ["部署", "安装", "配置", "deploy", "install", "build", "npm", "readme", "说明"],
}

_TOKEN_RE = re.compile(r"[^\w\u4e00-\u9fa5]+")


@dataclass
class RagMiddlewareConfig:
    topK: int = DEFAULT_TOP_K
    maxTokensPerSlice: int = DEFAULT_MAX_TOKENS_PER_SLICE
    enableQueryExpansion: bool = True
    enableBM25: bool = True
    enableAgentAwareness: bool = True

    @classmethod
    def from_overrides(cls, **overrides: Any) -> "RagMiddlewareConfig":
        cfg = cls()
        for key, value in overrides.items():
            if value is not None and hasattr(cfg, key):
                setattr(cfg, key, value)
        return cfg


def _tokenize(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.sub(" ", text).split() if len(t) > 1]


def _expand_query(query: str) -> list[str]:
    terms = _tokenize(query)
    expanded: set[str] = set(terms)
    for term in terms:
        for syn in SYNONYMS.get(term, []):
            expanded.add(syn)
        for key, vals in SYNONYMS.items():
            if term in vals or term in key:
                expanded.add(key)
                expanded.update(vals)
    return list(expanded)


@dataclass
class _BM25Doc:
    doc: dict
    slice: dict
    term_freqs: dict[str, int] = field(default_factory=dict)


def _compute_bm25(
    query_terms: list[str], docs: list[_BM25Doc], k1: float = 1.5, b: float = 0.75
) -> dict[int, float]:
    if not docs:
        return {}
    avg_doc_len = sum(len(d.slice["content"]) for d in docs) / len(docs) if docs else 1
    doc_count = len(docs)

    df: dict[str, int] = {}
    for d in docs:
        for term in d.term_freqs:
            df[term] = df.get(term, 0) + 1

    scores: dict[int, float] = {}
    for idx, d in enumerate(docs):
        score = 0.0
        doc_len = len(d.slice["content"])
        for term in query_terms:
            tf = d.term_freqs.get(term.lower(), 0)
            if tf == 0:
                continue
            doc_freq = df.get(term, 0)
            idf = math.log((doc_count - doc_freq + 0.5) / (doc_freq + 0.5) + 1)
            tf_score = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (doc_len / avg_doc_len)))
            score += idf * tf_score
        scores[idx] = score
    return scores


def _agent_boost(slice_: dict, doc: dict, agent_id: str) -> float:
    keywords = AGENT_KEYWORDS.get(agent_id, [])
    if not keywords:
        return 1.0
    content = (slice_["content"] + " " + doc["name"]).lower()
    matched = sum(1 for k in keywords if k.lower() in content)
    return 1.0 + matched * 0.15 if matched > 0 else 1.0


def _estimate_tokens(text: str) -> int:
    return math.ceil(len(text) / 2)


def rag_search(
    documents: list[dict], query: str, config: Optional[RagMiddlewareConfig] = None
) -> list[dict]:
    cfg = config or RagMiddlewareConfig()
    if not documents:
        return []

    original_terms = _tokenize(query)
    query_terms = _expand_query(query) if cfg.enableQueryExpansion else original_terms

    docs: list[_BM25Doc] = []
    for doc in documents:
        for sl in doc["slices"]:
            terms = _tokenize(sl["content"].lower())
            term_freqs: dict[str, int] = {}
            for t in terms:
                term_freqs[t] = term_freqs.get(t, 0) + 1
            docs.append(_BM25Doc(doc=doc, slice=sl, term_freqs=term_freqs))

    scored: list[tuple[_BM25Doc, float]] = []
    if cfg.enableBM25 and docs:
        bm25_scores = _compute_bm25(query_terms, docs)
        for idx, d in enumerate(docs):
            score = bm25_scores.get(idx, 0.0)
            if score > 0:
                scored.append((d, score))
        scored.sort(key=lambda x: x[1], reverse=True)
    else:
        for d in docs:
            score = 0.0
            content_lower = d.slice["content"].lower()
            name_lower = d.doc["name"].lower()
            for term in original_terms:
                term_lower = term.lower()
                if term_lower in content_lower:
                    score += 1
                if term_lower in name_lower:
                    score += 2
            if score > 0:
                scored.append((d, score))
        scored.sort(key=lambda x: x[1], reverse=True)

    seen: set[str] = set()
    total_tokens = 0
    results: list[dict] = []

    for d, score in scored:
        key = d.slice["id"]
        if key in seen:
            continue
        slice_tokens = _estimate_tokens(d.slice["content"])
        if total_tokens + slice_tokens > cfg.topK * cfg.maxTokensPerSlice:
            break
        if len(results) >= cfg.topK:
            break
        seen.add(key)
        total_tokens += slice_tokens

        matched_keywords = [
            term for term in original_terms if term.lower() in d.slice["content"].lower()
        ]

        results.append(
            {
                "slice": d.slice,
                "doc": d.doc,
                "score": score,
                "matchedKeywords": matched_keywords,
            }
        )

    return results


def rerank_for_agent(results: list[dict], agent_id: str) -> list[dict]:
    reranked = [
        {**r, "score": r["score"] * _agent_boost(r["slice"], r["doc"], agent_id)}
        for r in results
    ]
    reranked.sort(key=lambda r: r["score"], reverse=True)
    return reranked


@dataclass
class ContextWindow:
    documents: list[dict]
    totalTokens: int
    summary: str


def build_context_window(
    documents: list[dict], query: str, agent_id: str, config: Optional[RagMiddlewareConfig] = None
) -> ContextWindow:
    cfg = config or RagMiddlewareConfig()

    results = rag_search(documents, query, cfg)
    if cfg.enableAgentAwareness:
        results = rerank_for_agent(results, agent_id)

    total_tokens = sum(_estimate_tokens(r["slice"]["content"]) for r in results)
    summary = (
        f"检索到 {len(results)} 个相关切片，共约 {total_tokens} tokens"
        if results
        else "未检索到相关文档"
    )

    return ContextWindow(documents=results, totalTokens=total_tokens, summary=summary)
