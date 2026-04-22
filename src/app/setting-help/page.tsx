'use client';

import * as React from 'react';
import {
  Settings, HelpCircle, FileText, MessageSquare, ChevronDown,
  Eye, EyeOff
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppConfig } from '@/hooks/useStore';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'api', label: 'API配置', icon: <Settings className="w-4 h-4" /> },
  { id: 'params', label: '参数配置', icon: <Settings className="w-4 h-4" /> },
  { id: 'tutorial', label: '使用教程', icon: <HelpCircle className="w-4 h-4" /> },
  { id: 'faq', label: '常见问题', icon: <FileText className="w-4 h-4" /> },
  { id: 'feedback', label: '反馈建议', icon: <MessageSquare className="w-4 h-4" /> },
];

const FAQS = [
  {
    q: 'API密钥无效或配置错误',
    a: '请检查API密钥是否正确复制。OpenAI密钥以sk-开头，Claude密钥以sk-ant-开头。确保密钥没有过期或达到额度限制。',
  },
  {
    q: 'Agent执行失败或超时',
    a: '默认超时时间为30秒，可在参数配置中调整。如果频繁超时，可能是网络问题或模型服务繁忙，建议稍后重试。',
  },
  {
    q: '文档上传失败',
    a: '支持txt/md/ts/tsx/js/jsx格式，单个文件不超过100MB。如果文件过大，建议拆分后上传。',
  },
  {
    q: '生成的代码无法运行',
    a: '可能是需求描述不够详细，建议上传相关文档（组件规范、接口文档）帮助Agent理解项目习惯。生成的代码会经过质检Agent检查，但仍需人工审核。',
  },
  {
    q: 'RAG检索结果不准确',
    a: 'MVP版本使用关键词检索，可以手动添加更精确的规范文档。后期版本会升级为语义检索，提升匹配精度。',
  },
  {
    q: '如何获得更好的生成结果',
    a: '1. 需求描述越详细越好；2. 上传项目相关的规范文档；3. 根据场景选择合适的模型；4. 在RAG知识库中添加项目特有的编码规范。',
  },
  {
    q: '模型调用是否收费',
    a: '平台本身免费，但调用GPT和Claude需要消耗你自己的API额度。所有功能无使用次数限制。',
  },
  {
    q: '本地运行报错',
    a: '确保Node版本 >= 18.17，运行npm install安装依赖后，执行npm run dev启动开发服务器。',
  },
];

const TUTORIAL_STEPS = [
  {
    title: '配置API密钥',
    desc: '首次使用需要配置OpenAI和Anthropic的API密钥。点击右上角的齿轮图标，在弹出窗口中输入密钥后保存。密钥仅存储在本地浏览器中，不会上传到任何服务器。',
  },
  {
    title: '输入需求',
    desc: '在首页的文本框中输入你的前端开发需求。需求越详细，生成结果越准确。可以使用需求模板快速填充，也可以上传相关文档辅助理解。',
  },
  {
    title: '上传文档（可选）',
    desc: '如果有组件规范、接口文档、开发规范等文件，可以拖拽上传。文档会被切片存入RAG知识库，Agent执行时会自动检索参考。',
  },
  {
    title: '启动Agent协同',
    desc: '点击"启动多Agent协同"按钮，5个Agent会按顺序执行：需求拆解→文档解析→代码生成→质检→交付。可以在左侧面板实时查看执行状态。',
  },
  {
    title: '查看结果',
    desc: '任务完成后，底部会显示完整的交付结果，包括格式化代码、使用说明、路由说明和部署步骤。代码可以直接复制使用。',
  },
];

export default function SettingHelpPage() {
  const { config, setConfig, resetConfig, isLoaded } = useAppConfig();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = React.useState('api');
  const [openai, setOpenai] = React.useState(config.apiKeys.openai);
  const [anthropic, setAnthropic] = React.useState(config.apiKeys.anthropic);
  const [showOpenAI, setShowOpenAI] = React.useState(false);
  const [showClaude, setShowClaude] = React.useState(false);
  const [temperature, setTemperature] = React.useState(config.temperature);
  const [maxTokens, setMaxTokens] = React.useState(config.maxTokens);
  const [timeout, setTimeout] = React.useState(config.timeout);
  const [expandedFaq, setExpandedFaq] = React.useState<number | null>(null);
  const [feedbackText, setFeedbackText] = React.useState('');

  React.useEffect(() => {
    setOpenai(config.apiKeys.openai);
    setAnthropic(config.apiKeys.anthropic);
    setTemperature(config.temperature);
    setMaxTokens(config.maxTokens);
    setTimeout(config.timeout);
  }, [config]);

  const handleSaveConfig = () => {
    setConfig({
      apiKeys: { openai, anthropic },
      temperature,
      maxTokens,
      timeout,
    });
    addToast('success', '配置保存成功');
  };

  const handleReset = () => {
    resetConfig();
    setOpenai('');
    setAnthropic('');
    setTemperature(0.1);
    setMaxTokens(4096);
    setTimeout(30);
    addToast('info', '已重置为默认配置');
  };

  const handleSubmitFeedback = () => {
    if (!feedbackText.trim()) {
      addToast('warning', '请输入反馈内容');
      return;
    }
    addToast('success', '反馈提交成功，感谢您的建议！');
    setFeedbackText('');
  };

  if (!isLoaded) return null;

  return (
    <div className="h-screen flex flex-col">
      <Navbar config={config} onConfigChange={setConfig} onHasApiKeys={() => {}} />

      <div className="flex flex-1 pt-[60px]">
        {/* Left Tabs */}
        <div className="w-[220px] border-r border-[#E5E6EB] bg-white p-4 overflow-y-auto">
          <h2 className="text-sm font-semibold text-[#1D2129] mb-4 px-2">配置与帮助</h2>
          <nav className="space-y-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  activeTab === tab.id
                    ? 'bg-[#165DFF]/10 text-[#165DFF] font-medium'
                    : 'text-[#64748B] hover:bg-[#F5F7FA] hover:text-[#1D2129]'
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#F5F7FA]">
          <div className="max-w-2xl mx-auto">
            {/* API Config */}
            {activeTab === 'api' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>API 配置</CardTitle>
                    <p className="text-xs text-[#86909C] mt-1">密钥加密存储在本地，仅用于模型调用，不会上传</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
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
                    <div className="flex gap-3 pt-2">
                      <Button onClick={handleSaveConfig}>保存配置</Button>
                      <Button variant="secondary" onClick={handleReset}>重置</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Params Config */}
            {activeTab === 'params' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>参数配置</CardTitle>
                    <p className="text-xs text-[#86909C] mt-1">调整AI模型的行为参数</p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-[#1D2129]">温度</label>
                        <span className="text-sm text-[#165DFF] font-medium">{temperature}</span>
                      </div>
                      <Slider
                        value={[temperature]}
                        min={0.1}
                        max={1}
                        step={0.1}
                        onValueChange={([v]) => setTemperature(v)}
                      />
                      <p className="text-xs text-[#86909C] mt-2">
                        越低输出越严谨（推荐0.1），越高越有创意但可能不稳定
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#1D2129] mb-2 block">上下文长度</label>
                      <Select value={String(maxTokens)} onValueChange={v => setMaxTokens(Number(v))}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2048">2048 Token</SelectItem>
                          <SelectItem value="4096">4096 Token（默认）</SelectItem>
                          <SelectItem value="8192">8192 Token</SelectItem>
                          <SelectItem value="16384">16384 Token</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#1D2129] mb-2 block">Agent 超时时间</label>
                      <div className="flex items-center gap-3">
                        <Input
                          type="number"
                          value={timeout}
                          onChange={e => setTimeout(Number(e.target.value))}
                          min={10}
                          max={120}
                          className="w-32"
                        />
                        <span className="text-sm text-[#86909C]">秒（范围: 10-120）</span>
                      </div>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button onClick={handleSaveConfig}>保存配置</Button>
                      <Button variant="secondary" onClick={handleReset}>重置</Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Tutorial */}
            {activeTab === 'tutorial' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-[#1D2129]">使用教程</h2>
                <p className="text-sm text-[#86909C]">跟随以下步骤，快速上手 MADO 平台</p>
                <div className="space-y-3">
                  {TUTORIAL_STEPS.map((step, i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#165DFF]/10 text-[#165DFF] flex items-center justify-center text-sm font-semibold shrink-0">
                            {i + 1}
                          </div>
                          <div>
                            <h3 className="text-sm font-medium text-[#1D2129]">{step.title}</h3>
                            <p className="text-xs text-[#64748B] mt-1">{step.desc}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* FAQ */}
            {activeTab === 'faq' && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-[#1D2129]">常见问题</h2>
                <div className="space-y-2">
                  {FAQS.map((faq, i) => (
                    <div key={i} className="rounded-lg border border-[#E5E6EB] bg-white overflow-hidden">
                      <button
                        onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-[#F5F7FA] transition-colors"
                      >
                        <span className="text-sm font-medium text-[#1D2129]">{faq.q}</span>
                        <ChevronDown className={cn(
                          'w-4 h-4 text-[#86909C] transition-transform shrink-0 ml-2',
                          expandedFaq === i && 'rotate-180'
                        )} />
                      </button>
                      {expandedFaq === i && (
                        <div className="px-4 pb-4">
                          <p className="text-sm text-[#64748B]">{faq.a}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feedback */}
            {activeTab === 'feedback' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>反馈建议</CardTitle>
                    <p className="text-xs text-[#86909C] mt-1">遇到问题或有改进建议？告诉我们</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      value={feedbackText}
                      onChange={e => setFeedbackText(e.target.value)}
                      placeholder="请输入您的问题或建议..."
                      rows={8}
                      className="w-full"
                    />
                    <Button onClick={handleSubmitFeedback}>提交反馈</Button>
                    <p className="text-xs text-[#86909C]">我们会认真对待每一条反馈，不断优化产品体验</p>
                  </CardContent>
                </Card>
              </div>
            )}

            <p className="text-xs text-center text-[#FF4D4F] mt-6 font-medium">
              所有配置和帮助功能免费使用，无需付费
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
