// ============================================================
// MADO - 内置工具集
// ============================================================

import type { ToolDefinition, ToolCall, ToolResult, ToolExecutor } from './tool-schema';
import { validateArgs } from './tool-schema';
import { WebFetch } from '@/lib/tools/builtin-web-search';

// -------------------- 工具注册表 --------------------

const registeredTools: Map<string, {
  definition: ToolDefinition;
  executor: (call: ToolCall) => Promise<ToolResult>;
}> = new Map();

export function registerTool(
  def: ToolDefinition,
  executor: (call: ToolCall) => Promise<ToolResult>
) {
  registeredTools.set(def.name, { definition: def, executor });
}

export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(registeredTools.values()).map(v => v.definition);
}

export function getToolExecutor(name: string): ((call: ToolCall) => Promise<ToolResult>) | undefined {
  return registeredTools.get(name)?.executor;
}

// -------------------- 内置工具：网络搜索 --------------------

registerTool({
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
}, async (call) => {
  const validation = validateArgs(call.arguments, [
    { name: 'query', description: '', type: 'string', required: true },
    { name: 'max_results', description: '', type: 'number', required: false },
  ]);
  if (!validation.ok) {
    return { callId: call.id, toolName: call.name, success: false, content: '', error: validation.error };
  }

  try {
    const results = await WebFetch.search(String(call.arguments.query), {
      maxResults: Number(call.arguments.max_results ?? 5),
    });
    const formatted = results.map((r, i) =>
      `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
    ).join('\n\n');
    return {
      callId: call.id,
      toolName: call.name,
      success: true,
      content: `搜索「${call.arguments.query}」结果：\n\n${formatted}\n\n（共${results.length}条结果）`,
    };
  } catch (e) {
    return {
      callId: call.id,
      toolName: call.name,
      success: false,
      content: '',
      error: e instanceof Error ? e.message : String(e),
    };
  }
});

// -------------------- 内置工具：读取网页内容 --------------------

registerTool({
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
}, async (call) => {
  const validation = validateArgs(call.arguments, [
    { name: 'url', description: '', type: 'string', required: true },
    { name: 'query', description: '', type: 'string', required: false },
  ]);
  if (!validation.ok) {
    return { callId: call.id, toolName: call.name, success: false, content: '', error: validation.error };
  }

  try {
    const url = String(call.arguments.url);
    const query = String(call.arguments.query ?? '');
    const content = await WebFetch.fetchPage(url, query);
    return {
      callId: call.id,
      toolName: call.name,
      success: true,
      content: `页面内容（${url}）:\n\n${content}`,
    };
  } catch (e) {
    return {
      callId: call.id,
      toolName: call.name,
      success: false,
      content: '',
      error: e instanceof Error ? e.message : String(e),
    };
  }
});

// -------------------- 内置工具：代码执行 --------------------

registerTool({
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
}, async (call) => {
  const validation = validateArgs(call.arguments, [
    { name: 'code', description: '', type: 'string', required: true },
    { name: 'language', description: '', type: 'string', required: false },
  ]);
  if (!validation.ok) {
    return { callId: call.id, toolName: call.name, success: false, content: '', error: validation.error };
  }

  const start = Date.now();
  try {
    const code = String(call.arguments.code);
    const __captureLogs: string[] = [];

    const wrappedCode = `
      const __logs = [];
      const __log = (...args) => __logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '));
      const __result = (function() {
        ${code}
      })();
      return { result: __result, logs: __logs };
    `;

    const evalFn = new Function(wrappedCode);
    const { result, logs: capturedLogs } = evalFn() as { result: unknown; logs: string[] };

    const resultStr = result !== undefined
      ? (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result))
      : '(无返回值)';

    return {
      callId: call.id,
      toolName: call.name,
      success: true,
      content: `执行结果:\n${resultStr}\n\nConsole输出:\n${(capturedLogs ?? __captureLogs).join('\n') || '(无输出)'}`,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      callId: call.id,
      toolName: call.name,
      success: false,
      content: '',
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  }
});

// -------------------- 内置工具：JSON 转换 --------------------

registerTool({
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
}, async (call) => {
  const start = Date.now();
  try {
    const data = typeof call.arguments.data === 'string'
      ? JSON.parse(String(call.arguments.data))
      : call.arguments.data;
    const operation = String(call.arguments.operation);
    const params = call.arguments.params
      ? JSON.parse(String(call.arguments.params))
      : {};

    let result: unknown;

    switch (operation) {
      case 'parse':
        result = JSON.parse(String(call.arguments.data));
        break;
      case 'stringify':
        result = JSON.stringify(data, null, 2);
        break;
      case 'filter':
        result = Array.isArray(data) ? data.filter(params.predicate) : data;
        break;
      case 'map':
        result = Array.isArray(data) ? data.map(params.mapper) : data;
        break;
      case 'pick':
        result = params.fields.reduce((acc: Record<string, unknown>, f: string) => {
          acc[f] = data[f];
          return acc;
        }, {});
        break;
      case 'omit':
        result = Object.fromEntries(
          Object.entries(data as Record<string, unknown>).filter(([k]) => !params.fields.includes(k))
        );
        break;
      case 'merge':
        result = { ...data, ...params.data };
        break;
      case 'sort':
        result = [...(data as unknown[])].sort(params.comparator);
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    return {
      callId: call.id,
      toolName: call.name,
      success: true,
      content: `JSON ${operation} 结果:\n${JSON.stringify(result, null, 2)}`,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      callId: call.id,
      toolName: call.name,
      success: false,
      content: '',
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  }
});

// -------------------- 内置工具：格式化时间 --------------------

registerTool({
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
}, async (call) => {
  const timestamp = String(call.arguments.timestamp);
  const fmt = String(call.arguments.format ?? 'YYYY-MM-DD HH:mm:ss');
  const date = isNaN(Number(timestamp)) ? new Date(timestamp) : new Date(Number(timestamp) < 1e12 ? Number(timestamp) * 1000 : Number(timestamp));

  if (isNaN(date.getTime())) {
    return { callId: call.id, toolName: call.name, success: false, content: '', error: '无效的时间戳' };
  }

  let result: string;
  switch (fmt) {
    case 'YYYY-MM-DD':
      result = date.toISOString().split('T')[0];
      break;
    case 'YYYY-MM-DD HH:mm:ss':
      result = date.toISOString().replace('T', ' ').split('.')[0];
      break;
    case 'unix':
      result = String(Math.floor(date.getTime() / 1000));
      break;
    case 'relative': {
      const diff = Date.now() - date.getTime();
      const secs = Math.floor(diff / 1000);
      if (secs < 60) result = `${secs}秒前`;
      else if (secs < 3600) result = `${Math.floor(secs / 60)}分钟前`;
      else if (secs < 86400) result = `${Math.floor(secs / 3600)}小时前`;
      else result = `${Math.floor(secs / 86400)}天前`;
      break;
    }
    default:
      result = date.toISOString();
  }

  return { callId: call.id, toolName: call.name, success: true, content: result };
});

// -------------------- 批量执行工具 --------------------

export async function executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
  return Promise.all(calls.map(async (call) => {
    const executor = getToolExecutor(call.name);
    if (!executor) {
      return {
        callId: call.id,
        toolName: call.name,
        success: false,
        content: '',
        error: `Unknown tool: ${call.name}`,
      };
    }
    try {
      return await executor(call);
    } catch (e) {
      return {
        callId: call.id,
        toolName: call.name,
        success: false,
        content: '',
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }));
}
