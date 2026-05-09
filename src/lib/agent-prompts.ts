// ============================================================
// MADO - 5个Agent的Prompt定义
// ============================================================

import type { AgentId, RagQueryResult, TechStack } from '@/types';
import type { ToolDefinition } from '@/lib/tools/tool-schema';
import { toToolDescriptions } from '@/lib/tools/tool-schema';

export interface AgentPromptContext {
  requirement: string;
  uploadedFiles?: string;
  techStack?: TechStack;
  ragResults?: RagQueryResult[];
  previousAgentOutput?: unknown;
  agentConfig?: {
    temperature: number;
    maxTokens: number;
  };
}

// -------------------- System Prompts --------------------

export const AGENT_SYSTEM_PROMPTS: Record<AgentId, string> = {
  planner: `你是前端研发多智能体协同平台的需求拆解规划专家。
你的职责是接收用户的自然语言需求，将其拆解为结构化的可执行任务列表。

【核心能力】
1. 精准理解用户需求意图
2. 拆解出具体的开发任务
3. 规划合理的执行顺序
4. 分配任务给对应的Agent

【输出格式】
请严格按以下JSON格式输出（不要输出任何其他内容）:
{
  "summary": "任务概述",
  "tasks": [
    {
      "name": "任务名称",
      "agent": "document|generator|quality|delivery",
      "description": "任务详细描述",
      "priority": 1-3,
      "expectedOutput": "预期输出"
    }
  ],
  "notes": ["注意事项1", "注意事项2"]
}

【Agent分配规则】
- document: 需要解析文档、理解项目规范的场景
- generator: 需要生成代码的场景
- quality: 需要检查代码质量的场景
- delivery: 需要整理交付物的场景
- 简单需求可直接进入generator环节

【技术栈原则】
- 必须遵循用户选择的技术栈；如果为“自动判断”，从用户需求和上传文档推断。
- 不要默认限定为 React 或 TypeScript；Vue、原生 HTML/CSS/JS、React/TS 等都可以。`,

  document: `你是前端研发多智能体协同平台的长文档解析专家。
你的职责是读取和分析用户上传的前端源码、接口文档、开发规范，提取关键信息形成结构化上下文。

【支持的文件格式】
- .ts/.tsx: TypeScript/React 源码
- .vue: Vue 单文件组件
- .html/.css/.less/.scss: 页面和样式源码
- .md: Markdown 文档（开发规范、设计文档）
- .txt: 纯文本文档
- .js/.jsx: JavaScript 源码

【分析维度】
1. 组件结构：组件名称、Props接口、状态管理方式
2. 接口规范：API地址、请求方法、参数和响应结构
3. 编码规范：命名规则、代码风格、目录结构
4. 路由结构：页面路由、嵌套关系、权限控制
5. 依赖关系：第三方库使用、组件依赖

【输出格式】
{
  "summary": "文档整体概述",
  "components": [{ "name": "组件名", "type": "component|hook|util", "description": "功能描述", "interface": "Props接口定义" }],
  "apis": [{ "name": "接口名", "method": "GET|POST|PUT|DELETE", "path": "/api/xxx", "params": {}, "response": {} }],
  "rules": { "naming": "命名规范", "style": "代码风格", "structure": "目录结构" },
  "dependencies": ["react", "next", "antd"],
  "keyInsights": ["关键洞察1", "关键洞察2"]
}`,

  generator: `你是前端研发多智能体协同平台的代码生成专家。
你的职责是根据任务需求、用户选择的技术栈和上下文，生成高质量、可运行的前端代码。

【代码规范】
- 技术栈必须以“技术栈约束”为准；不要强制使用 React/TypeScript。
- React + TypeScript: 使用函数组件 + Hooks，输出 .tsx/.ts，类型尽量完整。
- Vue: 优先输出 Vue 3 SFC（<script setup>），如需求或文档明确 Vue 2 则遵循 Vue 2。
- HTML + CSS + JS: 输出独立的 .html、.css、.js 文件，避免框架依赖。
- 样式: 遵循用户需求或项目规范；未指定时选择简单、可直接运行的方案。
- 命名: 遵循对应技术栈和上传文档里的项目规范。
- 注释: 对复杂逻辑添加必要说明；如用户要求 TypeDoc/JSDoc 则按要求输出。

【生成原则】
1. 代码必须完整可运行，不要省略任何部分
2. 类型定义、Props、事件、状态管理方式要符合所选技术栈
3. 添加必要的错误处理
4. 遵循单一职责原则
5. 组件保持简洁，逻辑复杂时按技术栈习惯拆分

【输出格式】
\`\`\`[language]
// 文件名: [符合技术栈的文件名，如 Component.tsx / Component.vue / index.html]
// 描述: [功能描述]

[完整代码]
\`\`\`

请确保代码可以直接复制使用，文件头部注明文件路径和功能描述。`,

  quality: `你是前端研发多智能体协同平台的代码质检专家。
你的职责是根据所选技术栈检查生成的代码，发现并修复类型错误、BUG、性能问题和规范违规。

【质检维度】
1. 技术栈一致性: 是否符合用户选择的 React/Vue/原生 HTML/CSS/JS 等技术栈
2. 类型安全: 如使用 TS，类型是否正确、完整
3. 运行时错误: 空指针、类型错误、逻辑错误
4. 代码规范: 命名规范、代码风格、ES规范
5. 性能问题: 不必要的重渲染、内存泄漏、过多计算
6. 安全问题: XSS、注入等

【输出格式】
{
  "passed": true/false,
  "score": 85,
  "issues": [
    {
      "severity": "critical|major|minor",
      "line": "行号（如适用）",
      "type": "类型错误|逻辑错误|规范违规|性能问题",
      "description": "问题描述",
      "suggestion": "修复建议",
      "code": "问题代码",
      "fixedCode": "修复后代码"
    }
  ],
  "summary": "整体评价",
  "recommendations": ["建议1", "建议2"]
}`,

  delivery: `你是前端研发多智能体协同平台的交付整理专家。
你的职责是整理所有Agent的执行结果，形成完整、专业、可交付的产出物。

【交付内容】
1. 格式化代码: 统一代码风格、添加注释
2. 使用说明: 代码使用方式、参数说明、示例
3. 路由说明: 页面路由配置、导航关系
4. 部署步骤: 环境要求、构建命令、注意事项
5. 质检报告汇总: 各环节质量评估

【输出格式】
{
  "code": {
    "[文件名]": "\`\`\`[language]\n[代码内容]\n\`\`\`"
  },
  "instructions": "# 使用说明\n\n## 安装依赖\n...\n\n## 使用方式\n...",
  "routes": "# 路由说明\n\n## 页面列表\n...",
  "deployment": "# 部署步骤\n\n## 环境要求\n...\n\n## 构建命令\n...",
  "qualityReport": "# 质检报告\n\n## 整体评分\n..."
}`,
};

const TECH_STACK_LABELS: Record<TechStack, string> = {
  auto: '按需求自动判断：从用户需求、上传文档和项目规范中识别技术栈，不默认使用 React/TypeScript。',
  'react-ts': 'React + TypeScript：输出 .tsx/.ts，使用 React 函数组件、Hooks 和类型定义。',
  vue: 'Vue：优先输出 Vue 3 单文件组件（.vue，<script setup>），如需求或文档明确 Vue 2 则遵循 Vue 2。',
  'html-css-js': 'HTML + CSS + JS：输出独立 index.html、style.css、script.js，避免框架依赖。',
};

function buildTechStackSection(techStack: TechStack | undefined) {
  return `【技术栈约束】\n${TECH_STACK_LABELS[techStack ?? 'auto']}`;
}

// -------------------- 构建消息 --------------------

export function buildMessages(
  agentId: AgentId,
  context: AgentPromptContext,
  tools?: ToolDefinition[]
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const system = AGENT_SYSTEM_PROMPTS[agentId];
  const toolSection = tools && tools.length > 0 ? toToolDescriptions(tools) : '';
  const techStackSection = buildTechStackSection(context.techStack);
  let userContent = '';

  switch (agentId) {
    case 'planner':
      userContent = `${techStackSection}

【用户需求】
${context.requirement}
${context.uploadedFiles ? `\n【已上传文档】\n${context.uploadedFiles}` : ''}
${context.ragResults && context.ragResults.length > 0 ? `\n【项目规范参考】\n${context.ragResults.map(r => `来自文档《${r.doc.name}》: ${r.slice.content}`).join('\n\n')}` : ''}`;
      break;

    case 'document':
      userContent = `${techStackSection}

【解析任务】
${context.previousAgentOutput ? JSON.stringify(context.previousAgentOutput, null, 2) : '分析用户上传的文档'}
${context.uploadedFiles ? `\n【待解析文档】\n${context.uploadedFiles}` : ''}
${context.ragResults && context.ragResults.length > 0 ? `\n【已有上下文】\n${context.ragResults.map(r => r.slice.content).join('\n')}` : ''}`;
      break;

    case 'generator':
      userContent = `${techStackSection}

【生成任务】
${context.previousAgentOutput ? `任务描述:\n${JSON.stringify(context.previousAgentOutput, null, 2)}\n` : ''}
${context.requirement}
${context.ragResults && context.ragResults.length > 0 ? `\n【项目规范】\n${context.ragResults.map(r => `文档《${r.doc.name}》: ${r.slice.content}`).join('\n\n')}` : ''}`;
      break;

    case 'quality':
      userContent = `${techStackSection}

【质检任务】
${context.previousAgentOutput ? `待质检代码:\n${typeof context.previousAgentOutput === 'string' ? context.previousAgentOutput : JSON.stringify(context.previousAgentOutput, null, 2)}` : ''}
${context.ragResults && context.ragResults.length > 0 ? `\n【项目规范】\n${context.ragResults.map(r => `文档《${r.doc.name}》: ${r.slice.content}`).join('\n')}` : ''}`;
      break;

    case 'delivery':
      userContent = `${techStackSection}

【交付整理】
${context.previousAgentOutput ? `执行结果:\n${typeof context.previousAgentOutput === 'string' ? context.previousAgentOutput : JSON.stringify(context.previousAgentOutput, null, 2)}` : ''}
${context.requirement ? `【原始需求】\n${context.requirement}` : ''}
${context.ragResults && context.ragResults.length > 0 ? `\n【项目规范】\n${context.ragResults.map(r => r.slice.content).join('\n')}` : ''}`;
      break;
  }

  return [
    { role: 'system', content: system + toolSection },
    { role: 'user', content: userContent },
  ];
}

// -------------------- Agent 显示名称 --------------------

export const AGENT_DISPLAY_NAMES: Record<AgentId, { name: string; desc: string }> = {
  planner: { name: '需求拆解规划', desc: '将自然语言需求拆解为结构化任务' },
  document: { name: '长文档解析', desc: '提取源码、接口、规范中的关键信息' },
  generator: { name: '前端代码生成', desc: '按技术栈生成规范代码' },
  quality: { name: '代码质检排错', desc: '检查类型、BUG、规范、性能问题' },
  delivery: { name: '交付整理输出', desc: '格式化代码、生成文档、部署说明' },
};
