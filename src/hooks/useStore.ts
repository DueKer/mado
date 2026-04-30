'use client';

import { useState, useCallback, useEffect } from 'react';
import { STORAGE_KEYS } from '@/lib/constants';
import { encodeSecret, decodeSecret } from '@/lib/utils';
import type { AppConfig, AgentId, PerAgentConfig, RagDocument, Task } from '@/types';

// -------------------- DB 写入（静默，不阻塞 UI）--------------------

async function syncTaskToDB(task: Task) {
  try {
    await fetch('/api/db/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task),
    });
  } catch {}
}

async function updateTaskInDB(taskId: string, updates: Partial<Task>) {
  try {
    await fetch('/api/db/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, ...updates }),
    });
  } catch {}
}

async function deleteTaskInDB(taskId: string) {
  try {
    await fetch(`/api/db/tasks?id=${encodeURIComponent(taskId)}`, { method: 'DELETE' });
  } catch {}
}

async function syncDocToDB(doc: RagDocument) {
  try {
    await fetch('/api/db/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
  } catch {}
}

async function deleteDocFromDB(docId: string) {
  try {
    await fetch(`/api/db/rag?id=${encodeURIComponent(docId)}`, { method: 'DELETE' });
  } catch {}
}

async function updateDocInDB(docId: string, updates: Partial<RagDocument>) {
  try {
    await fetch('/api/db/rag', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: docId, ...updates }),
    });
  } catch {}
}

// -------------------- App 配置 Hook --------------------

const defaultAgentConfigs: Record<string, { enabled: boolean; timeout: number }> = {
  planner: { enabled: true, timeout: 30 },
  document: { enabled: true, timeout: 60 },
  generator: { enabled: true, timeout: 60 },
  quality: { enabled: true, timeout: 30 },
  delivery: { enabled: true, timeout: 30 },
};

const defaultConfig: AppConfig = {
  apiKeys: { openai: '', anthropic: '', groq: '', siliconflow: '' },
  baseUrl: undefined,
  gptModel: 'gpt-5.4-mini',
  claudeModel: 'claude-sonnet-4-20250514',
  modelMode: 'gpt-only',
  temperature: 0.1,
  maxTokens: 4096,
  timeout: 30,
  agentConfigs: defaultAgentConfigs as Record<AgentId, PerAgentConfig>,
};

export function useAppConfig() {
  const [config, setConfigState] = useState<AppConfig>(defaultConfig);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      // 1. 先从 DB（服务端 /api/db/config）读取（包含 .env 默认值）
      // 2. 同时从 localStorage 读取（用户手动配置优先）
      // 3. localStorage 为空时用 DB 值
      try {
        const [dbRes, stored] = await Promise.all([
          fetch('/api/db/config'),
          Promise.resolve(localStorage.getItem(STORAGE_KEYS.config)),
        ]);

        let envApiKeys = { openai: '', anthropic: '', groq: '', siliconflow: '' };
        let envBaseUrl: string | undefined;
        let envGptModel: string | undefined;
        let envClaudeModel: string | undefined;
        if (dbRes.ok) {
          const dbConfig = await dbRes.json();
          envApiKeys = dbConfig.apiKeys ?? { openai: '', anthropic: '', groq: '', siliconflow: '' };
          envBaseUrl = dbConfig.baseUrl;
          envGptModel = dbConfig.gptModel;
          envClaudeModel = dbConfig.claudeModel;
        }

        if (stored) {
          const parsed = JSON.parse(stored);
          setConfigState({
            ...defaultConfig,
            ...parsed,
            apiKeys: {
              openai: parsed.apiKeys?.openai ? decodeSecret(parsed.apiKeys.openai) : envApiKeys.openai,
              anthropic: parsed.apiKeys?.anthropic ? decodeSecret(parsed.apiKeys.anthropic) : envApiKeys.anthropic,
              groq: parsed.apiKeys?.groq ? decodeSecret(parsed.apiKeys.groq) : envApiKeys.groq,
              siliconflow: parsed.apiKeys?.siliconflow ? decodeSecret(parsed.apiKeys.siliconflow) : envApiKeys.siliconflow,
            },
            baseUrl: parsed.baseUrl ?? envBaseUrl,
            gptModel: parsed.gptModel ?? envGptModel ?? 'gpt-5.4-mini',
            claudeModel: parsed.claudeModel ?? envClaudeModel ?? 'claude-sonnet-4-20250514',
          });
        } else {
          // localStorage 为空，直接用 .env 的 key 和 DB 的 baseUrl
          setConfigState(prev => ({
            ...prev,
            apiKeys: envApiKeys,
            baseUrl: envBaseUrl,
            gptModel: envGptModel ?? 'gpt-5.4-mini',
            claudeModel: envClaudeModel ?? 'claude-sonnet-4-20250514',
          }));
          // 同时写入 localStorage（加密后）
          const toSave = {
            ...defaultConfig,
            apiKeys: {
              openai: envApiKeys.openai ? encodeSecret(envApiKeys.openai) : '',
              anthropic: envApiKeys.anthropic ? encodeSecret(envApiKeys.anthropic) : '',
              groq: envApiKeys.groq ? encodeSecret(envApiKeys.groq) : '',
              siliconflow: envApiKeys.siliconflow ? encodeSecret(envApiKeys.siliconflow) : '',
            },
            baseUrl: envBaseUrl,
            gptModel: envGptModel ?? 'gpt-5.4-mini',
            claudeModel: envClaudeModel ?? 'claude-sonnet-4-20250514',
          };
          localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(toSave));
        }
      } catch {}
      setIsLoaded(true);
    }
    load();
  }, []);

  const setConfig = useCallback((updates: Partial<AppConfig>) => {
    setConfigState(prev => {
      const next = { ...prev, ...updates };
      try {
        const toSave = {
          ...next,
          apiKeys: {
            openai: next.apiKeys.openai ? encodeSecret(next.apiKeys.openai) : '',
            anthropic: next.apiKeys.anthropic ? encodeSecret(next.apiKeys.anthropic) : '',
            groq: next.apiKeys.groq ? encodeSecret(next.apiKeys.groq) : '',
            siliconflow: next.apiKeys.siliconflow ? encodeSecret(next.apiKeys.siliconflow) : '',
          },
        };
        localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(toSave));
      } catch {}
      fetch('/api/db/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {});
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.config);
    setConfigState(defaultConfig);
  }, []);

  const updateAgentConfig = useCallback((agentId: AgentId, updates: Partial<PerAgentConfig>) => {
    setConfigState(prev => {
      const next = {
        ...prev,
        agentConfigs: {
          ...prev.agentConfigs,
          [agentId]: { ...prev.agentConfigs[agentId], ...updates },
        },
      };
      try {
        const toSave = {
          ...next,
          apiKeys: {
            openai: next.apiKeys.openai ? encodeSecret(next.apiKeys.openai) : '',
            anthropic: next.apiKeys.anthropic ? encodeSecret(next.apiKeys.anthropic) : '',
            groq: next.apiKeys.groq ? encodeSecret(next.apiKeys.groq) : '',
            siliconflow: next.apiKeys.siliconflow ? encodeSecret(next.apiKeys.siliconflow) : '',
          },
        };
        localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(toSave));
      } catch {}
      fetch('/api/db/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {});
      return next;
    });
  }, []);

  const hasApiKeys = config.apiKeys.openai.trim() !== '' || config.apiKeys.anthropic.trim() !== '' || config.apiKeys.groq?.trim() !== '' || config.apiKeys.siliconflow?.trim() !== '';

  const getEnabledAgents = useCallback((): Set<AgentId> => {
    const enabled = new Set<AgentId>();
    for (const [id, cfg] of Object.entries(config.agentConfigs)) {
      if (cfg.enabled) enabled.add(id as AgentId);
    }
    return enabled;
  }, [config.agentConfigs]);

  return { config, setConfig, resetConfig, updateAgentConfig, getEnabledAgents, isLoaded, hasApiKeys };
}

// -------------------- RAG 知识库 Hook --------------------

export function useKnowledgeBase() {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // 启动时：优先从 DB 加载，失败则用 localStorage
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/db/rag');
        if (res.ok) {
          const dbDocs: RagDocument[] = await res.json();
          if (dbDocs.length > 0 && !cancelled) {
            setDocuments(dbDocs);
            // 同步到 localStorage 作为备份
            localStorage.setItem(STORAGE_KEYS.knowledgeBase, JSON.stringify(dbDocs));
            setIsLoaded(true);
            return;
          }
        }
      } catch {}
      // DB 无数据，回退到 localStorage
      if (!cancelled) {
        try {
          const stored = localStorage.getItem(STORAGE_KEYS.knowledgeBase);
          if (stored) setDocuments(JSON.parse(stored));
        } catch {}
        setIsLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const saveDocuments = useCallback((docs: RagDocument[]) => {
    setDocuments(docs);
    try {
      localStorage.setItem(STORAGE_KEYS.knowledgeBase, JSON.stringify(docs));
    } catch {}
    // 异步同步到 DB
    syncBulkDocsToDB(docs);
  }, []);

  const addDocument = useCallback((doc: RagDocument) => {
    setDocuments(prev => {
      const next = [...prev, doc];
      try {
        localStorage.setItem(STORAGE_KEYS.knowledgeBase, JSON.stringify(next));
      } catch {}
      syncDocToDB(doc);
      return next;
    });
  }, []);

  const removeDocument = useCallback((docId: string) => {
    setDocuments(prev => {
      const next = prev.filter(d => d.id !== docId);
      try {
        localStorage.setItem(STORAGE_KEYS.knowledgeBase, JSON.stringify(next));
      } catch {}
      deleteDocFromDB(docId);
      return next;
    });
  }, []);

  const updateDocument = useCallback((docId: string, updates: Partial<RagDocument>) => {
    setDocuments(prev => {
      const next = prev.map(d => d.id === docId ? { ...d, ...updates } : d);
      try {
        localStorage.setItem(STORAGE_KEYS.knowledgeBase, JSON.stringify(next));
      } catch {}
      updateDocInDB(docId, updates);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setDocuments([]);
    localStorage.removeItem(STORAGE_KEYS.knowledgeBase);
    // 清空 DB 中的文档
    documents.forEach(d => deleteDocFromDB(d.id));
  }, [documents]);

  return { documents, addDocument, removeDocument, updateDocument, clearAll, isLoaded, saveDocuments };
}

// 批量同步文档到 DB（用于初始化）
async function syncBulkDocsToDB(docs: RagDocument[]) {
  for (const doc of docs) {
    try {
      await fetch('/api/db/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
    } catch {}
  }
}

// -------------------- 历史任务 Hook --------------------

export function useHistory() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // 启动时：优先从 DB 加载，失败则用 localStorage
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/db/tasks?limit=200');
        if (res.ok) {
          const dbTasks: Task[] = await res.json();
          if (dbTasks.length > 0 && !cancelled) {
            setTasks(dbTasks);
            // 同步到 localStorage 作为备份
            localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(dbTasks.slice(0, 100)));
            setIsLoaded(true);
            return;
          }
        }
      } catch {}
      // DB 无数据，回退到 localStorage
      if (!cancelled) {
        try {
          const stored = localStorage.getItem(STORAGE_KEYS.history);
          if (stored) setTasks(JSON.parse(stored));
        } catch {}
        setIsLoaded(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(tasks.slice(0, 100)));
    } catch {}
  }, [tasks, isLoaded]);

  const addTask = useCallback((task: Task) => {
    setTasks(prev => [task, ...prev].slice(0, 100));
    syncTaskToDB(task);
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates, updatedAt: Date.now() } : t));
    updateTaskInDB(taskId, updates);
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    deleteTaskInDB(taskId);
  }, []);

  const removeTasks = useCallback((taskIds: string[]) => {
    setTasks(prev => prev.filter(t => !taskIds.includes(t.id)));
    taskIds.forEach(id => deleteTaskInDB(id));
  }, []);

  const clearAll = useCallback(() => {
    setTasks([]);
    localStorage.removeItem(STORAGE_KEYS.history);
    tasks.forEach(t => deleteTaskInDB(t.id));
  }, [tasks]);

  return { tasks, addTask, updateTask, removeTask, removeTasks, clearAll, isLoaded };
}
