'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Settings, HelpCircle, Zap } from 'lucide-react';
import { APP_NAME, APP_FULL_NAME } from '@/lib/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiConfigDialog } from './ApiConfigDialog';
import type { AppConfig, ModelType } from '@/types';

const NAV_ITEMS = [
  { label: '首页', href: '/' },
  { label: 'Agent管理', href: '/agent-manage' },
  { label: 'RAG知识库', href: '/rag-knowledge' },
  { label: '历史任务', href: '/history-task' },
  { label: '帮助中心', href: '/setting-help' },
];

interface NavbarProps {
  config: AppConfig;
  onConfigChange: (updates: Partial<AppConfig>) => void;
  onHasApiKeys: (v: boolean) => void;
}

export function Navbar({ config, onConfigChange, onHasApiKeys }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [apiOpen, setApiOpen] = React.useState(false);

  React.useEffect(() => {
    onHasApiKeys(config.apiKeys.openai.trim() !== '' || config.apiKeys.anthropic.trim() !== '');
  }, [config.apiKeys, onHasApiKeys]);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 h-[60px] bg-white border-b border-[#E5E6EB] flex items-center px-5">
        {/* Logo */}
        <div className="flex items-center gap-2 min-w-[200px]">
          <div className="w-8 h-8 rounded-lg bg-[#165DFF] flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-[#1D2129] text-base">
            {APP_NAME}
          </span>
          <span className="text-sm text-[#86909C] hidden lg:inline">
            · {APP_FULL_NAME}
          </span>
        </div>

        {/* Nav Links */}
        <div className="flex-1 flex items-center justify-center gap-1">
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? 'text-[#165DFF] bg-[#165DFF]/5 font-medium'
                    : 'text-[#86909C] hover:text-[#1D2129] hover:bg-[#F5F7FA]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Free tag */}
          <span className="text-xs font-bold text-[#FF4D4F] bg-[#FF4D4F]/10 px-2 py-0.5 rounded hidden md:inline">
            免费使用
          </span>

          {/* Model Switch */}
          <Select
            value={config.modelMode}
            onValueChange={(v) => onConfigChange({ modelMode: v as ModelType })}
          >
            <SelectTrigger className="w-[160px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dual">双模型协同</SelectItem>
              <SelectItem value="gpt-only">仅使用GPT-5.4</SelectItem>
              <SelectItem value="claude-only">仅使用Claude 4.6</SelectItem>
            </SelectContent>
          </Select>

          {/* API Config */}
          <button
            onClick={() => setApiOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#165DFF] hover:bg-[#F5F7FA] transition-colors"
            title="API配置"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Help */}
          <button
            onClick={() => router.push('/setting-help')}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:text-[#165DFF] hover:bg-[#F5F7FA] transition-colors"
            title="帮助中心"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </nav>

      <ApiConfigDialog
        open={apiOpen}
        onOpenChange={setApiOpen}
        config={config}
        onSave={onConfigChange}
      />
    </>
  );
}
