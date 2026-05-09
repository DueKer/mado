# Mado - AI 前端研发 Agent 平台

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js">
  <img src="https://img.shields.io/badge/React-19-blue" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-green" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

**Mado** 是一个 AI 前端研发 Agent 平台，通过多 Agent 协作，让 AI 自动完成前端开发任务。你只需描述需求，平台会自动规划、生成代码、检查质量并输出可直接使用的交付物。

## 一句话介绍

> 让 AI 像虚拟前端团队一样，帮你完成开发任务

---

## 核心功能

### 1. 多 Agent 协作

平台内置 5 个专业 Agent，形成完整的开发流程：

| Agent | 图标 | 职责 | 使用模型 |
|-------|------|------|----------|
| **规划师 (Planner)** | 🧠 | 理解需求，拆解为结构化任务 | GPT |
| **文档师 (Document)** | 📄 | 解析源码、接口文档、开发规范 | Claude |
| **生成师 (Generator)** | 💻 | 按技术栈生成完整可运行的代码 | GPT |
| **质检师 (Quality)** | ✅ | 检查类型、BUG、规范、性能问题 | GPT |
| **交付师 (Delivery)** | 📦 | 整理代码、生成文档、部署说明 | GPT/Claude |

**工作流程：**

```
用户需求
    │
    ▼
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Planner │───►│ Document │───►│Generator │───►│ Quality  │───►│ Delivery │
│  规划师  │    │  文档师  │    │  生成师  │    │  质检师  │    │  交付师  │
└─────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                                    │
                                                                    ▼
                                                           交付产物
                                                           代码 + 说明 + 部署步骤
```

### 2. 支持多种技术栈

| 技术栈 | 说明 | 输出文件 |
|--------|------|----------|
| **自动判断** | 从需求和上传文档自动识别 | .tsx / .vue / .html 等 |
| **React + TypeScript** | React 函数组件 + Hooks | .tsx, .ts |
| **Vue 3** | 单文件组件 (<script setup>) | .vue |
| **HTML + CSS + JS** | 原生代码，无框架依赖 | .html, .css, .js |

### 3. RAG 私有知识库

上传文档或手动添加规范，让 Agent 基于你的项目上下文进行开发：

- **文件上传**：支持 txt/md/ts/tsx/js/jsx/vue/html/css
- **手动规范**：直接输入编码规范、设计规范等
- **自动切片**：文档自动切分，智能检索
- **免费无限**：无文档数量、大小、检索次数限制

### 4. Pipeline 可视化配置

- 查看 Agent 执行流程
- 调整各 Agent 超时时间
- 设置失败重试次数
- 启用/禁用特定 Agent

### 5. 其他功能

- **流式输出**：实时展示 AI 生成内容
- **任务历史**：记录每次任务，可回顾和复盘
- **多任务并行**：支持同时运行多个任务
- **暂停/中断**：可随时暂停或中断任务

---

## 技术栈

| 分类 | 技术 | 说明 |
|------|------|------|
| **框架** | Next.js 16 | App Router 服务端渲染 |
| **UI** | React 19 + Tailwind CSS v4 | 现代化响应式界面 |
| **组件库** | Radix UI | 无障碍、可访问的 UI 组件 |
| **AI 服务** | Vercel AI SDK | 支持 OpenAI GPT、Anthropic Claude |
| **免费模型** | Groq / 硅基流动 | 免费 LLM API（需翻墙） |
| **数据库** | Drizzle ORM + libSQL | SQLite 本地存储，支持 Turso 云数据库 |
| **代码编辑** | CodeMirror 6 | 语法高亮、代码块渲染 |
| **语言** | TypeScript 5 | 类型安全 |
| **图标** | Lucide React | 现代化图标库 |

---

## 快速开始

### 环境要求

- Node.js 18+
- npm / yarn / pnpm
- AI API Key（至少一个）：
  - OpenAI API Key
  - Anthropic API Key
  - Groq API Key（免费）
  - 硅基流动 API Key（免费）

### 安装

```bash
# 克隆项目
git clone https://github.com/DueKer/mado.git
cd mado

# 安装依赖
npm install

# 复制环境变量文件
cp .env.example .env.local
```

### 配置

编辑 `.env.local`：

```env
# 至少配置一个 API Key
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx

# 数据库（可选，默认使用本地 SQLite）
DATABASE_URL=file:./data/mado.db
```

### 运行

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

### 数据库命令

```bash
npm run db:generate  # 生成数据库迁移文件
npm run db:migrate   # 执行数据库迁移
npm run db:push     # 推送 schema 到数据库
npm run db:studio   # 打开 Drizzle Studio 可视化数据库
```

---

## 使用教程

### 1. 配置 API Key

首次使用需要配置 AI API Key：

1. 点击页面顶部的 **设置** 按钮
2. 在弹出对话框中输入 API Key
3. 选择使用的模型（GPT / Claude / 双模型协同）
4. 保存配置

### 2. 输入需求

在首页文本框中描述你想要开发的功能：

**示例需求：**

```
开发一个用户登录页面，包含：
- 用户名和密码输入框
- 记住登录状态复选框
- 登录按钮
- 表单验证（必填、格式校验）
```

### 3. 选择技术栈

根据项目需求选择合适的技术栈：

- `自动判断` - AI 自动从需求中识别技术栈
- `React + TypeScript` - 生成 React 组件
- `Vue` - 生成 Vue 3 单文件组件
- `HTML + CSS + JS` - 生成原生代码

### 4. 使用模板（可选）

平台内置了常用需求模板：

| 模板 | 说明 |
|------|------|
| 组件开发 | 完整的组件开发需求描述 |
| 页面开发 | 页面级功能需求描述 |
| 接口对接 | API 调用模块需求描述 |

点击模板按钮会自动填充需求文本，可以根据实际情况修改。

### 5. 上传文档（可选）

如果有现有项目的文档，可以上传到 RAG 知识库：

1. 点击「上传文档」或「手动添加规范」
2. 上传源码文件、接口文档或编码规范
3. 文档会自动切片加入知识库

Agent 执行时会自动检索相关文档，结合上下文进行开发。

### 6. 启动任务

点击「**启动多Agent协同**」，系统会自动：

1. Planner 分析需求，拆解任务
2. Document 解析上下文（如果有上传文档）
3. Generator 生成代码
4. Quality 检查质量
5. Delivery 整理交付物

### 7. 查看结果

任务完成后，页面会展示：

- **交付代码** - 可预览、可复制单个文件或全部文件
- **使用说明** - 如何使用生成的代码
- **部署步骤** - 如何部署到生产环境
- **质检报告** - 代码质量评估

---

## 项目结构

```
src/
├── app/                          # Next.js App Router 页面
│   ├── page.tsx                  # 首页 - AI 对话与任务执行
│   ├── layout.tsx                # 根布局
│   ├── api/                      # API 路由
│   │   └── ai/                   # AI 流式接口
│   ├── agent-manage/             # Agent 管理页面
│   ├── rag-knowledge/            # RAG 知识库页面
│   ├── history-task/             # 任务历史页面
│   └── setting-help/            # 设置与帮助页面
│
├── components/                    # React 组件
│   ├── agents/                   # Agent 相关
│   │   ├── AgentPanel.tsx       # Agent 状态面板
│   │   └── LogPanel.tsx         # 执行日志面板
│   ├── editor/                  # 代码编辑器
│   │   ├── CodeBlock.tsx        # 代码块渲染
│   │   ├── DeliveryCodeViewer.tsx # 交付代码查看器
│   │   └── MarkdownRenderer.tsx # Markdown 渲染
│   ├── rag/                     # RAG 相关
│   │   └── FileUploader.tsx     # 文件上传
│   ├── pipeline/                # Pipeline 配置
│   │   └── PipelineEditor.tsx   # Pipeline 编辑器
│   ├── tools/                   # 工具系统
│   │   └── ToolApprovalDialog.tsx # 工具审批对话框
│   └── ui/                      # 基础 UI 组件
│       ├── button.tsx, input.tsx, dialog.tsx ...
│
├── hooks/                        # React Hooks
│   ├── useScheduler.ts          # 任务调度器
│   └── useStore.ts              # 状态管理
│
├── lib/                          # 核心库
│   ├── agent-prompts.ts          # Agent 提示词定义
│   ├── orchestrator.ts          # Agent 编排调度引擎
│   ├── ai-sdk-service.ts        # AI SDK 服务封装
│   ├── constants.ts             # 常量配置
│   ├── utils.ts                 # 工具函数
│   ├── tools/                   # 工具系统
│   │   ├── tool-schema.ts       # 工具定义
│   │   ├── builtin-tools.ts     # 内置工具
│   │   └── tool-engine.ts       # 工具执行引擎
│   ├── rag/                     # RAG 系统
│   │   └── rag-middleware.ts    # RAG 中间件
│   ├── memory/                  # 记忆系统
│   │   └── context-compression.ts # 上下文压缩
│   └── plugins/                  # 插件系统
│       └── plugin-system.ts     # 插件注册与钩子
│
└── types/                        # TypeScript 类型定义
    └── index.ts                 # 核心类型
```

---

## 页面说明

| 页面 | 路径 | 说明 |
|------|------|------|
| 首页 | `/` | 输入需求、启动任务、查看结果 |
| Agent 管理 | `/agent-manage` | 配置各 Agent 的开关、超时、模型 |
| RAG 知识库 | `/rag-knowledge` | 上传文档、添加规范、管理知识库 |
| 任务历史 | `/history-task` | 查看过往任务的执行记录 |
| 设置帮助 | `/setting-help` | 全局设置、使用帮助 |

---

## License

MIT
