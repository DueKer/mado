// ============================================================
// MADO - 前端研发多智能体协同工作平台
// 核心类型定义
// ============================================================

// -------------------- Agent 相关 --------------------

export type AgentId =
  | 'planner'
  | 'document'
  | 'generator'
  | 'quality'
  | 'delivery';

export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed';

export type ModelType = 'dual' | 'gpt-only' | 'claude-only';
export type AgentModelType = 'gpt' | 'claude' | 'dual';

export interface AgentConfig {
  id: AgentId;
  name: string;
  shortName: string;
  model: AgentModelType;
  icon: string;
  enabled: boolean;
  timeout: number; // seconds
}

export interface PerAgentConfig {
  enabled: boolean;
  timeout: number;
}

export interface AppConfig {
  apiKeys: {
    openai: string;
    anthropic: string;
    groq?: string;
    siliconflow?: string;
  };
  /** 自定义 OpenAI 兼容 API 地址，如 https://www.msutools.cn/v1 */
  baseUrl?: string;
  /** 自定义 GPT 模型名，如 gpt-5.4-mini */
  gptModel?: string;
  /** 自定义 Claude 模型名 */
  claudeModel?: string;
  modelMode: 'dual' | 'gpt-only' | 'claude-only';
  temperature: number;
  maxTokens: number;
  timeout: number;
  agentConfigs: Record<AgentId, PerAgentConfig>;
}

export interface AgentExecution {
  agentId: AgentId;
  status: AgentStatus;
  progress: number; // 0-100
  input: unknown;
  output: unknown;
  error?: string;
  startTime?: number;
  endTime?: number;
  logs: string[];
}

// -------------------- Task / Workflow 相关 --------------------

export interface TaskInput {
  requirement: string;
  files?: FileUpload[];
}

export interface FileUpload {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
  uploadTime: number;
}

export interface Task {
  id: string;
  name: string;
  input: TaskInput;
  executions: Record<AgentId, AgentExecution>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';
  createdAt: number;
  updatedAt: number;
  result?: DeliveryResult;
}

export interface DeliveryResult {
  code: Record<string, string>; // filename -> code
  instructions: string;
  routes: string;
  deployment: string;
  qualityReport: string;
}

// -------------------- RAG / 知识库 相关 --------------------

export interface RagDocument {
  id: string;
  name: string;
  type: 'file' | 'rule';
  fileSize?: number;
  content: string;
  slices: RagSlice[];
  uploadTime: number;
}

export interface RagSlice {
  id: string;
  docId: string;
  content: string;
  keywords: string[];
  index: number;
}

export interface RagQueryResult {
  slice: RagSlice;
  doc: RagDocument;
  score: number;
  matchedKeywords: string[];
}

// -------------------- 配置 相关 --------------------

// NOTE: AppConfig is defined above in the "Task / Workflow" section.

// -------------------- UI 状态 相关 --------------------

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}
