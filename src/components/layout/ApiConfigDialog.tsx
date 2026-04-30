'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AppConfig } from '@/types';

interface ApiConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AppConfig;
  onSave: (updates: Partial<AppConfig>) => void;
}

export function ApiConfigDialog({ open, onOpenChange, config, onSave }: ApiConfigDialogProps) {
  const [openai, setOpenai] = React.useState(config.apiKeys.openai);
  const [anthropic, setAnthropic] = React.useState(config.apiKeys.anthropic);
  const [groq, setGroq] = React.useState(config.apiKeys.groq ?? '');
  const [siliconflow, setSiliconflow] = React.useState(config.apiKeys.siliconflow ?? '');
  const [baseUrl, setBaseUrl] = React.useState(config.baseUrl ?? '');
  const [gptModel, setGptModel] = React.useState(config.gptModel ?? '');
  const [showOpenAI, setShowOpenAI] = React.useState(false);
  const [showClaude, setShowClaude] = React.useState(false);
  const [showGroq, setShowGroq] = React.useState(false);
  const [showSiliconflow, setShowSiliconflow] = React.useState(false);
  const [temperature, setTemperature] = React.useState(config.temperature);
  const [maxTokens, setMaxTokens] = React.useState(config.maxTokens);
  const [timeout, setTimeout] = React.useState(config.timeout);
  const [advanced, setAdvanced] = React.useState(false);

  React.useEffect(() => {
    setOpenai(config.apiKeys.openai);
    setAnthropic(config.apiKeys.anthropic);
    setGroq(config.apiKeys.groq ?? '');
    setSiliconflow(config.apiKeys.siliconflow ?? '');
    setBaseUrl(config.baseUrl ?? '');
    setGptModel(config.gptModel ?? '');
    setTemperature(config.temperature);
    setMaxTokens(config.maxTokens);
    setTimeout(config.timeout);
  }, [config, open]);

  const handleSave = () => {
    onSave({
      apiKeys: { openai, anthropic, groq, siliconflow },
      baseUrl: baseUrl || undefined,
      gptModel: gptModel || undefined,
      temperature,
      maxTokens,
      timeout,
    });
    onOpenChange(false);
  };

  const handleReset = () => {
    setOpenai('');
    setAnthropic('');
    setGroq('');
    setSiliconflow('');
    setBaseUrl('');
    setGptModel('');
    setTemperature(0.1);
    setMaxTokens(4096);
    setTimeout(30);
    onSave({
      apiKeys: { openai: '', anthropic: '', groq: '', siliconflow: '' },
      baseUrl: undefined,
      gptModel: undefined,
      temperature: 0.1,
      maxTokens: 4096,
      timeout: 30,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>API 配置</DialogTitle>
          <p className="text-xs text-[#86909C] mt-1">密钥加密存储在本地，仅用于模型调用</p>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* OpenAI */}
          <div>
            <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">
              GPT API Key <span className="text-[#FF4D4F] text-xs font-normal">（用于规划、生成、质检）</span>
            </label>
            <div className="relative">
              <Input
                type={showOpenAI ? 'text' : 'password'}
                value={openai}
                onChange={e => setOpenai(e.target.value)}
                placeholder="sk-..."
                className="pr-10"
              />
              <button
                onClick={() => setShowOpenAI(!showOpenAI)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86909C] hover:text-[#1D2129]"
              >
                {showOpenAI ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Anthropic */}
          <div>
            <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">
              Claude API Key <span className="text-[#FF4D4F] text-xs font-normal">（用于长文档解析）</span>
            </label>
            <div className="relative">
              <Input
                type={showClaude ? 'text' : 'password'}
                value={anthropic}
                onChange={e => setAnthropic(e.target.value)}
                placeholder="sk-ant-..."
                className="pr-10"
              />
              <button
                onClick={() => setShowClaude(!showClaude)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86909C] hover:text-[#1D2129]"
              >
                {showClaude ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Groq */}
          <div>
            <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">
              Groq API Key <span className="text-[#FF4D4F] text-xs font-normal">（免费高速，OpenAI Key 为空时自动使用）</span>
            </label>
            <div className="relative">
              <Input
                type={showGroq ? 'text' : 'password'}
                value={groq}
                onChange={e => setGroq(e.target.value)}
                placeholder="gsk_..."
                className="pr-10"
              />
              <button
                onClick={() => setShowGroq(!showGroq)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86909C] hover:text-[#1D2129]"
              >
                {showGroq ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* SiliconFlow */}
          <div>
            <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">
              SiliconFlow API Key <span className="text-[#FF4D4F] text-xs font-normal">（国内可用，OpenAI Key 不可用时自动使用）</span>
            </label>
            <div className="relative">
              <Input
                type={showSiliconflow ? 'text' : 'password'}
                value={siliconflow}
                onChange={e => setSiliconflow(e.target.value)}
                placeholder="sk-..."
                className="pr-10"
              />
              <button
                onClick={() => setShowSiliconflow(!showSiliconflow)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86909C] hover:text-[#1D2129]"
              >
                {showSiliconflow ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Base URL */}
          <div>
            <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">
              API 地址（可选）
              <span className="text-[#FF4D4F] text-xs font-normal ml-1">中转代理必填</span>
            </label>
            <Input
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1（留空则使用默认）"
              className="text-xs"
            />
            <p className="text-xs text-[#86909C] mt-1">如使用中转代理（如 msutools.cn），填入完整 base URL</p>
          </div>

          {/* GPT Model */}
          <div>
            <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">
              GPT 模型名（可选）
            </label>
            <Input
              value={gptModel}
              onChange={e => setGptModel(e.target.value)}
              placeholder="gpt-5.4-mini（留空则使用默认 gpt-5.4-mini）"
              className="text-xs"
            />
            <p className="text-xs text-[#86909C] mt-1">指定中转代理支持的模型名称</p>
          </div>

          {/* Advanced Toggle */}
          <button
            onClick={() => setAdvanced(!advanced)}
            className="text-sm text-[#165DFF] hover:underline"
          >
            {advanced ? '收起' : '展开'} 高级设置
          </button>

          {advanced && (
            <div className="space-y-4 pt-2 border-t border-[#E5E6EB]">
              {/* Temperature */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-[#1D2129]">温度</label>
                  <span className="text-xs text-[#86909C]">{temperature}</span>
                </div>
                <Slider
                  value={[temperature]}
                  min={0.1}
                  max={1}
                  step={0.1}
                  onValueChange={([v]) => setTemperature(v)}
                />
                <p className="text-xs text-[#86909C] mt-1">越低输出越严谨，越高越有创意</p>
              </div>

              {/* Max Tokens */}
              <div>
                <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">上下文长度</label>
                <Select value={String(maxTokens)} onValueChange={v => setMaxTokens(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2048">2048 Token</SelectItem>
                    <SelectItem value="4096">4096 Token</SelectItem>
                    <SelectItem value="8192">8192 Token</SelectItem>
                    <SelectItem value="16384">16384 Token</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Timeout */}
              <div>
                <label className="text-sm font-medium text-[#1D2129] mb-1.5 block">Agent 超时时间（秒）</label>
                <Input
                  type="number"
                  value={timeout}
                  onChange={e => setTimeout(Number(e.target.value))}
                  min={10}
                  max={120}
                />
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="secondary" onClick={handleReset}>重置</Button>
          <DialogClose asChild>
            <Button variant="secondary">取消</Button>
          </DialogClose>
          <Button onClick={handleSave}>保存配置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
