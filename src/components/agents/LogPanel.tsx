'use client';

import * as React from 'react';
import { ChevronUp, ChevronDown, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { AgentId } from '@/types';

interface ExecutionLog {
  agentId: AgentId;
  text: string;
  timestamp: number;
}

interface LogPanelProps {
  logs: ExecutionLog[];
  streamBuffer: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  agentNames: Record<AgentId, string>;
}

export function LogPanel({ logs, streamBuffer, collapsed, onToggleCollapse, agentNames }: LogPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, streamBuffer]);

  const handleCopy = () => {
    const text = logs.map(l => `[${agentNames[l.agentId]}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (collapsed) {
    return (
      <div className="h-[50px] bg-white border-t border-[#E5E6EB] flex items-center justify-center px-4">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-1 text-sm text-[#86909C] hover:text-[#165DFF] transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
          <span>执行日志</span>
        </button>
      </div>
    );
  }

  return (
    <div className="h-[300px] bg-white border-t border-[#E5E6EB] flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-[#E5E6EB] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-[#1D2129]">执行日志</span>
          {logs.length > 0 && (
            <span className="text-xs text-[#86909C]">{logs.length} 条</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-[#86909C] hover:text-[#165DFF] transition-colors"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          <button
            onClick={onToggleCollapse}
            className="text-[#64748B] hover:text-[#165DFF] transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Log Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-[#86909C] italic">等待任务启动...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-2 py-0.5">
              <span className="text-[#86909C] shrink-0">[{agentNames[log.agentId]}]</span>
              <span className="text-[#64748B] whitespace-pre-wrap break-all">{log.text}</span>
            </div>
          ))
        )}
        {streamBuffer && (
          <div className="text-[#165DFF] whitespace-pre-wrap break-all mt-1 border-l-2 border-[#165DFF]/30 pl-2">
            {streamBuffer}
            <span className="animate-pulse">▊</span>
          </div>
        )}
      </div>
    </div>
  );
}
