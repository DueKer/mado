'use client';

// ============================================================
// MADO - Tool Approval Dialog
// 工具执行前确认：防止 Agent 执行危险操作
// ============================================================

import * as React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { ToolCall, ToolDefinition } from '@/lib/tools/tool-schema';
import { getToolDefinitions } from '@/lib/tools/builtin-tools';

export interface ToolApprovalRequest {
  call: ToolCall;
  toolDef?: ToolDefinition;
  reason?: string; // 模型请求此工具的原因
}

interface ToolApprovalDialogProps {
  request: ToolApprovalRequest | null;
  onApprove: () => void;
  onReject: () => void;
  onApproveAll?: () => void;
  autoApprove?: boolean;
}

// -------------------- 工具危险等级 --------------------

type RiskLevel = 'safe' | 'caution' | 'dangerous';

function getRiskLevel(toolName: string): RiskLevel {
  const safe = ['web_search', 'web_fetch', 'format_date', 'json_transform'];
  const cautious = ['code_interpreter'];
  const dangerous: RiskLevel = 'dangerous';

  if (safe.includes(toolName)) return 'safe';
  if (cautious.includes(toolName)) return 'caution';
  return 'dangerous';
}

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ReactNode }> = {
  safe: {
    label: '安全',
    color: 'text-[#36D399]',
    bgColor: 'bg-[#36D399]/10',
    borderColor: 'border-[#36D399]/30',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  caution: {
    label: '需注意',
    color: 'text-[#FFA033]',
    bgColor: 'bg-[#FFA033]/10',
    borderColor: 'border-[#FFA033]/30',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  dangerous: {
    label: '高风险',
    color: 'text-[#F87272]',
    bgColor: 'bg-[#F87272]/10',
    borderColor: 'border-[#F87272]/30',
    icon: <XCircle className="w-4 h-4" />,
  },
};

// -------------------- 工具参数渲染 --------------------

function renderArgValue(key: string, value: unknown): React.ReactNode {
  if (typeof value === 'string' && value.length > 200) {
    return (
      <div className="max-h-32 overflow-y-auto">
        <pre className="text-xs bg-[#F5F7FA] rounded p-2 whitespace-pre-wrap break-all font-mono">
          {value}
        </pre>
      </div>
    );
  }
  return (
    <span className={cn(
      'text-xs font-mono px-1.5 py-0.5 rounded',
      typeof value === 'string'
        ? 'bg-[#F5F7FA] text-[#1D2129]'
        : typeof value === 'number'
        ? 'bg-[#165DFF]/10 text-[#165DFF]'
        : typeof value === 'boolean'
        ? 'bg-[#36D399]/10 text-[#36D399]'
        : 'bg-[#FFA033]/10 text-[#FFA033]'
    )}>
      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
    </span>
  );
}

// -------------------- 主组件 --------------------

export function ToolApprovalDialog({
  request,
  onApprove,
  onReject,
  onApproveAll,
  autoApprove = false,
}: ToolApprovalDialogProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (!request) return null;

  const { call, toolDef } = request;
  const risk = getRiskLevel(call.name);
  const cfg = RISK_CONFIG[risk];

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onReject()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={cn('p-1.5 rounded-lg', cfg.bgColor, cfg.color)}>
              {cfg.icon}
            </span>
            <span>工具执行确认</span>
          </DialogTitle>
          <DialogDescription>
            <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium', cfg.bgColor, cfg.color)}>
              {cfg.label}操作
            </span>
            {' '}Agent 请求执行工具 <code className="bg-[#F5F7FA] px-1 rounded text-[#165DFF]">{call.name}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Tool Description */}
          {toolDef?.description && (
            <div className="text-sm text-[#64748B] bg-[#F5F7FA] rounded-lg p-3">
              {toolDef.description}
            </div>
          )}

          {/* Arguments */}
          <div>
            <div className="text-sm font-medium text-[#1D2129] mb-2 flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5" />
              参数
              <span className="text-xs font-normal text-[#86909C]">（{Object.keys(call.arguments).length} 个）</span>
            </div>
            <div className="space-y-2">
              {Object.entries(call.arguments).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="text-xs font-medium text-[#64748B] w-20 flex-shrink-0 pt-0.5">
                    {key}
                  </span>
                  <div className="flex-1 min-w-0">
                    {renderArgValue(key, value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Code Interpreter Warning */}
          {call.name === 'code_interpreter' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[#FFA033]/10 border border-[#FFA033]/20">
              <AlertTriangle className="w-4 h-4 text-[#FFA033] flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-[#FFA033] font-medium">代码执行风险提示</p>
                <p className="text-[#64748B] text-xs mt-1">
                  此工具将执行任意 JavaScript 代码。请确认代码内容安全，不会访问敏感信息或执行恶意操作。
                </p>
              </div>
            </div>
          )}

          {/* Raw JSON Toggle */}
          {Object.keys(call.arguments).length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-[#165DFF] hover:underline flex items-center gap-1"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? '收起原始数据' : '查看原始数据'}
            </button>
          )}

          {expanded && (
            <pre className="text-xs bg-[#1D2129] text-[#E5E6EB] rounded-lg p-3 overflow-auto max-h-48 font-mono">
              {JSON.stringify(call.arguments, null, 2)}
            </pre>
          )}
        </div>

        <DialogFooter className="gap-2">
          {onApproveAll && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onApproveAll}
              className="mr-auto text-xs"
            >
              全部允许（本次执行）
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onReject}
          >
            <XCircle className="w-4 h-4 mr-1" />
            拒绝
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            className={cn(
              risk === 'dangerous' && 'bg-[#F87272] hover:bg-[#F53B3B]'
            )}
          >
            <CheckCircle className="w-4 h-4 mr-1" />
            允许执行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Tool Approval Manager Hook --------------------

export interface ApprovalState {
  pending: ToolApprovalRequest | null;
  approved: Set<string>;      // 已批准的工具名集合
  rejected: Set<string>;      // 已拒绝的工具名集合
  autoApproved: Set<string>;  // 本次执行自动批准的工具
}

export function useToolApproval() {
  const [state, setState] = React.useState<ApprovalState>({
    pending: null,
    approved: new Set(),
    rejected: new Set(),
    autoApproved: new Set(),
  });

  const allToolDefs = React.useMemo(() => getToolDefinitions(), []);
  const allToolNames = React.useMemo(() => new Set(allToolDefs.map(d => d.name)), [allToolDefs]);

  const pendingResolverRef = React.useRef<((approved: boolean) => void) | null>(null);

  const requestApproval = React.useCallback((call: ToolCall): Promise<boolean> => {
    // 如果已在批准/拒绝列表 → 直接返回
    if (state.approved.has(call.name)) return Promise.resolve(true);
    if (state.rejected.has(call.name)) return Promise.resolve(false);
    if (state.autoApproved.has(call.name)) return Promise.resolve(true);

    const risk = getRiskLevel(call.name);
    if (risk === 'safe') return Promise.resolve(true);

    // 显示弹窗并等待用户响应
    setState(prev => ({
      ...prev,
      pending: {
        call,
        toolDef: allToolDefs.find(d => d.name === call.name),
      },
    }));

    // 返回 Promise，等用户点击确认/拒绝
    return new Promise<boolean>((resolve) => {
      pendingResolverRef.current = resolve;
    });
  }, [state, allToolDefs]);

  const approve = React.useCallback(() => {
    const resolver = pendingResolverRef.current;
    pendingResolverRef.current = null;
    resolver?.(true);
    setState(prev => ({
      ...prev,
      pending: null,
    }));
  }, []);

  const reject = React.useCallback(() => {
    const resolver = pendingResolverRef.current;
    pendingResolverRef.current = null;
    resolver?.(false);
    setState(prev => ({
      ...prev,
      pending: null,
    }));
  }, []);

  const approveAll = React.useCallback(() => {
    const resolver = pendingResolverRef.current;
    pendingResolverRef.current = null;
    resolver?.(true);
    setState(prev => ({
      ...prev,
      pending: null,
      approved: new Set([...prev.approved, ...allToolNames]),
      autoApproved: new Set([...prev.autoApproved, ...allToolNames]),
    }));
  }, [allToolNames]);

  const resetForNewTask = React.useCallback(() => {
    setState(prev => ({
      pending: null,
      approved: new Set(),
      rejected: new Set(),
      autoApproved: new Set(),
    }));
  }, []);

  return {
    state,
    requestApproval,
    approve,
    reject,
    approveAll,
    resetForNewTask,
  };
}
