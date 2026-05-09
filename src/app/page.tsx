'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Zap, Play, Pause, Square, RotateCcw, FileText, List, Layers3, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Navbar } from '@/components/layout/Navbar';
import { AgentPanel } from '@/components/agents/AgentPanel';
import { LogPanel } from '@/components/agents/LogPanel';
import { FileUploader } from '@/components/rag/FileUploader';
import { DeliveryCodeViewer } from '@/components/editor/DeliveryCodeViewer';
import { MarkdownRenderer } from '@/components/editor/MarkdownRenderer';
import { useAppConfig, useKnowledgeBase, useHistory } from '@/hooks/useStore';
import { useToast } from '@/components/ui/toast';
import { SchedulerProvider, useScheduler } from '@/hooks/useScheduler';
import { runOrchestrator } from '@/lib/orchestrator';
import type { AgentId, RagDocument, FileUpload, TechStack } from '@/types';
import { AGENTS, REQUIREMENT_TEMPLATES, TECH_STACK_OPTIONS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  PipelineEditorDialog,
  PipelineIndicator,
  createDefaultPipeline,
} from '@/components/pipeline/PipelineEditor';
import type { PipelineConfig } from '@/components/pipeline/PipelineEditor';
import { ToolApprovalDialog, useToolApproval } from '@/components/tools/ToolApprovalDialog';
import type { OrchestratorConfig } from '@/lib/orchestrator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/dialog';
import type { RagQueryResult } from '@/types';

// ============================================================
// 首页内容组件
// ============================================================

function HomeContent() {
  const searchParams = useSearchParams();
  const { config, setConfig, updateAgentConfig, isLoaded, hasApiKeys } = useAppConfig();
  const { documents, addDocument } = useKnowledgeBase();
  const { tasks, isLoaded: isHistoryLoaded } = useHistory();
  const { addToast } = useToast();
  const {
    state, startTask, setActiveTask, pauseTask, resumeTask, interruptTask,
    addLog, appendStream, setAgentStatus, setAgentOutput, setAgentError, setResult, completeTask,
  } = useScheduler();

  // --- Pipeline State ---
  const [pipeline, setPipeline] = React.useState<PipelineConfig>(() => createDefaultPipeline());
  const [showPipelineEditor, setShowPipelineEditor] = React.useState(false);

  // --- Tool Approval State ---
  const {
    state: approvalState,
    requestApproval,
    approve: approvalApprove,
    reject: approvalReject,
    approveAll: approvalApproveAll,
    resetForNewTask: resetApproval,
  } = useToolApproval();

  // --- Pipeline: 当前执行到的步骤索引 ---
  const currentStepIndex = React.useMemo(() => {
    if (!state.currentAgentId) return -1;
    const enabled = pipeline.steps.filter(s => s.enabled);
    const idx = enabled.findIndex(s => s.agentId === state.currentAgentId);
    return idx;
  }, [pipeline.steps, state.currentAgentId]);

  // --- Reset approval state when task starts ---
  React.useEffect(() => {
    if (state.isRunning) {
      resetApproval();
    }
  }, [state.isRunning, resetApproval]);

  // UI State
  const [requirement, setRequirement] = React.useState('');
  const [techStack, setTechStack] = React.useState<TechStack>('auto');
  const [uploadedFiles, setUploadedFiles] = React.useState<FileUpload[]>([]);
  const [agentPanelCollapsed, setAgentPanelCollapsed] = React.useState(false);
  const [logDialogOpen, setLogDialogOpen] = React.useState(false);
  const [showResult, setShowResult] = React.useState(false);
  const [hasLoadedRerun, setHasLoadedRerun] = React.useState(false);
  const runningTaskCount = React.useMemo(() => (
    state.taskOrder.reduce((count, taskId) => (
      count + (state.tasksById[taskId]?.isRunning ? 1 : 0)
    ), 0)
  ), [state.taskOrder, state.tasksById]);
  const [ragPreview, setRagPreview] = React.useState<RagQueryResult[]>([]);

  React.useEffect(() => {
    const query = requirement.trim();
    if (query.length < 4 || documents.length === 0) {
      setRagPreview([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, agentId: 'generator', topK: 3 }),
        signal: controller.signal,
      })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? 'RAG 预览失败');
          setRagPreview(data.documents ?? []);
        })
        .catch(error => {
          if (error instanceof Error && error.name === 'AbortError') return;
          setRagPreview([]);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [documents.length, requirement]);

  React.useEffect(() => {
    if (!state.activeTaskId) return;
    setShowResult(Boolean(state.tasksById[state.activeTaskId]?.result));
  }, [state.activeTaskId, state.tasksById]);

  // Convert execution logs to display format
  const logEntries = React.useMemo(() => {
    return Object.entries(state.executions)
      .flatMap(([agentId, exec]) =>
        exec.logs.map(log => ({ agentId: agentId as AgentId, text: log, timestamp: Date.now() }))
      );
  }, [state.executions]);

  const agentNames: Record<AgentId, string> = {
    planner: '规划',
    document: '文档',
    generator: '生成',
    quality: '质检',
    delivery: '交付',
  };

  React.useEffect(() => {
    const rerunId = searchParams.get('rerun');
    if (!rerunId || !isHistoryLoaded || hasLoadedRerun) {
      return;
    }

    const task = tasks.find(item => item.id === rerunId);
    if (!task) {
      setHasLoadedRerun(true);
      return;
    }

    setRequirement(task.input.requirement);
    setTechStack(task.input.techStack ?? 'auto');
    setUploadedFiles(task.input.files ?? []);
    setShowResult(false);
    setHasLoadedRerun(true);
    addToast('info', `已载入历史任务《${task.name}》`);
  }, [addToast, hasLoadedRerun, isHistoryLoaded, searchParams, tasks]);

  const handleFileUpload = (doc: RagDocument) => {
    const fileUpload: FileUpload = {
      id: doc.id,
      name: doc.name,
      size: doc.fileSize ?? 0,
      type: doc.type,
      content: doc.content,
      uploadTime: doc.uploadTime,
    };
    setUploadedFiles(prev => [...prev, fileUpload]);
    addDocument(doc);
    addToast('success', `文档《${doc.name}》已加入知识库`);
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleTemplateClick = (template: (typeof REQUIREMENT_TEMPLATES)[number]) => {
    setRequirement(template.text);
  };

  const toggleAgent = (id: AgentId, enabled: boolean) => {
    updateAgentConfig(id, { enabled });
    addToast('info', `${AGENTS.find(a => a.id === id)?.name}已${enabled ? '开启' : '关闭'}`);
  };

  const handleStartTask = () => {
    if (requirement.trim().length < 10) {
      addToast('warning', '请输入有效需求（至少10个字符）');
      return;
    }
    if (!hasApiKeys) {
      addToast('warning', '请先配置API密钥');
      return;
    }

    const input = { requirement: requirement.trim(), files: uploadedFiles, techStack };

    const taskId = startTask(input, config.modelMode);
    if (!taskId) {
      addToast('warning', `最多同时运行 ${state.maxTasks} 个任务，请等待任一任务完成后再启动`);
      return;
    }

    const enabledAgents = new Set<AgentId>();
    for (const [id, cfg] of Object.entries(config.agentConfigs)) {
      if (cfg.enabled) enabledAgents.add(id as AgentId);
    }

    const orchestratorConfig: OrchestratorConfig = {
      pipeline: pipeline.steps,
      enableContextCompression: true,
      maxContextTokens: 60000,
    };

    resetApproval();

    runOrchestrator(
      input,
      documents,
      config.modelMode,
      config.temperature,
      config.maxTokens,
      enabledAgents,
      config.agentConfigs,
      {
        onAgentStart: (agentId) => {
          setAgentStatus(agentId, 'running', 0, taskId);
          addLog(agentId, `[${agentId}] 开始执行`, taskId);
        },
        onAgentProgress: (agentId, progress) => {
          setAgentStatus(agentId, 'running', progress, taskId);
        },
        onAgentLog: (agentId, log) => {
          addLog(agentId, log, taskId);
        },
        onAgentOutput: (agentId, output) => {
          setAgentOutput(agentId, output, taskId);
        },
        onAgentError: (agentId, error) => {
          setAgentError(agentId, error, taskId);
          setAgentStatus(agentId, 'failed', 0, taskId);
          addLog(agentId, `错误: ${error}`, taskId);
        },
        onAgentComplete: (agentId, output) => {
          setAgentStatus(agentId, 'completed', 100, taskId);
          setAgentOutput(agentId, output, taskId);
        },
        onStream: (text) => {
          appendStream(text, taskId);
        },
        onToolApproval: async (toolName, args) => {
          return await requestApproval({ id: `call_${Date.now()}`, name: toolName, arguments: args });
        },
        onToolResult: (toolName, result) => {
          const runtimeTask = state.tasksById[taskId];
          addLog(runtimeTask?.currentAgentId ?? 'planner', `工具 ${toolName} 结果: ${result.substring(0, 100)}...`, taskId);
        },
        onComplete: (result) => {
          setResult(result, taskId);
          setAgentStatus('delivery', 'completed', 100, taskId);
          completeTask('completed', result, taskId);
          setShowResult(true);
          addToast('success', '任务执行完成！');
        },
        onError: (error) => {
          addLog('planner', `错误: ${error}`, taskId);
          addToast('error', `执行出错: ${error}`);
          completeTask('failed', undefined, taskId);
        },
      },
      orchestratorConfig
    );

    addToast('info', '多Agent协同任务已启动');
  };

  const handleInterrupt = () => {
    interruptTask(state.activeTaskId ?? undefined);
    addToast('info', '任务已中断');
  };

  const handleReset = () => {
    if (state.activeTaskId && state.isRunning) {
      interruptTask(state.activeTaskId);
    }
    setRequirement('');
    setUploadedFiles([]);
    setShowResult(false);
    addToast('info', '已重置');
  };

  const handleApprovalApprove = () => approvalApprove();
  const handleApprovalReject = () => approvalReject();
  const handleApprovalApproveAll = () => approvalApproveAll();

  if (!isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#165DFF] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-[#86909C] mt-3">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Navbar
        config={config}
        onConfigChange={setConfig}
        onHasApiKeys={() => {}}
      />

      {/* Main Area */}
      <div className="flex flex-1 pt-[60px]">
        {/* Agent Panel */}
        <AgentPanel
          executions={state.executions}
          enabledAgents={(() => {
            const set = new Set<AgentId>();
            for (const [id, cfg] of Object.entries(config.agentConfigs)) {
              if (cfg.enabled) set.add(id as AgentId);
            }
            return set;
          })()}
          onToggleAgent={toggleAgent}
          collapsed={agentPanelCollapsed}
          onToggleCollapse={() => setAgentPanelCollapsed(!agentPanelCollapsed)}
        />

        {/* Center Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Pipeline Indicator */}
          <PipelineIndicator
            pipeline={pipeline}
            currentStepIndex={currentStepIndex}
            currentAgentId={state.currentAgentId ?? undefined}
            onEdit={() => setShowPipelineEditor(true)}
          />

          {/* Input Area */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="w-full max-w-6xl mr-auto space-y-5">
              {/* Requirement Input */}
              <div>
                <label className="text-sm font-medium text-[#1D2129] mb-2 block">
                  需求输入
                </label>
                <Textarea
                  value={requirement}
                  onChange={e => setRequirement(e.target.value)}
                  placeholder={'请输入前端研发需求（例：开发一个Next.js登录页面，包含表单验证），所有功能免费使用'}
                  className="w-full min-h-[160px] text-sm resize-y"
                  rows={7}
                />
              </div>

              {/* Tech Stack */}
              <div>
                <label className="text-sm font-medium text-[#1D2129] mb-2 block">
                  技术栈选择
                  <span className="text-xs text-[#86909C] font-normal ml-2">决定多Agent最终输出的代码类型</span>
                </label>
                <Select value={techStack} onValueChange={(value) => setTechStack(value as TechStack)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择技术栈" />
                  </SelectTrigger>
                  <SelectContent>
                    {TECH_STACK_OPTIONS.map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-[#86909C]">
                  {TECH_STACK_OPTIONS.find(option => option.id === techStack)?.description}
                </p>
              </div>

              {/* File Upload */}
              <div>
                <label className="text-sm font-medium text-[#1D2129] mb-2 block">
                  文档上传
                  <span className="text-xs text-[#86909C] font-normal ml-2">（可选，上传后自动加入RAG知识库）</span>
                </label>
                <FileUploader onUpload={handleFileUpload} />
                {uploadedFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {uploadedFiles.map(file => (
                      <div key={file.id} className="flex items-center gap-2 text-xs text-[#64748B] bg-[#F5F7FA] px-3 py-1.5 rounded">
                        <FileText className="w-3.5 h-3.5" />
                        <span className="flex-1 truncate">{file.name}</span>
                        <button onClick={() => removeFile(file.id)} className="text-[#86909C] hover:text-[#F87272]">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Templates */}
              <div>
                <label className="text-sm font-medium text-[#1D2129] mb-2 block">需求模板</label>
                <div className="flex gap-2">
                  {REQUIREMENT_TEMPLATES.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => handleTemplateClick(tpl)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-[#E5E6EB] text-[#64748B] hover:border-[#165DFF] hover:text-[#165DFF] transition-colors disabled:opacity-50"
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              {documents.length > 0 && (
                <div className="rounded-lg border border-[#E5E6EB] bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#1D2129]">
                      <Search className="w-4 h-4 text-[#165DFF]" />
                      RAG 命中预览
                    </div>
                    <span className="text-xs text-[#86909C]">
                      {ragPreview.length > 0 ? `预计引用 ${ragPreview.length} 条` : '暂无命中'}
                    </span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {ragPreview.length > 0 ? ragPreview.map((item, index) => (
                      <div key={`${item.slice.id}_${index}`} className="rounded bg-[#F7F8FA] px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-[#1D2129]">
                            {item.doc.name} · 切片 {item.slice.index + 1}
                          </p>
                          <span className="shrink-0 text-[11px] text-[#165DFF]">{item.score.toFixed(2)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 font-mono text-xs text-[#64748B]">{item.slice.content}</p>
                      </div>
                    )) : (
                      <p className="text-xs text-[#86909C]">
                        输入更具体的需求后，会显示本次多 Agent 预计使用的知识库内容。
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2">
                <Button
                  onClick={handleStartTask}
                  disabled={runningTaskCount >= state.maxTasks}
                  className="w-full h-11 text-sm font-medium"
                >
                  <Zap className="w-4 h-4" />
                  启动多Agent协同
                  <span className="text-xs opacity-80">
                    {runningTaskCount}/{state.maxTasks}
                  </span>
                </Button>

                {state.taskOrder.length > 0 && (
                  <div className="rounded-lg border border-[#E5E6EB] bg-white p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-[#1D2129]">
                        <Layers3 className="w-4 h-4 text-[#165DFF]" />
                        任务线程
                      </div>
                      <span className="text-xs text-[#86909C]">运行中 {runningTaskCount}/{state.maxTasks}</span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      {state.taskOrder.map((taskId, index) => {
                        const task = state.tasksById[taskId];
                        if (!task) return null;
                        const isActive = state.activeTaskId === taskId;
                        const statusText: Record<string, string> = {
                          running: '执行中',
                          completed: '已完成',
                          failed: '失败',
                          interrupted: '已中断',
                          pending: '等待中',
                        };

                        return (
                          <button
                            key={taskId}
                            type="button"
                            onClick={() => setActiveTask(taskId)}
                            className={cn(
                              'min-h-[68px] rounded-lg border px-3 py-2 text-left transition-colors',
                              isActive
                                ? 'border-[#165DFF] bg-[#165DFF]/5'
                                : 'border-[#E5E6EB] bg-[#F7F8FA] hover:border-[#165DFF]/50'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-[#1D2129]">线程 {index + 1}</span>
                              <span
                                className={cn(
                                  'rounded px-1.5 py-0.5 text-[11px]',
                                  task.status === 'running' && 'bg-[#165DFF]/10 text-[#165DFF]',
                                  task.status === 'completed' && 'bg-[#36D399]/10 text-[#36D399]',
                                  task.status === 'failed' && 'bg-[#F87272]/10 text-[#F87272]',
                                  task.status === 'interrupted' && 'bg-[#F59E0B]/10 text-[#B45309]',
                                  task.status === 'pending' && 'bg-[#86909C]/10 text-[#64748B]'
                                )}
                              >
                                {statusText[task.status]}
                              </span>
                            </div>
                            <div className="mt-1 truncate text-xs text-[#64748B]" title={task.name}>
                              {task.name}
                            </div>
                            <div className="mt-1 text-[11px] text-[#86909C]">
                              当前：{task.currentAgentId ? AGENTS.find(agent => agent.id === task.currentAgentId)?.shortName : '无'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {state.isRunning && (
                  <div className="flex gap-2">
                    {state.isPaused ? (
                      <Button onClick={() => resumeTask(state.activeTaskId ?? undefined)} className="flex-1 h-11">
                        <Play className="w-4 h-4" /> 继续
                      </Button>
                    ) : (
                      <Button onClick={() => pauseTask(state.activeTaskId ?? undefined)} variant="secondary" className="flex-1 h-11">
                        <Pause className="w-4 h-4" /> 暂停
                      </Button>
                    )}
                    <Button onClick={handleInterrupt} variant="danger" className="flex-1 h-11">
                      <Square className="w-4 h-4" /> 中断
                    </Button>
                    <Button onClick={handleReset} variant="secondary" className="h-11">
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                <p className="text-xs text-center text-[#FF4D4F] font-medium">
                  免费无限制，无需付费解锁
                </p>
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogDialogOpen(true)}
                  >
                    <List className="w-3.5 h-3.5" />
                    查看执行日志
                    {logEntries.length > 0 && (
                      <span className="text-xs text-[#86909C]">({logEntries.length})</span>
                    )}
                  </Button>
                </div>
              </div>

              {/* Streaming Result Preview */}
              {(state.streamBuffer || state.isRunning) && (
                <div>
                  <label className="text-sm font-medium text-[#1D2129] mb-2 block">实时预览</label>
                  <Card>
                    <CardContent className="p-4">
                      <div className="max-h-[400px] overflow-y-auto">
                        {state.streamBuffer ? (
                          <MarkdownRenderer>{state.streamBuffer}</MarkdownRenderer>
                        ) : (
                          <p className="text-xs text-[#86909C]">正在生成中...</p>
                        )}
                        {state.isRunning && <span className="animate-pulse text-[#165DFF]"> ▊</span>}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Final Result */}
              {showResult && state.result && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-[#1D2129]">交付结果</h3>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setShowResult(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> 重新执行
                      </Button>
                      <span className="text-xs text-[#36D399] bg-[#36D399]/10 px-2 py-0.5 rounded">✓ 任务完成</span>
                    </div>
                  </div>

                  <DeliveryCodeViewer files={state.result.code} />

                  {/* Instructions */}
                  {state.result.instructions && (
                    <div className="p-4 rounded-lg bg-[#F5F7FA] border border-[#E5E6EB]">
                      <h4 className="text-sm font-medium text-[#1D2129] mb-2">使用说明</h4>
                      <MarkdownRenderer>{state.result.instructions}</MarkdownRenderer>
                    </div>
                  )}

                  {/* Deployment */}
                  {state.result.deployment && (
                    <div className="p-4 rounded-lg bg-[#F5F7FA] border border-[#E5E6EB]">
                      <h4 className="text-sm font-medium text-[#1D2129] mb-2">部署步骤</h4>
                      <MarkdownRenderer>{state.result.deployment}</MarkdownRenderer>
                    </div>
                  )}

                  {/* Routes */}
                  {state.result.routes && (
                    <div className="p-4 rounded-lg bg-[#F5F7FA] border border-[#E5E6EB]">
                      <h4 className="text-sm font-medium text-[#1D2129] mb-2">路由说明</h4>
                      <MarkdownRenderer>{state.result.routes}</MarkdownRenderer>
                    </div>
                  )}

                  {/* Quality Report */}
                  {state.result.qualityReport && (
                    <div className="p-4 rounded-lg bg-[#F5F7FA] border border-[#E5E6EB]">
                      <h4 className="text-sm font-medium text-[#1D2129] mb-2">质检报告</h4>
                      <MarkdownRenderer>{state.result.qualityReport}</MarkdownRenderer>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Log Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-3xl h-[75vh]">
          <DialogHeader>
            <DialogTitle>执行日志</DialogTitle>
          </DialogHeader>
          <DialogBody className="min-h-0 p-4">
            <LogPanel
              logs={logEntries}
              streamBuffer={state.streamBuffer}
              agentNames={agentNames}
              variant="dialog"
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Tool Approval Dialog */}
      <ToolApprovalDialog
        request={approvalState.pending}
        onApprove={handleApprovalApprove}
        onReject={handleApprovalReject}
        onApproveAll={handleApprovalApproveAll}
        autoApprove={approvalState.autoApproved.size > 0}
      />

      {/* Pipeline Editor Dialog */}
      <PipelineEditorDialog
        pipeline={pipeline}
        onChange={setPipeline}
        onClose={() => setShowPipelineEditor(false)}
        open={showPipelineEditor}
      />
    </div>
  );
}

// ============================================================
// 首页包装（带SchedulerProvider）
// ============================================================

export default function HomePage() {
  return (
    <SchedulerProvider>
      <React.Suspense fallback={null}>
        <HomeContent />
      </React.Suspense>
    </SchedulerProvider>
  );
}
