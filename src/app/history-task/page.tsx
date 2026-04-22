'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  History, Trash2, RotateCcw, Copy, CheckCircle, XCircle, AlertTriangle, Eye,
  FileText, Loader2, Search, X
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { CodeBlock } from '@/components/editor/CodeBlock';
import { useAppConfig, useHistory } from '@/hooks/useStore';
import { useToast } from '@/components/ui/toast';
import { cn, formatTime } from '@/lib/utils';
import type { Task, AgentId } from '@/types';

const STATUS_CONFIG = {
  idle: { label: '未执行', color: 'text-[#86909C]', bg: 'bg-[#86909C]/10', icon: <Loader2 className="w-3.5 h-3.5" /> },
  pending: { label: '等待中', color: 'text-[#86909C]', bg: 'bg-[#86909C]/10', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  running: { label: '执行中', color: 'text-[#165DFF]', bg: 'bg-[#165DFF]/10', icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  completed: { label: '已完成', color: 'text-[#36D399]', bg: 'bg-[#36D399]/10', icon: <CheckCircle className="w-3.5 h-3.5" /> },
  failed: { label: '执行失败', color: 'text-[#F87272]', bg: 'bg-[#F87272]/10', icon: <XCircle className="w-3.5 h-3.5" /> },
  interrupted: { label: '已中断', color: 'text-[#FBBD23]', bg: 'bg-[#FBBD23]/10', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

export default function HistoryTaskPage() {
  const router = useRouter();
  const { config, setConfig } = useAppConfig();
  const { tasks, removeTask, removeTasks, clearAll, isLoaded } = useHistory();
  const { addToast } = useToast();

  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Filtered tasks based on search
  const filteredTasks = React.useMemo(() => {
    if (!searchQuery.trim()) return tasks;
    const q = searchQuery.toLowerCase();
    return tasks.filter(task =>
      task.name.toLowerCase().includes(q) ||
      task.input.requirement.toLowerCase().includes(q)
    );
  }, [tasks, searchQuery]);

  const handleView = (task: Task) => {
    setSelectedTask(task);
    setDetailOpen(true);
  };

  const handleDelete = (taskId: string) => {
    removeTask(taskId);
    addToast('success', '任务已删除');
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) {
      addToast('warning', '请先选择要删除的任务');
      return;
    }
    if (confirm(`确认删除选中的 ${selectedIds.size} 个任务？`)) {
      removeTasks(Array.from(selectedIds));
      setSelectedIds(new Set());
      setBatchMode(false);
      addToast('success', '选中任务已删除');
    }
  };

  const handleClearAll = () => {
    if (confirm('确认清空所有历史任务？此操作不可恢复')) {
      clearAll();
      addToast('success', '所有历史任务已清空');
    }
  };

  const handleRerun = (task: Task) => {
    router.push(`/?rerun=${task.id}`);
  };

  const handleCopyResult = (task: Task) => {
    if (!task.result) return;
    const text = Object.entries(task.result.code).map(([f, c]) => `// ${f}\n${c}`).join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      addToast('success', '交付结果已复制到剪贴板');
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isLoaded) return null;

  return (
    <div className="h-screen flex flex-col">
      <Navbar config={config} onConfigChange={setConfig} onHasApiKeys={() => {}} />

      <div className="flex-1 pt-[60px] overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-[#1D2129]">历史任务</h1>
              <p className="text-sm text-[#86909C] mt-1">查看和管理所有执行过的任务记录</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setBatchMode(!batchMode)}
              >
                {batchMode ? '取消选择' : '批量删除'}
              </Button>
              {batchMode && tasks.length > 0 && (
                <Button variant="danger" onClick={handleBatchDelete}>
                  <Trash2 className="w-4 h-4" /> 删除选中 ({selectedIds.size})
                </Button>
              )}
              {!batchMode && tasks.length > 0 && (
                <Button variant="secondary" onClick={handleClearAll}>
                  <Trash2 className="w-4 h-4" /> 清空历史
                </Button>
              )}
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#86909C]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索任务名称或需求内容..."
              className="w-full h-10 pl-9 pr-9 rounded-lg border border-[#E5E6EB] text-sm text-[#1D2129] placeholder:text-[#86909C] focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86909C] hover:text-[#1D2129]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {searchQuery && filteredTasks.length === 0 ? (
            <div className="text-center py-12">
              <Search className="w-10 h-10 text-[#E5E6EB] mx-auto mb-3" />
              <p className="text-[#86909C] text-sm">未找到匹配的任务</p>
              <p className="text-xs text-[#86909C] mt-1">尝试使用不同的关键词搜索</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map(task => {
                const status = STATUS_CONFIG[task.status];
                const isSelected = selectedIds.has(task.id);

                return (
                  <div
                    key={task.id}
                    className={cn(
                      'rounded-lg border p-4 transition-all',
                      isSelected
                        ? 'border-[#165DFF] bg-[#165DFF]/5'
                        : 'border-[#E5E6EB] bg-white hover:border-[#165DFF]/30'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {batchMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(task.id)}
                          className="mt-1 accent-[#165DFF]"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-[#1D2129] truncate">{task.name}</h3>
                          <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded shrink-0', status.color, status.bg)}>
                            {status.icon}
                            {status.label}
                          </span>
                        </div>
                        <p className="text-xs text-[#86909C] mb-2 truncate">{task.input.requirement}</p>
                        <div className="flex items-center gap-4 text-xs text-[#86909C]">
                          <span>{formatTime(task.createdAt)}</span>
                          {task.input.files && task.input.files.length > 0 && (
                            <span className="flex items-center gap-1">
                              <FileText className="w-3 h-3" />
                              {task.input.files.length}个文件
                            </span>
                          )}
                          {task.result && (
                            <span>{Object.keys(task.result.code).length} 个代码文件</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleView(task)}
                          className="p-1.5 rounded text-[#86909C] hover:text-[#165DFF] hover:bg-[#F5F7FA] transition-colors"
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRerun(task)}
                          className="p-1.5 rounded text-[#86909C] hover:text-[#165DFF] hover:bg-[#F5F7FA] transition-colors"
                          title="重新执行"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        {task.result && (
                          <button
                            onClick={() => handleCopyResult(task)}
                            className="p-1.5 rounded text-[#86909C] hover:text-[#165DFF] hover:bg-[#F5F7FA] transition-colors"
                            title="复制结果"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(task.id)}
                          className="p-1.5 rounded text-[#86909C] hover:text-[#F87272] hover:bg-[#F5F7FA] transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>任务详情 - {selectedTask?.name}</DialogTitle>
            {selectedTask && (
              <p className="text-xs text-[#86909C]">
                {formatTime(selectedTask.createdAt)} · {STATUS_CONFIG[selectedTask.status].label}
              </p>
            )}
          </DialogHeader>
          <DialogBody className="overflow-y-auto space-y-4">
            {/* Requirement */}
            <div>
              <p className="text-sm font-medium text-[#1D2129] mb-1">需求</p>
              <p className="text-sm text-[#64748B] p-3 bg-[#F5F7FA] rounded-lg">{selectedTask?.input.requirement}</p>
            </div>

            {/* Files */}
            {selectedTask?.input.files && selectedTask.input.files.length > 0 && (
              <div>
                <p className="text-sm font-medium text-[#1D2129] mb-1">上传文件</p>
                <div className="space-y-1">
                  {selectedTask.input.files.map(f => (
                    <div key={f.id} className="flex items-center gap-2 text-xs text-[#64748B]">
                      <FileText className="w-3.5 h-3.5" />
                      {f.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent Status */}
            <div>
              <p className="text-sm font-medium text-[#1D2129] mb-2">Agent 执行状态</p>
              <div className="grid grid-cols-5 gap-2">
                {(['planner', 'document', 'generator', 'quality', 'delivery'] as AgentId[]).map(id => {
                  const exec = selectedTask?.executions[id];
                  const s = exec ? STATUS_CONFIG[exec.status] : STATUS_CONFIG.idle;
                  return (
                    <div key={id} className={cn('text-center p-2 rounded-lg', s.bg)}>
                      <p className={cn('text-xs font-medium', s.color)}>{id}</p>
                      <p className="text-xs text-[#86909C] mt-0.5">{exec?.status ?? 'idle'}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Result Code */}
            {selectedTask?.result && Object.keys(selectedTask.result.code).length > 0 && (
              <div>
                <p className="text-sm font-medium text-[#1D2129] mb-2">交付代码</p>
                {Object.entries(selectedTask.result.code).map(([filename, code]) => (
                  <CodeBlock
                    key={filename}
                    code={code}
                    filename={filename}
                    language={filename.endsWith('.tsx') ? 'tsx' : 'typescript'}
                    maxHeight="300px"
                  />
                ))}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {selectedTask && (
              <Button variant="secondary" onClick={() => handleRerun(selectedTask)}>
                <RotateCcw className="w-4 h-4" /> 重新执行
              </Button>
            )}
            <DialogClose asChild>
              <Button variant="secondary">关闭</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
