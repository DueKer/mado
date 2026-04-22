'use client';

import * as React from 'react';
import {
  Upload, Plus, Trash2, Eye, Edit2, Download,
  FileText, BookOpen
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { FileUploader } from '@/components/rag/FileUploader';
import { CodeBlock } from '@/components/editor/CodeBlock';
import { useAppConfig, useKnowledgeBase } from '@/hooks/useStore';
import { useToast } from '@/components/ui/toast';
import { cn, formatFileSize, formatTime } from '@/lib/utils';
import type { RagDocument } from '@/types';

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
    const doc: RagDocument = {
      id: Date.now().toString(36),
      name: newRuleName.trim(),
      type: 'rule',
      content: newRuleContent.trim(),
      slices: [{
        id: Date.now().toString(36) + '_0',
        docId: '',
        content: newRuleContent.trim(),
        keywords: newRuleContent.split(/\s+/).slice(0, 10),
        index: 0,
      }],
      uploadTime: Date.now(),
    };
    doc.slices[0].docId = doc.id;
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
    updateDocument(selectedDoc.id, { name: editName, content: editContent });
    setEditOpen(false);
    addToast('success', '文档已更新');
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
        <div className="max-w-5xl mx-auto p-6">
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

          <p className="text-xs text-[#FF4D4F] font-medium mb-4">
            所有RAG功能免费开放，无文档数量、大小、检索次数限制
          </p>

          {/* Document List */}
          {documents.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen className="w-12 h-12 text-[#E5E6EB] mx-auto mb-4" />
              <p className="text-[#86909C]">暂无文档</p>
              <p className="text-xs text-[#86909C] mt-1">点击上方按钮上传文档或手动添加规范</p>
            </div>
          ) : (
            <div className="rounded-lg border border-[#E5E6EB] overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_100px_100px_160px] gap-4 px-4 py-3 bg-[#F5F7FA] border-b border-[#E5E6EB] text-xs font-medium text-[#86909C]">
                <span>文档名称</span>
                <span>类型</span>
                <span>切片数</span>
                <span className="text-right">操作</span>
              </div>

              {/* Table Rows */}
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

          <p className="text-xs text-center text-[#86909C] mt-4">
            共 {documents.length} 个文档 · 免费存储，无容量限制
          </p>
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
