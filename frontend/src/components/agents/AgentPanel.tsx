'use client';

import * as React from 'react';
import { Brain, FileText, Code, CheckCircle, Package, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AGENTS } from '@/lib/constants';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import type { AgentId, AgentStatus } from '@/types';

const AGENT_ICONS: Record<string, React.ReactNode> = {
  brain: <Brain className="w-5 h-5" />,
  'file-text': <FileText className="w-5 h-5" />,
  code: <Code className="w-5 h-5" />,
  'check-circle': <CheckCircle className="w-5 h-5" />,
  package: <Package className="w-5 h-5" />,
};

const STATUS_CONFIG: Record<AgentStatus, { label: string; color: string; bgColor: string }> = {
  idle: { label: '未执行', color: 'text-[#86909C]', bgColor: 'bg-[#86909C]' },
  running: { label: '执行中', color: 'text-[#165DFF]', bgColor: 'bg-[#165DFF]' },
  completed: { label: '已完成', color: 'text-[#36D399]', bgColor: 'bg-[#36D399]' },
  failed: { label: '执行失败', color: 'text-[#F87272]', bgColor: 'bg-[#F87272]' },
};

interface AgentState {
  status: AgentStatus;
  progress: number;
  enabled: boolean;
}

interface AgentPanelProps {
  executions: Record<AgentId, { status: AgentStatus; progress: number; logs: string[]; error?: string }>;
  enabledAgents: Set<AgentId>;
  onToggleAgent: (id: AgentId, enabled: boolean) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AgentPanel({
  executions,
  enabledAgents,
  onToggleAgent,
  collapsed = false,
  onToggleCollapse,
}: AgentPanelProps) {
  const allLogs = Object.values(executions)
    .flatMap(e => e.logs)
    .slice(-20);

  if (collapsed) {
    return (
      <div className="w-[80px] bg-white border-r border-[#E5E6EB] flex flex-col items-center py-4 gap-3">
        <button
          onClick={onToggleCollapse}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#F5F7FA] hover:text-[#165DFF] transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {AGENTS.map(agent => {
          const exec = executions[agent.id];
          const cfg = STATUS_CONFIG[exec.status];
          return (
            <div key={agent.id} className="flex flex-col items-center gap-1" title={agent.name}>
              <div className={cn('p-2 rounded-lg transition-colors', cfg.bgColor + '/10', cfg.color)}>
                {AGENT_ICONS[agent.icon]}
              </div>
              <div className={cn('w-1.5 h-1.5 rounded-full', cfg.bgColor)} />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-[250px] bg-white border-r border-[#E5E6EB] flex flex-col">
      {/* Header */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-[#E5E6EB] flex-shrink-0">
        <span className="font-semibold text-[#1D2129] text-sm">多Agent工作流</span>
        <button
          onClick={onToggleCollapse}
          className="w-6 h-6 rounded flex items-center justify-center text-[#64748B] hover:bg-[#F5F7FA] hover:text-[#165DFF] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {AGENTS.map((agent, idx) => {
          const exec = executions[agent.id];
          const cfg = STATUS_CONFIG[exec.status];
          const isEnabled = enabledAgents.has(agent.id);

          return (
            <div key={agent.id}>
              <div
                className={cn(
                  'rounded-lg border p-3 transition-all duration-200',
                  exec.status === 'running'
                    ? 'border-[#165DFF]/40 bg-[#165DFF]/5'
                    : exec.status === 'failed'
                    ? 'border-[#F87272]/40 bg-[#F87272]/5'
                    : exec.status === 'completed'
                    ? 'border-[#36D399]/40 bg-[#36D399]/5'
                    : 'border-[#E5E6EB] bg-white hover:border-[#165DFF]/30',
                  !isEnabled && 'opacity-50'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className={cn('p-1.5 rounded-md transition-colors', cfg.bgColor + '/10', cfg.color)}>
                    {AGENT_ICONS[agent.icon]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-medium text-[#1D2129] truncate">{agent.shortName}</span>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={(v) => onToggleAgent(agent.id, v)}
                        className="scale-90"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn('text-xs', cfg.color)}>{cfg.label}</span>
                      {exec.status === 'running' && (
                        <span className="text-xs text-[#165DFF]">{exec.progress}%</span>
                      )}
                      {exec.status === 'failed' && exec.error && (
                        <span className="text-xs text-[#F87272] truncate" title={exec.error}>⚠</span>
                      )}
                    </div>
                  </div>
                </div>
                {(exec.status === 'running' || exec.status === 'completed') && (
                  <div className="mt-2">
                    <Progress
                      value={exec.progress}
                      color={exec.status === 'completed' ? 'success' : 'primary'}
                    />
                  </div>
                )}
              </div>

              {/* Connector Arrow */}
              {idx < AGENTS.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <div className={cn(
                    'w-0.5 h-3 rounded-full transition-colors',
                    exec.status === 'completed' ? 'bg-[#36D399]' :
                    exec.status === 'running' ? 'bg-[#165DFF]' :
                    'bg-[#E5E6EB]'
                  )} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent Logs */}
      {allLogs.length > 0 && (
        <div className="border-t border-[#E5E6EB] px-3 py-2 max-h-[120px] overflow-y-auto flex-shrink-0">
          <p className="text-xs text-[#86909C] mb-1">最近日志</p>
          {allLogs.slice(-3).map((log, i) => (
            <p key={i} className="text-xs text-[#64748B] font-mono truncate">{log}</p>
          ))}
        </div>
      )}
    </div>
  );
}
