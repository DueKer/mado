'use client';

import * as React from 'react';
import {
  Upload, Plus, Trash2, Eye, Edit2, Download,
  FileText, BookOpen, Search, Sparkles, Loader2, MessageSquare, RotateCcw
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { FileUploader } from '@/components/rag/FileUploader';
import { CodeBlock } from '@/components/editor/CodeBlock';
import { useAppConfig, useKnowledgeBase } from '@/hooks/useStore';
import { useToast } from '@/components/ui/toast';
import { cn, formatFileSize, formatTime } from '@/lib/utils';
import { createSlices } from '@/lib/rag/slicing';
import { MarkdownRenderer } from '@/components/editor/MarkdownRenderer';
import type { RagDocument, RagQueryResult } from '@/types';

interface RagChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: RagQueryResult[];
}

export default function RagKnowledgePage() {
  const { config, setConfig } = useAppConfig();
  const { documents, addDocument, removeDocument, updateDocument, isLoaded } = useKnowledgeBase();
  const { addToast } = useToast();

  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [ruleOpen, setRuleOpen] = React.useState(false);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [selectedDoc, setSelectedDoc] = React.useState<RagDocument | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editContent, setEditContent] = React.useState('');
  const [newRuleName, setNewRuleName] = React.useState('');
  const [newRuleContent, setNewRuleContent] = React.useState('');
  const [testQuery, setTestQuery] = React.useState('');
  const [testResults, setTestResults] = React.useState<RagQueryResult[]>([]);
  const [qaQuestion, setQaQuestion] = React.useState('');
  const [qaSources, setQaSources] = React.useState<RagQueryResult[]>([]);
  const [qaLoading, setQaLoading] = React.useState(false);
  const [qaHistory, setQaHistory] = React.useState<RagChatMessage[]>([]);
  const [topK, setTopK] = React.useState(8);
  const [maxTokensPerSlice, setMaxTokensPerSlice] = React.useState(800);
  const [enableBM25, setEnableBM25] = React.useState(true);
  const [enableAgentAwareness, setEnableAgentAwareness] = React.useState(true);

  const totalSlices = React.useMemo(
    () => documents.reduce((sum, doc) => sum + doc.slices.length, 0),
    [documents]
  );

  const handleFileUpload = (doc: RagDocument) => {
    // 检查重复
    const exists = documents.some(d => d.name === doc.name && d.content === doc.content);
    if (exists) {
      addToast('warning', '该文档已存在，无需重复上传');
      return;
    }
    addDocument(doc);
    setUploadOpen(false);
    addToast('success', `文档《${doc.name}》已加入知识库`);
  };

  const handleAddRule = () => {
    if (!newRuleName.trim() || !newRuleContent.trim()) {
      addToast('warning', '请输入规范名称和内容');
      return;
    }
    const docId = Date.now().toString(36);
    const content = newRuleContent.trim();
    const doc: RagDocument = {
      id: docId,
      name: newRuleName.trim(),
      type: 'rule',
      content,
      slices: createSlices(content, docId),
      uploadTime: Date.now(),
    };
    addDocument(doc);
    setRuleOpen(false);
    setNewRuleName('');
    setNewRuleContent('');
    addToast('success', '规范已添加');
  };

  const handleDelete = (doc: RagDocument) => {
    if (confirm(`确认删除《${doc.name}》？删除后无法恢复`)) {
      removeDocument(doc.id);
      addToast('success', '文档已删除');
    }
  };

  const handleView = (doc: RagDocument) => {
    setSelectedDoc(doc);
    setViewOpen(true);
  };

  const handleEdit = (doc: RagDocument) => {
    setSelectedDoc(doc);
    setEditName(doc.name);
    setEditContent(doc.content);
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedDoc) return;
    const content = editContent.trim();
    updateDocument(selectedDoc.id, {
      name: editName.trim(),
      content,
      slices: createSlices(content, selectedDoc.id),
    });
    setEditOpen(false);
    addToast('success', '文档已更新并重新切片');
  };

  const searchConfig = React.useMemo(() => ({
    topK,
    maxTokensPerSlice,
    enableBM25,
    enableAgentAwareness,
  }), [enableAgentAwareness, enableBM25, maxTokensPerSlice, topK]);

  const handleSearch = async () => {
    if (!testQuery.trim()) {
      addToast('warning', '请输入要检索的需求或问题');
      return;
    }
    try {
      const response = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: testQuery.trim(),
          agentId: 'generator',
          ...searchConfig,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '检索失败');
      setTestResults(data.documents ?? []);
      if ((data.documents ?? []).length === 0) {
        addToast('info', '未检索到相关切片');
      }
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : '检索失败');
    }
  };

  const handleAskKnowledgeBase = async () => {
    if (!qaQuestion.trim()) {
      addToast('warning', '请输入要询问知识库的问题');
      return;
    }
    if (documents.length === 0) {
      addToast('warning', '请先上传文档或添加规范');
      return;
    }

    const question = qaQuestion.trim();
    setQaHistory(prev => [...prev, { role: 'user', content: question }]);
    setQaQuestion('');
    setQaSources([]);

    setQaLoading(true);
    try {
      const response = await fetch('/api/rag/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          history: qaHistory,
          ...searchConfig,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '知识库问答失败');
      const sources = data.sources ?? [];
      setQaSources(sources);
      setQaHistory(prev => [...prev, {
        role: 'assistant',
        content: data.answer ?? '',
        sources,
      }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '知识库问答失败';
      addToast('error', message);
      setQaHistory(prev => [...prev, { role: 'assistant', content: `问答失败：${message}` }]);
    } finally {
      setQaLoading(false);
    }
  };

  const handleDownload = (doc: RagDocument) => {
    const blob = new Blob([doc.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    a.click();
    URL.revokeObjectURL(url);
    addToast('success', '下载成功');
  };

  if (!isLoaded) return null;

  return (
    <div className="h-screen flex flex-col">
      <Navbar config={config} onConfigChange={setConfig} onHasApiKeys={() => {}} />

      <div className="flex-1 pt-[60px] overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-[#1D2129]">RAG 私有知识库</h1>
              <p className="text-sm text-[#86909C] mt-1">
                上传文档或手动添加规范，Agent执行时会自动检索参考
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRuleOpen(true)}>
                <Plus className="w-4 h-4" /> 手动添加规范
              </Button>
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="w-4 h-4" /> 上传文档
              </Button>
            </div>
          </div>

          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-[#E5E6EB] bg-white p-4">
              <p className="text-xs text-[#86909C]">文档数</p>
              <p className="mt-1 text-2xl font-semibold text-[#1D2129]">{documents.length}</p>
            </div>
            <div className="rounded-lg border border-[#E5E6EB] bg-white p-4">
              <p className="text-xs text-[#86909C]">切片数</p>
              <p className="mt-1 text-2xl font-semibold text-[#1D2129]">{totalSlices}</p>
            </div>
            <div className="rounded-lg border border-[#E5E6EB] bg-white p-4">
              <p className="text-xs text-[#86909C]">AI 问答</p>
              <p className="mt-1 text-sm font-medium text-[#1D2129]">基于命中切片回答</p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
            <div className="space-y-4">
              {documents.length === 0 ? (
                <div className="text-center py-16 rounded-lg border border-[#E5E6EB] bg-white">
                  <BookOpen className="w-12 h-12 text-[#E5E6EB] mx-auto mb-4" />
                  <p className="text-[#86909C]">暂无文档</p>
                  <p className="text-xs text-[#86909C] mt-1">点击上方按钮上传文档或手动添加规范</p>
                </div>
              ) : (
                <div className="rounded-lg border border-[#E5E6EB] overflow-hidden bg-white">
                  <div className="grid grid-cols-[1fr_100px_100px_160px] gap-4 px-4 py-3 bg-[#F5F7FA] border-b border-[#E5E6EB] text-xs font-medium text-[#86909C]">
                    <span>文档名称</span>
                    <span>类型</span>
                    <span>切片数</span>
                    <span className="text-right">操作</span>
                  </div>

                  {documents.map(doc => (
                    <div
                      key={doc.id}
                      className="grid grid-cols-[1fr_100px_100px_160px] gap-4 px-4 py-3 items-center border-b border-[#E5E6EB] last:border-0 hover:bg-[#F5F7FA]/50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#86909C] shrink-0" />
                          <span className="text-sm text-[#1D2129] truncate">{doc.name}</span>
                        </div>
                        <p className="text-xs text-[#86909C] mt-0.5 truncate">
                          {formatTime(doc.uploadTime)} · {doc.fileSize ? formatFileSize(doc.fileSize) : '手动添加'}
                        </p>
                      </div>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded self-center w-fit',
                        doc.type === 'file'
                          ? 'bg-[#165DFF]/10 text-[#165DFF]'
                          : 'bg-[#36D399]/10 text-[#36D399]'
                      )}>
                        {doc.type === 'file' ? '文件' : '规范'}
                      </span>
                      <span className="text-sm text-[#64748B] self-center">{doc.slices.length}</span>
                      <div className="flex items-center justify-end gap-1 self-center">
                        <button onClick={() => handleView(doc)} className="p-1.5 rounded text-[#86909C] hover:text-[#165DFF] hover:bg-[#F5F7FA] transition-colors" title="查看">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleEdit(doc)} className="p-1.5 rounded text-[#86909C] hover:text-[#165DFF] hover:bg-[#F5F7FA] transition-colors" title="编辑">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDownload(doc)} className="p-1.5 rounded text-[#86909C] hover:text-[#165DFF] hover:bg-[#F5F7FA] transition-colors" title="下载">
                          <Download className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(doc)} className="p-1.5 rounded text-[#86909C] hover:text-[#F87272] hover:bg-[#F5F7FA] transition-colors" title="删除">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-center text-[#86909C]">
                共 {documents.length} 个文档 · {totalSlices} 个切片
              </p>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-[#E5E6EB] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#1D2129]">检索参数</p>
                  <span className="text-xs text-[#86909C]">后端接口同步使用</span>
                </div>
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="text-[#64748B]">返回切片数 topK</span>
                      <span className="font-medium text-[#1D2129]">{topK}</span>
                    </div>
                    <Slider value={[topK]} min={1} max={12} step={1} onValueChange={value => setTopK(value[0] ?? 8)} />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="text-[#64748B]">单切片上下文上限</span>
                      <span className="font-medium text-[#1D2129]">{maxTokensPerSlice}</span>
                    </div>
                    <Slider value={[maxTokensPerSlice]} min={300} max={1500} step={100} onValueChange={value => setMaxTokensPerSlice(value[0] ?? 800)} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[#64748B]">BM25 关键词排序</span>
                    <Switch checked={enableBM25} onCheckedChange={setEnableBM25} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-[#64748B]">Agent 感知重排</span>
                    <Switch checked={enableAgentAwareness} onCheckedChange={setEnableAgentAwareness} />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[#E5E6EB] bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#1D2129]">
                  <Search className="w-4 h-4 text-[#165DFF]" />
                  检索测试
                </div>
                <p className="mt-1 text-xs text-[#86909C]">输入需求，查看 Agent 会命中的知识切片。</p>
                <div className="mt-3 flex gap-2">
                  <Input
                    value={testQuery}
                    onChange={e => setTestQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                    placeholder="例如：生成登录页需要遵守哪些规范"
                    className="flex-1"
                  />
                  <Button onClick={handleSearch} variant="secondary">
                    检索
                  </Button>
                </div>
                <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto">
                  {testResults.map((item, index) => (
                    <RagResultCard key={`${item.slice.id}_${index}`} item={item} index={index} />
                  ))}
                  {testQuery && testResults.length === 0 && (
                    <p className="text-xs text-[#86909C]">暂无命中结果</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[#E5E6EB] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1D2129]">
                    <Sparkles className="w-4 h-4 text-[#165DFF]" />
                    问知识库
                  </div>
                  {qaHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setQaHistory([]);
                        setQaSources([]);
                      }}
                      className="flex items-center gap-1 text-xs text-[#86909C] hover:text-[#165DFF]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      清空会话
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-[#86909C]">AI 只基于命中的私有知识回答，并展示引用来源。</p>
                {qaHistory.length > 0 && (
                  <div className="mt-3 max-h-[420px] space-y-3 overflow-y-auto rounded-lg border border-[#E5E6EB] bg-[#F7F8FA] p-3">
                    {qaHistory.map((message, index) => (
                      <div
                        key={`${message.role}_${index}`}
                        className={cn(
                          'rounded-lg border p-3',
                          message.role === 'user'
                            ? 'ml-8 border-[#165DFF]/20 bg-[#E8F3FF]'
                            : 'mr-8 border-[#E5E6EB] bg-white'
                        )}
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#1D2129]">
                          {message.role === 'user' ? <MessageSquare className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5 text-[#165DFF]" />}
                          {message.role === 'user' ? '你' : '知识库助手'}
                        </div>
                        <MarkdownRenderer>{message.content}</MarkdownRenderer>
                        {message.sources && message.sources.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {message.sources.slice(0, 3).map((item, sourceIndex) => (
                              <RagResultCard key={`${item.slice.id}_history_${index}_${sourceIndex}`} item={item} index={sourceIndex} compact />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {qaLoading && (
                      <div className="flex items-center gap-2 text-xs text-[#86909C]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        正在基于后端 RAG 检索和 AI 生成回答...
                      </div>
                    )}
                  </div>
                )}
                <Textarea
                  value={qaQuestion}
                  onChange={e => setQaQuestion(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      handleAskKnowledgeBase();
                    }
                  }}
                  placeholder="输入要问知识库的问题..."
                  rows={4}
                  className="mt-3 w-full"
                />
                <Button onClick={handleAskKnowledgeBase} disabled={qaLoading} className="mt-3 w-full">
                  {qaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {qaLoading ? '正在回答' : '基于知识库回答'}
                </Button>
                {qaSources.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-medium text-[#1D2129]">引用来源</p>
                    {qaSources.slice(0, 4).map((item, index) => (
                      <RagResultCard key={`${item.slice.id}_qa_${index}`} item={item} index={index} compact />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>上传文档</DialogTitle>
            <p className="text-xs text-[#86909C]">支持txt/md/ts/tsx/js/jsx，无大小、数量限制</p>
          </DialogHeader>
          <DialogBody>
            <FileUploader onUpload={handleFileUpload} />
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">关闭</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Rule Dialog */}
      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>手动添加规范</DialogTitle>
            <p className="text-xs text-[#86909C]">保存后自动切片加入知识库，支持编辑删除</p>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">规范名称</label>
              <Input
                value={newRuleName}
                onChange={e => setNewRuleName(e.target.value)}
                placeholder="如：组件命名规范"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">规范内容</label>
              <Textarea
                value={newRuleContent}
                onChange={e => setNewRuleContent(e.target.value)}
                placeholder="输入详细的规范内容..."
                rows={8}
                className="w-full"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">取消</Button>
            </DialogClose>
            <Button onClick={handleAddRule}>保存规范</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{selectedDoc?.name}</DialogTitle>
            <p className="text-xs text-[#86909C]">
              {selectedDoc?.type === 'file' ? '上传文档' : '手动规范'} · {selectedDoc?.slices.length} 个切片
            </p>
          </DialogHeader>
          <DialogBody className="overflow-y-auto space-y-4">
            <CodeBlock
              code={selectedDoc?.content ?? ''}
              language="typescript"
              filename={selectedDoc?.name}
              maxHeight="400px"
            />
            <div>
              <p className="text-sm font-medium text-[#1D2129] mb-2">切片内容</p>
              <div className="space-y-2">
                {selectedDoc?.slices.map(slice => (
                  <div key={slice.id} className="p-3 rounded-lg bg-[#F5F7FA] border border-[#E5E6EB]">
                    <p className="text-xs text-[#86909C] mb-1">切片 {slice.index + 1}</p>
                    <p className="text-sm text-[#64748B] font-mono line-clamp-3">{slice.content}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {slice.keywords.map(kw => (
                        <span key={kw} className="text-xs bg-[#165DFF]/10 text-[#165DFF] px-1.5 py-0.5 rounded">{kw}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => handleDownload(selectedDoc!)}>
              <Download className="w-4 h-4" /> 下载
            </Button>
            <DialogClose asChild>
              <Button variant="secondary">关闭</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑文档</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">文档名称</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">文档内容</label>
              <Textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                rows={10}
                className="w-full"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">取消</Button>
            </DialogClose>
            <Button onClick={handleSaveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RagResultCard({ item, index, compact = false }: { item: RagQueryResult; index: number; compact?: boolean }) {
  return (
    <div className="rounded-lg border border-[#E5E6EB] bg-[#F7F8FA] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[#1D2129] truncate">
          {index + 1}. {item.doc.name}
        </p>
        <span className="shrink-0 text-[11px] text-[#165DFF] bg-[#165DFF]/10 px-1.5 py-0.5 rounded">
          {item.score.toFixed(2)}
        </span>
      </div>
      <p className={cn('mt-1 text-xs text-[#64748B] font-mono', compact ? 'line-clamp-2' : 'line-clamp-4')}>
        {item.slice.content}
      </p>
      {!compact && item.matchedKeywords.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.matchedKeywords.map(keyword => (
            <span key={keyword} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#64748B]">
              {keyword}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
