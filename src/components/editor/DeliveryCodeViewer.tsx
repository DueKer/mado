'use client';

import * as React from 'react';
import { FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock, inferLanguageFromFilename } from './CodeBlock';

interface DeliveryCodeViewerProps {
  files: Record<string, string>;
  maxHeight?: string;
}

export function DeliveryCodeViewer({ files, maxHeight = '70vh' }: DeliveryCodeViewerProps) {
  const entries = React.useMemo(() => Object.entries(files), [files]);
  const [activeFilename, setActiveFilename] = React.useState(entries[0]?.[0] ?? '');

  React.useEffect(() => {
    if (entries.length === 0) {
      setActiveFilename('');
      return;
    }
    if (!entries.some(([filename]) => filename === activeFilename)) {
      setActiveFilename(entries[0][0]);
    }
  }, [activeFilename, entries]);

  if (entries.length === 0) {
    return null;
  }

  const activeEntry = entries.find(([filename]) => filename === activeFilename) ?? entries[0];
  const [filename, code] = activeEntry;

  return (
    <div className="rounded-lg border border-[#E5E6EB] bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[#E5E6EB] bg-[#F7F8FA] px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1D2129]">
          <FileCode2 className="h-4 w-4 text-[#165DFF]" />
          交付代码
        </div>
        <span className="text-xs text-[#86909C]">{entries.length} 个文件</span>
      </div>

      {entries.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-[#E5E6EB] bg-white px-2 py-2">
          {entries.map(([itemFilename]) => {
            const active = itemFilename === filename;
            return (
              <button
                key={itemFilename}
                type="button"
                onClick={() => setActiveFilename(itemFilename)}
                className={cn(
                  'shrink-0 rounded-md px-3 py-1.5 text-xs font-mono transition-colors',
                  active
                    ? 'bg-[#165DFF] text-white'
                    : 'bg-[#F5F7FA] text-[#64748B] hover:bg-[#E8F3FF] hover:text-[#165DFF]'
                )}
              >
                {itemFilename}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-3">
        <CodeBlock
          key={filename}
          code={code}
          filename={filename}
          language={inferLanguageFromFilename(filename)}
          maxHeight={maxHeight}
        />
      </div>
    </div>
  );
}
