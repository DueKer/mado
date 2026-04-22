'use client';

// ============================================================
// MADO - Pipeline Visualizer & Editor
// 可视化 Agent 编排：拖拽排序 + 条件分支
// ============================================================

import * as React from 'react';
import { GripVertical, Plus, Trash2, Settings, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentId } from '@/types';
import { AGENTS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface PipelineStep {
  id: string;
  agentId: AgentId;
  enabled: boolean;
  timeout: number;
  condition?: 'always' | 'on_success' | 'on_failure';
  retryCount: number;
}

export interface PipelineConfig {
  id: string;
  name: string;
  steps: PipelineStep[];
  createdAt: number;
  updatedAt: number;
}

// -------------------- 默认 Pipeline --------------------

export function createDefaultPipeline(): PipelineConfig {
  return {
    id: `pipeline_${Date.now()}`,
    name: '默认流程',
    steps: AGENTS.map(agent => ({
      id: `step_${agent.id}_${Date.now()}`,
      agentId: agent.id,
      enabled: true,
      timeout: 30,
      condition: 'always',
      retryCount: 2,
    })),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// -------------------- Pipeline 编辑器 --------------------

interface PipelineEditorProps {
  pipeline: PipelineConfig;
  onChange: (pipeline: PipelineConfig) => void;
  onClose: () => void;
  open?: boolean;
}

export function PipelineEditorDialog({ pipeline, onChange, onClose, open = true }: PipelineEditorProps) {
  const [local, setLocal] = React.useState(pipeline);

  React.useEffect(() => {
    setLocal(pipeline);
  }, [pipeline]);

  const moveStep = (from: number, to: number) => {
    const steps = [...local.steps];
    const [moved] = steps.splice(from, 1);
    steps.splice(to, 0, moved);
    setLocal({ ...local, steps, updatedAt: Date.now() });
  };

  const toggleStep = (stepId: string) => {
    const steps = local.steps.map(s =>
      s.id === stepId ? { ...s, enabled: !s.enabled } : s
    );
    setLocal({ ...local, steps, updatedAt: Date.now() });
  };

  const removeStep = (stepId: string) => {
    const steps = local.steps.filter(s => s.id !== stepId);
    setLocal({ ...local, steps, updatedAt: Date.now() });
  };

  const updateStep = (stepId: string, updates: Partial<PipelineStep>) => {
    const steps = local.steps.map(s =>
      s.id === stepId ? { ...s, ...updates } : s
    );
    setLocal({ ...local, steps, updatedAt: Date.now() });
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#165DFF]" />
            <span>编辑工作流</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 p-1">
          {/* Pipeline Name */}
          <div className="flex items-center gap-3 px-1">
            <span className="text-sm text-[#64748B] w-16">流程名称</span>
            <input
              className="flex-1 border border-[#E5E6EB] rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#165DFF]"
              value={local.name}
              onChange={e => setLocal({ ...local, name: e.target.value, updatedAt: Date.now() })}
              placeholder="输入流程名称"
            />
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <div className="text-sm text-[#64748B] px-1">执行步骤（拖拽调整顺序）</div>
            {local.steps.map((step, idx) => {
              const agent = AGENTS.find(a => a.id === step.agentId);
              if (!agent) return null;

              return (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-all',
                    step.enabled
                      ? 'border-[#E5E6EB] bg-white hover:border-[#165DFF]/30'
                      : 'border-[#E5E6EB] bg-[#F5F7FA] opacity-60'
                  )}
                >
                  {/* Drag Handle */}
                  <button className="cursor-grab text-[#86909C] hover:text-[#165DFF] p-1">
                    <GripVertical className="w-4 h-4" />
                  </button>

                  {/* Order */}
                  <div className="w-7 h-7 rounded-full bg-[#F5F7FA] flex items-center justify-center text-xs font-medium text-[#64748B]">
                    {idx + 1}
                  </div>

                  {/* Move Up/Down */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => idx > 0 && moveStep(idx, idx - 1)}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-[#F5F7FA] disabled:opacity-30"
                    >
                      <ChevronUp className="w-3 h-3 text-[#64748B]" />
                    </button>
                    <button
                      onClick={() => idx < local.steps.length - 1 && moveStep(idx, idx + 1)}
                      disabled={idx === local.steps.length - 1}
                      className="p-0.5 rounded hover:bg-[#F5F7FA] disabled:opacity-30"
                    >
                      <ChevronDown className="w-3 h-3 text-[#64748B]" />
                    </button>
                  </div>

                  {/* Agent Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1D2129] truncate">{agent.name}</div>
                    <div className="text-xs text-[#86909C]">{agent.description}</div>
                  </div>

                  {/* Settings */}
                  <div className="flex items-center gap-2">
                    {/* Timeout */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#86909C]">超时</span>
                      <input
                        type="number"
                        className="w-14 border border-[#E5E6EB] rounded px-2 py-1 text-xs outline-none focus:border-[#165DFF]"
                        value={step.timeout}
                        min={5}
                        max={300}
                        onChange={e => updateStep(step.id, { timeout: parseInt(e.target.value) || 30 })}
                      />
                      <span className="text-xs text-[#86909C]">s</span>
                    </div>

                    {/* Retry */}
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#86909C]">重试</span>
                      <input
                        type="number"
                        className="w-12 border border-[#E5E6EB] rounded px-2 py-1 text-xs outline-none focus:border-[#165DFF]"
                        value={step.retryCount}
                        min={0}
                        max={5}
                        onChange={e => updateStep(step.id, { retryCount: parseInt(e.target.value) || 0 })}
                      />
                    </div>

                    {/* Enable Toggle */}
                    <button
                      onClick={() => toggleStep(step.id)}
                      className={cn(
                        'w-8 h-5 rounded-full transition-colors relative',
                        step.enabled ? 'bg-[#165DFF]' : 'bg-[#E5E6EB]'
                      )}
                    >
                      <div
                        className={cn(
                          'w-3.5 h-3.5 bg-white rounded-full absolute top-0.75 transition-transform shadow-sm',
                          step.enabled ? 'translate-x-4' : 'translate-x-0.75'
                        )}
                      />
                    </button>

                    {/* Remove */}
                    <button
                      onClick={() => removeStep(step.id)}
                      className="p-1.5 rounded hover:bg-[#F87272]/10 text-[#86909C] hover:text-[#F87272] transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Execution Graph Preview */}
          <div className="mt-4 p-4 rounded-lg border border-[#E5E6EB] bg-[#F5F7FA]">
            <div className="text-sm font-medium text-[#1D2129] mb-3">执行流程预览</div>
            <div className="flex items-center gap-2 flex-wrap">
              {local.steps.filter(s => s.enabled).map((step, idx) => {
                const agent = AGENTS.find(a => a.id === step.agentId);
                return (
                  <React.Fragment key={step.id}>
                    {idx > 0 && (
                      <div className="text-[#165DFF] text-sm">→</div>
                    )}
                    <div className="px-3 py-1.5 rounded-full bg-white border border-[#165DFF]/20 text-sm text-[#165DFF] font-medium">
                      {agent?.shortName ?? step.agentId}
                    </div>
                  </React.Fragment>
                );
              })}
              <div className="text-[#36D399] text-sm ml-2">✓ 完成</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-[#E5E6EB] flex-shrink-0">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button
            onClick={() => {
              onChange({ ...local, updatedAt: Date.now() });
              onClose();
            }}
          >
            保存流程
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Pipeline 状态指示器 --------------------

interface PipelineIndicatorProps {
  pipeline: PipelineConfig;
  currentStepIndex: number;
  currentAgentId?: AgentId;
  onEdit: () => void;
}

export function PipelineIndicator({ pipeline, currentStepIndex, currentAgentId, onEdit }: PipelineIndicatorProps) {
  const enabledSteps = pipeline.steps.filter(s => s.enabled);

  return (
    <div className="flex items-center gap-2 p-3 bg-white border-b border-[#E5E6EB]">
      <span className="text-xs text-[#86909C]">流程:</span>
      <div className="flex items-center gap-1 flex-1">
        {pipeline.steps.map((step, idx) => {
          const agent = AGENTS.find(a => a.id === step.agentId);
          const isActive = currentAgentId === step.agentId;
          const isPast = enabledSteps.findIndex(s => s.id === step.id) < currentStepIndex;
          const isCurrent = currentAgentId !== undefined && enabledSteps[currentStepIndex]?.id === step.id;

          return (
            <React.Fragment key={step.id}>
              <button
                onClick={onEdit}
                className={cn(
                  'px-2 py-1 rounded text-xs transition-colors',
                  !step.enabled && 'opacity-40 line-through',
                  isCurrent && 'bg-[#165DFF] text-white',
                  isPast && !isCurrent && 'bg-[#36D399]/10 text-[#36D399]',
                  !isCurrent && !isPast && 'bg-[#F5F7FA] text-[#64748B] hover:bg-[#E5E6EB]'
                )}
                title={`${agent?.name} - ${step.timeout}s超时`}
              >
                {agent?.shortName ?? step.agentId}
              </button>
              {idx < pipeline.steps.length - 1 && (
                <span className={cn(
                  'text-xs',
                  enabledSteps.findIndex(s => s.id === step.id) < currentStepIndex
                    ? 'text-[#36D399]'
                    : 'text-[#E5E6EB]'
                )}>→</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <button
        onClick={onEdit}
        className="p-1 rounded hover:bg-[#F5F7FA] text-[#86909C] hover:text-[#165DFF] transition-colors"
        title="编辑流程"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
