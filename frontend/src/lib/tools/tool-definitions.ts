// ============================================================
// MADO - 内置工具元数据（仅用于前端 UI 展示）
// 实际的工具执行逻辑已迁移到 backend/app/agents/tool_loop.py
// ============================================================

import type { ToolDefinition } from './tool-schema';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'web_search',
    description: '在互联网上搜索信息。当你不确定某些技术细节、最新文档、API用法或需要查证事实时使用。',
    category: 'search',
    parameters: [
      {
        name: 'query',
        description: '搜索查询词，尽量具体，包含关键术语',
        type: 'string',
        required: true,
      },
      {
        name: 'max_results',
        description: '最大返回结果数',
        type: 'number',
        required: false,
        default: 5,
      },
    ],
  },
  {
    name: 'web_fetch',
    description: '获取指定网页的完整内容。用于查看技术文档、API说明、教程等。',
    category: 'search',
    parameters: [
      {
        name: 'url',
        description: '网页完整 URL',
        type: 'string',
        required: true,
      },
      {
        name: 'query',
        description: '你在此页面上想了解的具体内容（方便提取关键段落）',
        type: 'string',
        required: false,
      },
    ],
  },
  {
    name: 'code_interpreter',
    description: '在 Node.js 环境中安全地执行 JavaScript/TypeScript 代码片段。用于计算、字符串处理、数据转换等。不适合 DOM 操作和 I/O。',
    category: 'code',
    parameters: [
      {
        name: 'code',
        description: '要执行的 JS/TS 代码',
        type: 'string',
        required: true,
      },
      {
        name: 'language',
        description: '代码语言',
        type: 'string',
        required: false,
        default: 'javascript',
        enum: ['javascript', 'typescript'],
      },
    ],
  },
  {
    name: 'json_transform',
    description: '对 JSON 数据进行转换、过滤、映射等操作。',
    category: 'code',
    parameters: [
      {
        name: 'data',
        description: '输入的 JSON 数据（字符串或对象）',
        type: 'string',
        required: true,
      },
      {
        name: 'operation',
        description: '要执行的操作类型',
        type: 'string',
        required: true,
        enum: ['parse', 'stringify', 'filter', 'map', 'pick', 'omit', 'merge', 'sort'],
      },
      {
        name: 'params',
        description: '操作参数（JSON 字符串）',
        type: 'string',
        required: false,
      },
    ],
  },
  {
    name: 'format_date',
    description: '格式化日期时间为指定格式字符串。',
    category: 'compute',
    parameters: [
      {
        name: 'timestamp',
        description: 'Unix 时间戳（秒或毫秒）或 ISO 日期字符串',
        type: 'string',
        required: true,
      },
      {
        name: 'format',
        description: '输出格式',
        type: 'string',
        required: false,
        default: 'YYYY-MM-DD HH:mm:ss',
        enum: ['YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss', 'relative', 'unix'],
      },
    ],
  },
];

export function getToolDefinitions(): ToolDefinition[] {
  return TOOL_DEFINITIONS;
}
