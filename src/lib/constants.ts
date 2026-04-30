// ============================================================
// MADO 配置
// ============================================================

export const APP_NAME = 'MADO';
export const APP_FULL_NAME = '多智能体协同工作平台';
export const APP_DESC = '让 AI 像虚拟研发团队一样干活';

// -------------------- 颜色主题 --------------------
export const colors = {
  primary: '#165DFF',
  primaryHover: '#1250D6',
  success: '#36D399',
  warning: '#FBBD23',
  error: '#F87272',
  white: '#FFFFFF',
  bgLight: '#F5F7FA',
  border: '#E5E6EB',
  textMuted: '#86909C',
  textDark: '#1D2129',
  freeRed: '#FF4D4F',
} as const;

// -------------------- 布局尺寸 --------------------
export const layout = {
  navHeight: 60,
  leftPanelWidth: 250,
  leftPanelCollapsed: 80,
  rightPanelWidth: 300,
  rightPanelCollapsed: 80,
  bottomPanelHeight: 300,
  bottomPanelCollapsed: 50,
} as const;

// -------------------- 模型选项 --------------------
export const GROQ_MODELS = [
  'llama-4-scout-17b-16e-instruct',
  'llama-4-maverick-17b-128e-instruct',
  'qwen-3.5-32b',
] as const;

export const GPT_PROVIDER_OPTIONS = [
  {
    id: 'openai' as const,
    name: 'OpenAI',
    modelPlaceholder: 'gpt-5.4-mini',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
  },
  {
    id: 'groq' as const,
    name: 'Groq (免费，需翻墙)',
    modelPlaceholder: 'llama-4-scout-17b-16e-instruct',
    baseUrlPlaceholder: 'https://api.groq.com/openai/v1',
  },
  {
    id: 'siliconflow' as const,
    name: '硅基流动 (免费)',
    modelPlaceholder: 'Qwen/Qwen2.5-7B-Instruct',
    baseUrlPlaceholder: 'https://api.siliconflow.cn/v1',
  },
];

// -------------------- Agent 定义 --------------------
export const AGENTS = [
  {
    id: 'planner' as const,
    name: '需求拆解规划',
    shortName: '规划',
    model: 'gpt' as const,
    icon: 'brain',
    description: '接收自然语言需求，拆解为可执行任务，规划执行顺序',
    defaultEnabled: true,
    timeout: 30,
  },
  {
    id: 'document' as const,
    name: '长文档解析',
    shortName: '文档',
    model: 'claude' as const,
    icon: 'file-text',
    description: '读取源码、接口文档、开发规范，提取关键信息',
    defaultEnabled: true,
    timeout: 60,
  },
  {
    id: 'generator' as const,
    name: '前端代码生成',
    shortName: '生成',
    model: 'gpt' as const,
    icon: 'code',
    description: '生成 React/TS/Next 规范代码，确保代码可直接运行',
    defaultEnabled: true,
    timeout: 60,
  },
  {
    id: 'quality' as const,
    name: '代码质检排错',
    shortName: '质检',
    model: 'gpt' as const,
    icon: 'check-circle',
    description: '检查 TS 类型错误、BUG、性能问题、ES 规范',
    defaultEnabled: true,
    timeout: 30,
  },
  {
    id: 'delivery' as const,
    name: '交付整理输出',
    shortName: '交付',
    model: 'dual' as const,
    icon: 'package',
    description: '整理代码、添加注释、生成使用说明、部署步骤',
    defaultEnabled: true,
    timeout: 30,
  },
] as const;

// -------------------- 需求模板 --------------------
export const REQUIREMENT_TEMPLATES = [
  {
    id: 'component',
    name: '组件开发',
    icon: 'component',
    text: `开发一个 React 组件，具体要求如下：
1. 组件名称和功能描述
2. 需要的 Props 接口定义
3. 状态管理方案（useState/useReducer/useRef）
4. 样式方案（Tailwind CSS / CSS Modules）
5. 是否需要响应式适配
6. 交互行为描述（点击、hover 等）
请生成符合以下规范的代码：ES6+ 语法、TypeScript 严格模式、TypeDoc 注释`,
  },
  {
    id: 'page',
    name: '页面开发',
    icon: 'page',
    text: `开发一个 Next.js 页面，具体要求如下：
1. 页面名称和核心功能描述
2. 路由参数设计（动态路由?）
3. 数据获取方案（SSR/CSR/SSG）
4. 页面布局和组件结构
5. API 接口对接需求
6. 状态管理和数据流
7. 错误处理和 loading 状态
请生成符合 Next.js 15 App Router 规范的代码`,
  },
  {
    id: 'api',
    name: '接口对接',
    icon: 'api',
    text: `开发一个接口对接模块，具体要求如下：
1. 接口服务名称和用途
2. 接口地址和请求方法（GET/POST/PUT/DELETE）
3. 请求参数和响应数据结构（TypeScript 接口）
4. 错误处理策略
5. 是否需要 token 鉴权
6. 是否需要请求拦截/响应拦截
请生成符合以下规范的代码：Axios 封装、类型安全、错误处理完善`,
  },
] as const;

// -------------------- 本地存储 Keys --------------------
export const STORAGE_KEYS = {
  config: 'mado_config',
  knowledgeBase: 'mado_knowledge_base',
  history: 'mado_history',
  agentConfigs: 'mado_agent_configs',
} as const;
