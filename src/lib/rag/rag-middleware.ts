// ============================================================
// MADO - RAG Middleware
// 增强版检索：BM25 + Query 扩展 + Agent 感知 + 重排序
// ============================================================

import type { RagDocument, RagSlice, RagQueryResult } from '@/types';

export interface RagMiddlewareConfig {
  topK?: number;              // 默认返回数量
  maxTokensPerSlice?: number; // 每个切片最大 token 数（估算）
  enableQueryExpansion?: boolean; // 是否启用 Query 扩展
  enableBM25?: boolean;       // 是否启用 BM25 排序
  enableAgentAwareness?: boolean; // 是否启用 Agent 感知
}

const DEFAULT_CONFIG: Required<RagMiddlewareConfig> = {
  topK: 5,
  maxTokensPerSlice: 500,
  enableQueryExpansion: true,
  enableBM25: true,
  enableAgentAwareness: true,
};

// -------------------- Query 扩展 --------------------

const SYNONYMS: Record<string, string[]> = {
  '组件': ['component', '组件', '部件'],
  'API': ['api', '接口', '接口', 'rest', 'endpoint'],
  '路由': ['route', 'router', '路由', 'path', '页面'],
  '状态': ['state', '状态', '状态管理', 'store'],
  '样式': ['style', 'css', '样式', 'tailwind', 'className'],
  '类型': ['type', 'typescript', '类型', 'interface', 'typedef'],
  '错误': ['error', '异常', 'bug', 'fix'],
  '测试': ['test', '测试', 'spec', 'unit'],
  '性能': ['performance', '性能', '优化', 'optimize', 'fast'],
  '部署': ['deploy', '部署', 'build', 'production'],
};

function expandQuery(query: string): string[] {
  const terms = query
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

  const expanded = new Set<string>(terms);

  for (const term of terms) {
    const synonyms = SYNONYMS[term] ?? [];
    synonyms.forEach(s => expanded.add(s));
    // 也添加自己的同义词 key
    for (const [key, vals] of Object.entries(SYNONYMS)) {
      if (vals.includes(term) || key.includes(term)) {
        expanded.add(key);
        vals.forEach(v => expanded.add(v));
      }
    }
  }

  return Array.from(expanded);
}

// -------------------- BM25 评分 --------------------

interface BM25Doc {
  doc: RagDocument;
  slice: RagSlice;
  termFreqs: Map<string, number>;
}

function computeBM25(
  queryTerms: string[],
  docs: BM25Doc[],
  k1: number = 1.5,
  b: number = 0.75
): Map<BM25Doc, number> {
  const scores = new Map<BM25Doc, number>();
  const avgDocLen = docs.length > 0
    ? docs.reduce((sum, d) => sum + d.slice.content.length, 0) / docs.length
    : 1;

  const docCount = docs.length;
  const df = new Map<string, number>();

  for (const d of docs) {
    for (const term of d.termFreqs.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  for (const doc of docs) {
    let score = 0;
    const docLen = doc.slice.content.length;
    const lowerContent = doc.slice.content.toLowerCase();

    for (const term of queryTerms) {
      const tf = doc.termFreqs.get(term.toLowerCase()) ?? 0;
      if (tf === 0) continue;

      const idf = Math.log((docCount - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5) + 1);
      const tfScore = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDocLen)));
      score += idf * tfScore;
    }

    scores.set(doc, score);
  }

  return scores;
}

// -------------------- Agent 感知权重 --------------------

const AGENT_KEYWORDS: Record<string, string[]> = {
  planner: ['需求', '任务', '规划', '拆解', 'workflow', 'requirement', 'task'],
  document: ['接口', 'api', '文档', '规范', '类型', 'type', 'interface', 'spec', 'doc'],
  generator: ['组件', '代码', '实现', 'component', 'code', 'render', 'hook', 'import', 'export', 'tsx', 'jsx'],
  quality: ['错误', 'bug', '类型', 'type', 'error', 'lint', 'test', 'fix', 'issue'],
  delivery: ['部署', '安装', '配置', 'deploy', 'install', 'build', 'npm', 'readme', '说明'],
};

function agentBoost(slice: RagSlice, doc: RagDocument, agentId: string): number {
  const keywords = AGENT_KEYWORDS[agentId] ?? [];
  if (keywords.length === 0) return 1.0;

  const content = (slice.content + ' ' + doc.name).toLowerCase();
  const matched = keywords.filter(k => content.includes(k.toLowerCase())).length;
  return matched > 0 ? 1.0 + (matched * 0.15) : 1.0;
}

// -------------------- Token 估算 --------------------

function estimateTokens(text: string): number {
  // 粗略估算：中文按字计，英文按词计，平均约 1 token ≈ 0.75 字符
  return Math.ceil(text.length / 2);
}

// -------------------- 主检索函数 --------------------

export function ragSearch(
  documents: RagDocument[],
  query: string,
  config: RagMiddlewareConfig = {}
): RagQueryResult[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const { topK, maxTokensPerSlice, enableQueryExpansion, enableBM25 } = cfg;

  if (documents.length === 0) return [];

  // Step 1: Query 扩展
  const queryTerms = expandQuery(query);
  const originalTerms = query
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);

  // Step 2: 构建文档集
  const docs: BM25Doc[] = [];
  for (const doc of documents) {
    for (const slice of doc.slices) {
      const terms = slice.content
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1);

      const termFreqs = new Map<string, number>();
      for (const t of terms) {
        termFreqs.set(t, (termFreqs.get(t) ?? 0) + 1);
      }

      docs.push({ doc, slice, termFreqs });
    }
  }

  // Step 3: BM25 评分（如果启用）
  let scoredDocs: Array<{ doc: BM25Doc; score: number }> = [];

  if (enableBM25 && docs.length > 0) {
    const bm25Scores = computeBM25(queryTerms, docs);
    for (const [d, score] of bm25Scores) {
      if (score > 0) {
        scoredDocs.push({ doc: d, score });
      }
    }
    scoredDocs.sort((a, b) => b.score - a.score);
  } else {
    // Fallback: 简单关键词匹配
    for (const d of docs) {
      let score = 0;
      for (const term of originalTerms) {
        if (d.slice.content.toLowerCase().includes(term.toLowerCase())) {
          score++;
        }
        if (d.doc.name.toLowerCase().includes(term.toLowerCase())) {
          score += 2;
        }
      }
      if (score > 0) {
        scoredDocs.push({ doc: d, score });
      }
    }
    scoredDocs.sort((a, b) => b.score - a.score);
  }

  // Step 4: 去重 + Token 限制 + 构建结果
  const seen = new Set<string>();
  let totalTokens = 0;
  const results: RagQueryResult[] = [];

  for (const { doc: bmDoc, score } of scoredDocs) {
    const key = bmDoc.slice.id;
    if (seen.has(key)) continue;

    const sliceTokens = estimateTokens(bmDoc.slice.content);
    if (totalTokens + sliceTokens > topK * maxTokensPerSlice) break;
    if (results.length >= topK) break;

    seen.add(key);
    totalTokens += sliceTokens;

    const matchedKeywords = originalTerms.filter(term =>
      bmDoc.slice.content.toLowerCase().includes(term.toLowerCase())
    );

    results.push({
      slice: bmDoc.slice,
      doc: bmDoc.doc,
      score,
      matchedKeywords,
    });
  }

  return results;
}

// -------------------- Agent 感知重排序 --------------------

export function rerankForAgent(
  results: RagQueryResult[],
  agentId: string
): RagQueryResult[] {
  return results
    .map(r => ({
      ...r,
      score: r.score * agentBoost(r.slice, r.doc, agentId),
    }))
    .sort((a, b) => b.score - a.score);
}

// -------------------- 上下文窗口构建 --------------------

export interface ContextWindow {
  documents: RagQueryResult[];
  totalTokens: number;
  summary: string;
}

export function buildContextWindow(
  documents: RagDocument[],
  query: string,
  agentId: string,
  config: RagMiddlewareConfig = {}
): ContextWindow {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 检索
  let results = ragSearch(documents, query, cfg);

  // Agent 感知重排序
  if (cfg.enableAgentAwareness) {
    results = rerankForAgent(results, agentId);
  }

  // Token 统计
  let totalTokens = 0;
  for (const r of results) {
    totalTokens += estimateTokens(r.slice.content);
  }

  // 生成摘要
  const summary = results.length > 0
    ? `检索到 ${results.length} 个相关切片，共约 ${totalTokens} tokens`
    : '未检索到相关文档';

  return { documents: results, totalTokens, summary };
}

// -------------------- 便捷封装（兼容现有 orchestrator） --------------------

export function searchKnowledgeBase(
  documents: RagDocument[],
  query: string,
  agentId: string = 'generator',
  topK: number = 5
): RagQueryResult[] {
  const results = buildContextWindow(documents, query, agentId, { topK });
  return results.documents;
}
