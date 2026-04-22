'use client';

import * as React from 'react';
import { Brain, FileText, Code, CheckCircle, Package, RotateCcw } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppConfig } from '@/hooks/useStore';
import { useToast } from '@/components/ui/toast';
import { AGENTS } from '@/lib/constants';
import { AGENT_DISPLAY_NAMES } from '@/lib/agent-prompts';
import type { AgentId } from '@/types';

const AGENT_ICONS: Record<string, React.ReactNode> = {
  brain: <Brain className="w-6 h-6" />,
  'file-text': <FileText className="w-6 h-6" />,
  code: <Code className="w-6 h-6" />,
  'check-circle': <CheckCircle className="w-6 h-6" />,
  package: <Package className="w-6 h-6" />,
};

const AGENT_COLORS: Record<string, string> = {
  planner: '#165DFF',
  document: '#36D399',
  generator: '#FBBD23',
  quality: '#F87272',
  delivery: '#9B59B6',
};

const AGENT_MODELS: Record<AgentId, string[]> = {
  planner: ['gpt'],
  document: ['claude'],
  generator: ['gpt'],
  quality: ['gpt'],
  delivery: ['gpt', 'claude'],
};

export default function AgentManagePage() {
  const { config, updateAgentConfig, resetConfig, isLoaded } = useAppConfig();
  const { addToast } = useToast();
  const [selectedAgent, setSelectedAgent] = React.useState<AgentId>('planner');

  const agent = AGENTS.find(a => a.id === selectedAgent)!;
  const display = AGENT_DISPLAY_NAMES[selectedAgent];
  const color = AGENT_COLORS[selectedAgent];

  const handleToggle = (id: AgentId, enabled: boolean) => {
    updateAgentConfig(id, { enabled });
    addToast('info', `${AGENTS.find(a => a.id === id)?.name}已${enabled ? '开启' : '关闭'}`);
  };

  const handleTimeoutChange = (id: AgentId, timeout: number) => {
    updateAgentConfig(id, { timeout });
  };

  const handleReset = () => {
    resetConfig();
    addToast('info', '已重置为默认配置');
  };

  if (!isLoaded) return null;

  return (
    <div className="h-screen flex flex-col">
      <Navbar
        config={config}
        onConfigChange={() => {}}
        onHasApiKeys={() => {}}
      />

      <div className="flex flex-1 pt-[60px]">
        {/* Agent List */}
        <div className="w-[280px] border-r border-[#E5E6EB] overflow-y-auto p-4 bg-white">
          <h2 className="text-sm font-semibold text-[#1D2129] mb-4 px-2">Agent 列表</h2>
          <div className="space-y-2">
            {AGENTS.map(a => {
              const isSelected = a.id === selectedAgent;
              const agentConfig = config.agentConfigs[a.id as AgentId];
              const isEnabled = agentConfig?.enabled ?? true;

              return (
                <div
                  key={a.id}
                  onClick={() => setSelectedAgent(a.id as AgentId)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-[#165DFF] bg-[#165DFF]/5'
                      : 'border-[#E5E6EB] bg-white hover:border-[#165DFF]/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md" style={{ backgroundColor: AGENT_COLORS[a.id] + '15', color: AGENT_COLORS[a.id] }}>
                      {AGENT_ICONS[a.icon]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1D2129]">{a.name}</p>
                      <p className="text-xs text-[#86909C]">{a.model === 'dual' ? 'GPT+Claude' : a.model === 'claude' ? 'Claude' : 'GPT'}</p>
                    </div>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={v => handleToggle(a.id as AgentId, v)}
                      onClick={e => e.stopPropagation()}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Agent Config */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg" style={{ backgroundColor: color + '15', color }}>
                {AGENT_ICONS[agent.icon]}
              </div>
              <div>
                <h1 className="text-xl font-semibold text-[#1D2129]">{agent.name}</h1>
                <p className="text-sm text-[#86909C]">{display.desc}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded ${
                  (config.agentConfigs[selectedAgent]?.enabled ?? true)
                    ? 'bg-[#36D399]/10 text-[#36D399]'
                    : 'bg-[#86909C]/10 text-[#86909C]'
                }`}>
                  {(config.agentConfigs[selectedAgent]?.enabled ?? true) ? '已开启' : '已关闭'}
                </span>
              </div>
            </div>

            {/* Basic Config */}
            <Card className="mb-4">
              <CardContent className="p-5 space-y-4">
                <h3 className="font-medium text-[#1D2129]">基础配置</h3>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#1D2129]">Agent 开关</p>
                    <p className="text-xs text-[#86909C]">关闭后该Agent将不参与任务流转</p>
                  </div>
                  <Switch
                    checked={config.agentConfigs[selectedAgent]?.enabled ?? true}
                    onCheckedChange={v => handleToggle(selectedAgent, v)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-[#1D2129] mb-2 block">模型选择</label>
                  <Select
                    value={agent.model === 'dual' ? 'dual' : agent.model}
                    onValueChange={() => {
                      // 模型切换可在此扩展
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGENT_MODELS[selectedAgent].includes('gpt') && (
                        <SelectItem value="gpt">GPT-5.4（规划、生成、质检）</SelectItem>
                      )}
                      {AGENT_MODELS[selectedAgent].includes('claude') && (
                        <SelectItem value="claude">Claude 4.6（长文档解析）</SelectItem>
                      )}
                      {agent.model === 'dual' && (
                        <SelectItem value="dual">双模型协同</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-[#1D2129] mb-2 block">
                    超时时间: {config.agentConfigs[selectedAgent]?.timeout ?? agent.timeout}秒
                  </label>
                  <Input
                    type="number"
                    value={config.agentConfigs[selectedAgent]?.timeout ?? agent.timeout}
                    onChange={e => handleTimeoutChange(selectedAgent, Number(e.target.value))}
                    min={10}
                    max={120}
                    className="w-32"
                  />
                  <p className="text-xs text-[#86909C] mt-1">范围: 10-120秒</p>
                </div>
              </CardContent>
            </Card>

            {/* Detail Info */}
            <Card className="mb-4">
              <CardContent className="p-5 space-y-4">
                <h3 className="font-medium text-[#1D2129]">详细信息</h3>

                <div>
                  <p className="text-sm font-medium text-[#1D2129] mb-1">核心职责</p>
                  <p className="text-sm text-[#64748B]">{display.desc}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-[#1D2129] mb-1">适配模型</p>
                  <p className="text-sm text-[#64748B]">
                    {agent.model === 'dual' ? 'GPT-5.4 + Claude 4.6' : agent.model === 'claude' ? 'Claude 4.6' : 'GPT-5.4'}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-[#1D2129] mb-1">与RAG结合</p>
                  <p className="text-sm text-[#64748B]">执行任务时自动检索RAG知识库，匹配项目规范，RAG检索无次数限制</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-[#1D2129] mb-1">输入/输出</p>
                  <p className="text-sm text-[#64748B]">{agent.description}</p>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={handleReset}>
                <RotateCcw className="w-4 h-4" /> 重置默认配置
              </Button>
            </div>

            <p className="text-xs text-center text-[#FF4D4F] mt-6 font-medium">
              所有配置功能免费开放，无需付费
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
