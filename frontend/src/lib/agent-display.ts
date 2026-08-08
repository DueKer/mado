// ============================================================
// MADO - Agent 展示元数据（仅用于前端 UI 展示）
// 实际的 Agent Prompt / 编排逻辑已迁移到 backend/app/agents/prompts.py
// ============================================================

import type { AgentId } from '@/types';

export const AGENT_DISPLAY_NAMES: Record<AgentId, { name: string; desc: string }> = {
  planner: { name: '需求拆解规划', desc: '将自然语言需求拆解为结构化任务' },
  document: { name: '长文档解析', desc: '提取源码、接口、规范中的关键信息' },
  generator: { name: '前端代码生成', desc: '按技术栈生成规范代码' },
  quality: { name: '代码质检排错', desc: '检查类型、BUG、规范、性能问题' },
  delivery: { name: '交付整理输出', desc: '格式化代码、生成文档、部署说明' },
};
