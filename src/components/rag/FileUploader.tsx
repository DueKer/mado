'use client';

import * as React from 'react';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import { cn, formatFileSize, generateId } from '@/lib/utils';
import { createSlices } from '@/lib/rag/slicing';
import type { RagDocument } from '@/types';

interface FileUploaderProps {
  onUpload: (doc: RagDocument) => void;
  maxSize?: number; // bytes
  accept?: string;
}

interface UploadState {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
  content?: string;
}

const SUPPORTED_EXTENSIONS = /\.(txt|md|ts|tsx|js|jsx|vue|html|css|less|scss|json)$/i;

export function FileUploader({ onUpload, maxSize = 10 * 1024 * 1024, accept = '.txt,.md,.ts,.tsx,.js,.jsx,.vue,.html,.css,.less,.scss,.json' }: FileUploaderProps) {
  const [uploads, setUploads] = React.useState<UploadState[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const processFile = React.useCallback(async (file: File) => {
    if (file.size > maxSize) {
      setUploads(prev => [...prev, {
        id: generateId(),
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'error',
        error: `文件超过大小限制（${formatFileSize(maxSize)}）`,
      }]);
      return;
    }

    if (!['text/plain', 'text/markdown', 'text/x.typescript', 'text/javascript', 'text/html', 'text/css', 'application/json', 'application/octet-stream'].includes(file.type)
        && !file.name.match(SUPPORTED_EXTENSIONS)) {
      setUploads(prev => [...prev, {
        id: generateId(),
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'error',
        error: '不支持的文件格式',
      }]);
      return;
    }

    const uploadId = generateId();
    setUploads(prev => [...prev, {
      id: uploadId,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading',
    }]);

    // 模拟进度
    for (let p = 0; p <= 100; p += 20) {
      await new Promise(r => setTimeout(r, 100));
      setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, progress: p } : u));
    }

    // 读取文件内容
    try {
      const content = await file.text();
      setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: 'done', progress: 100, content } : u));

      // 创建切片
      const slices = createSlices(content, uploadId);
      const doc: RagDocument = {
        id: uploadId,
        name: file.name,
        type: 'file',
        fileSize: file.size,
        content,
        slices,
        uploadTime: Date.now(),
      };

      onUpload(doc);
    } catch {
      setUploads(prev => prev.map(u => u.id === uploadId ? { ...u, status: 'error', error: '读取文件失败' } : u));
    }
  }, [maxSize, onUpload]);

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(processFile);
  }, [processFile]);

  const handleFileSelect = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(processFile);
    e.target.value = '';
  }, [processFile]);

  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-[#165DFF] bg-[#165DFF]/5'
            : 'border-[#E5E6EB] hover:border-[#165DFF]/50 hover:bg-[#F5F7FA]'
        )}
      >
        <Upload className="w-8 h-8 text-[#86909C] mx-auto mb-2" />
        <p className="text-sm text-[#1D2129]">拖拽文件到此处，或点击上传</p>
        <p className="text-xs text-[#86909C] mt-1">支持 txt/md/ts/tsx/js/jsx/vue/html/css/less/scss/json，单个文件建议不超过10MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Upload List */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map(upload => (
            <div key={upload.id} className="flex items-center gap-3 p-3 rounded-lg bg-[#F5F7FA] border border-[#E5E6EB]">
              <File className="w-5 h-5 text-[#86909C] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#1D2129] truncate">{upload.name}</p>
                <p className="text-xs text-[#86909C]">{formatFileSize(upload.size)}</p>
                {upload.status === 'uploading' && (
                  <div className="mt-1.5 h-1 bg-[#E5E6EB] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#165DFF] transition-all duration-200"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}
                {upload.status === 'error' && (
                  <p className="text-xs text-[#F87272] mt-1">{upload.error}</p>
                )}
              </div>
              <div className="shrink-0">
                {upload.status === 'done' && <CheckCircle className="w-4 h-4 text-[#36D399]" />}
                {upload.status === 'error' && <AlertCircle className="w-4 h-4 text-[#F87272]" />}
                {(upload.status === 'done' || upload.status === 'error') && (
                  <button onClick={() => removeUpload(upload.id)} className="ml-2 text-[#86909C] hover:text-[#F87272]">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
