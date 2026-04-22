// ============================================================
// MADO - Tool System
// 为 Agent 提供可调用的外部工具能力
// ============================================================

// -------------------- Tool 定义 --------------------

export interface ToolParam {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: unknown;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: 'search' | 'compute' | 'http' | 'code' | 'system' | 'rag';
  parameters: ToolParam[];
  enabled?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  toolName: string;
  success: boolean;
  content: string;
  error?: string;
  durationMs?: number;
}

export interface ToolExecutor {
  execute(call: ToolCall): Promise<ToolResult>;
  getDefinitions(): ToolDefinition[];
}

// -------------------- 参数校验 --------------------

export function validateArgs(
  args: Record<string, unknown>,
  params: ToolParam[]
): { ok: true } | { ok: false; error: string } {
  for (const p of params) {
    if (p.required && !(p.name in args)) {
      return { ok: false, error: `Missing required parameter: ${p.name}` };
    }
    if (p.name in args) {
      const val = args[p.name];
      const expected = p.type;
      if (expected === 'string' && typeof val !== 'string') {
        return { ok: false, error: `Parameter ${p.name} must be string, got ${typeof val}` };
      }
      if (expected === 'number' && typeof val !== 'number') {
        return { ok: false, error: `Parameter ${p.name} must be number, got ${typeof val}` };
      }
      if (expected === 'boolean' && typeof val !== 'boolean') {
        return { ok: false, error: `Parameter ${p.name} must be boolean, got ${typeof val}` };
      }
      if (p.enum && !p.enum.includes(String(val))) {
        return { ok: false, error: `Parameter ${p.name} must be one of: ${p.enum.join(', ')}` };
      }
    }
  }
  return { ok: true };
}

// -------------------- OpenAI 格式 Tool Schema --------------------

export function toOpenAIFunctionSchema(tools: ToolDefinition[]): object[] {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          t.parameters.map(p => [
            p.name,
            {
              type: p.type,
              description: p.description,
              ...(p.enum ? { enum: p.enum } : {}),
              ...(p.default !== undefined ? { default: p.default } : {}),
            },
          ])
        ),
        required: t.parameters.filter(p => p.required).map(p => p.name),
      },
    },
  }));
}

// -------------------- Anthropic 格式 Tool Schema --------------------

export function toAnthropicToolSchema(tools: ToolDefinition[]): object[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(
        t.parameters.map(p => [
          p.name,
          {
            type: p.type,
            description: p.description,
            ...(p.enum ? { enum: p.enum } : {}),
            ...(p.default !== undefined ? { default: p.default } : {}),
          },
        ])
      ),
      required: t.parameters.filter(p => p.required).map(p => p.name),
    },
  }));
}

// -------------------- 工具描述文本（注入到 System Prompt） --------------------

export function toToolDescriptions(tools: ToolDefinition[]): string {
  if (tools.length === 0) return '';
  return `\n\n【可用工具】\n你可以在必要时调用以下工具来完成任务：\n${tools.map(t => {
    const paramStr = t.parameters.map(p =>
      `  - ${p.name}${p.required ? '' : '（可选）'}: ${p.description}${p.enum ? ` (枚举: ${p.enum.join('|')})` : ''}`
    ).join('\n');
    return `【${t.name}】${t.description}\n${paramStr}`;
  }).join('\n\n')}\n\n当你需要使用工具时，请按以下格式回复（只需回复这一种格式，不要回复其他内容）：\n__TOOL_CALL__\n{"tool":"工具名","params":{"参数名":"参数值"}}\n__END_TOOL_CALL__\n\n工具调用是同步的，我会返回结果后你再继续。`;
}
