'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Zap, Play, Pause, Square, RotateCcw, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Navbar } from '@/components/layout/Navbar';
import { AgentPanel } from '@/components/agents/AgentPanel';
import { LogPanel } from '@/components/agents/LogPanel';
import { FileUploader } from '@/components/rag/FileUploader';
import { CodeBlock } from '@/components/editor/CodeBlock';
import { MarkdownRenderer } from '@/components/editor/MarkdownRenderer';
import { useAppConfig, useKnowledgeBase, useHistory } from '@/hooks/useStore';
import { useToast } from '@/components/ui/toast';
import { SchedulerProvider, useScheduler } from '@/hooks/useScheduler';
import { runOrchestrator } from '@/lib/orchestrator';
import type { AgentId, RagDocument, FileUpload } from '@/types';
import { AGENTS, REQUIREMENT_TEMPLATES } from '@/lib/constants';
import {
  PipelineEditorDialog,
  PipelineIndicator,
  createDefaultPipeline,
} from '@/components/pipeline/PipelineEditor';
import type { PipelineConfig } from '@/components/pipeline/PipelineEditor';
import { ToolApprovalDialog, useToolApproval } from '@/components/tools/ToolApprovalDialog';
import type { OrchestratorConfig } from '@/lib/orchestrator';

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
    state, startTask, pauseTask, resumeTask, interruptTask,
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
  const [uploadedFiles, setUploadedFiles] = React.useState<FileUpload[]>([]);
  const [agentPanelCollapsed, setAgentPanelCollapsed] = React.useState(false);
  const [logPanelCollapsed, setLogPanelCollapsed] = React.useState(true);
  const [showResult, setShowResult] = React.useState(false);
  const [hasLoadedRerun, setHasLoadedRerun] = React.useState(false);

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

    const input = { requirement: requirement.trim(), files: uploadedFiles };

    startTask(input, config.modelMode);

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
          setAgentStatus(agentId, 'running', 0);
          addLog(agentId, `[${agentId}] 开始执行`);
        },
        onAgentProgress: (agentId, progress) => {
          setAgentStatus(agentId, 'running', progress);
        },
        onAgentLog: (agentId, log) => {
          addLog(agentId, log);
        },
        onAgentOutput: (agentId, output) => {
          setAgentOutput(agentId, output);
        },
        onAgentError: (agentId, error) => {
          setAgentError(agentId, error);
          setAgentStatus(agentId, 'failed', 0);
          addLog(agentId, `错误: ${error}`);
        },
        onAgentComplete: (agentId, output) => {
          setAgentStatus(agentId, 'completed', 100);
          setAgentOutput(agentId, output);
        },
        onStream: (text) => {
          appendStream(text);
        },
        onToolApproval: async (toolName, args) => {
          return await requestApproval({ id: `call_${Date.now()}`, name: toolName, arguments: args });
        },
        onToolResult: (toolName, result) => {
          addLog(state.currentAgentId ?? 'planner', `工具 ${toolName} 结果: ${result.substring(0, 100)}...`);
        },
        onComplete: (result) => {
          setResult(result);
          setAgentStatus('delivery', 'completed', 100);
          completeTask('completed', result);
          setShowResult(true);
          addToast('success', '任务执行完成！');
        },
        onError: (error) => {
          addLog('planner', `错误: ${error}`);
          addToast('error', `执行出错: ${error}`);
          completeTask('failed');
        },
      },
      orchestratorConfig
    );

    setLogPanelCollapsed(false);
    addToast('info', '多Agent协同任务已启动');
  };

  const handleInterrupt = () => {
    interruptTask();
    addToast('info', '任务已中断');
  };

  const handleReset = () => {
    interruptTask();
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
            <div className="max-w-4xl mx-auto space-y-5">
              {/* Requirement Input */}
              <div>
                <label className="text-sm font-medium text-[#1D2129] mb-2 block">
                  需求输入
                </label>
                <Textarea
                  value={requirement}
                  onChange={e => setRequirement(e.target.value)}
                  placeholder={'请输入前端研发需求（例：开发一个Next.js登录页面，包含表单验证），所有功能免费使用'}
                  className="w-full min-h-[120px] text-sm resize-y"
                  rows={5}
                  disabled={state.isRunning}
                />
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
                        {!state.isRunning && (
                          <button onClick={() => removeFile(file.id)} className="text-[#86909C] hover:text-[#F87272]">✕</button>
                        )}
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
                      disabled={state.isRunning}
                      className="px-3 py-1.5 text-xs rounded-lg border border-[#E5E6EB] text-[#64748B] hover:border-[#165DFF] hover:text-[#165DFF] transition-colors disabled:opacity-50"
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                {!state.isRunning ? (
                  <Button
                    onClick={handleStartTask}
                    className="w-full h-11 text-sm font-medium"
                  >
                    <Zap className="w-4 h-4" />
                    启动多Agent协同
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    {state.isPaused ? (
                      <Button onClick={resumeTask} className="flex-1 h-11">
                        <Play className="w-4 h-4" /> 继续
                      </Button>
                    ) : (
                      <Button onClick={pauseTask} variant="secondary" className="flex-1 h-11">
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

                  {/* Code Blocks */}
                  {Object.entries(state.result.code).map(([filename, code]) => (
                    <CodeBlock
                      key={filename}
                      code={code}
                      filename={filename}
                      language={filename.endsWith('.tsx') ? 'tsx' : filename.endsWith('.ts') ? 'typescript' : 'javascript'}
                    />
                  ))}

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

          {/* Log Panel */}
          <LogPanel
            logs={logEntries}
            streamBuffer={state.streamBuffer}
            collapsed={logPanelCollapsed}
            onToggleCollapse={() => setLogPanelCollapsed(!logPanelCollapsed)}
            agentNames={agentNames}
          />
        </div>
      </div>

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
