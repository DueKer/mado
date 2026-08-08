# Mado - AI 前端研发 Agent 平台

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js">
  <img src="https://img.shields.io/badge/React-19-blue" alt="React">
  <img src="https://img.shields.io/badge/FastAPI-Python-teal" alt="FastAPI">
  <img src="https://img.shields.io/badge/LangGraph-Agent%20Orchestration-purple" alt="LangGraph">
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

项目采用前后端分离架构：`frontend/`（Next.js UI）+ `backend/`（FastAPI + LangGraph 编排/AI/RAG/数据库），两者独立部署，通过 HTTP + WebSocket 通信。

### 前端（`frontend/`）

| 分类 | 技术 | 说明 |
|------|------|------|
| **框架** | Next.js 16 | App Router，纯前端渲染，不含服务端 API 逻辑 |
| **UI** | React 19 + Tailwind CSS v4 | 现代化响应式界面 |
| **组件库** | Radix UI | 无障碍、可访问的 UI 组件 |
| **代码编辑** | CodeMirror 6 | 语法高亮、代码块渲染 |
| **语言** | TypeScript 5 | 类型安全 |
| **图标** | Lucide React | 现代化图标库 |

### 后端（`backend/`）

| 分类 | 技术 | 说明 |
|------|------|------|
| **框架** | FastAPI | REST API + WebSocket |
| **编排引擎** | LangGraph | 多 Agent 状态图编排、工具审批中断 |
| **AI 调用** | LangChain (langchain-openai / langchain-anthropic) | 统一 OpenAI/Anthropic/Groq/硅基流动接口 |
| **数据库** | SQLAlchemy + SQLite | ORM + 本地文件数据库 |
| **语言** | Python 3.11+ | 类型注解 |

---

## 快速开始

### 环境要求

- Node.js 18+（前端）
- Python 3.11+（后端）
- AI API Key（至少一个）：
  - OpenAI API Key
  - Anthropic API Key
  - Groq API Key（免费）
  - 硅基流动 API Key（免费）

### 1. 启动后端

```bash
cd backend

# 创建虚拟环境并安装依赖
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，至少填入一个 API Key

# 启动 FastAPI 服务（默认 8000 端口）
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

后端启动后会自动初始化 SQLite 数据库（`backend/data/mado.db`）。

### 2. 启动前端

```bash
cd frontend

# 安装依赖
npm install

# 复制环境变量文件
cp .env.example .env.local
```

编辑 `frontend/.env.local`，指向后端地址（默认已配置本地开发地址，无需修改）：

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_WS_BASE_URL=ws://localhost:8000
```

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)

> 前端和后端是两个独立进程，需要分别启动。两者可以部署在不同机器 / 容器上，只要前端的 `NEXT_PUBLIC_API_BASE_URL` / `NEXT_PUBLIC_WS_BASE_URL` 指向正确的后端地址即可。

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
mado/
├── frontend/                      # Next.js 前端（仅 UI，不含服务端逻辑）
│   └── src/
│       ├── app/                   # App Router 页面
│       │   ├── page.tsx           # 首页 - AI 对话与任务执行
│       │   ├── layout.tsx         # 根布局
│       │   ├── agent-manage/      # Agent 管理页面
│       │   ├── rag-knowledge/     # RAG 知识库页面
│       │   ├── history-task/      # 任务历史页面
│       │   └── setting-help/      # 设置与帮助页面
│       │
│       ├── components/            # React 组件
│       │   ├── agents/            # AgentPanel / LogPanel
│       │   ├── editor/            # 代码块渲染、Markdown 渲染
│       │   ├── rag/               # 文件上传
│       │   ├── pipeline/          # Pipeline 可视化编辑器
│       │   ├── tools/             # 工具审批对话框
│       │   └── ui/                # 基础 UI 组件
│       │
│       ├── hooks/                 # React Hooks
│       │   ├── useScheduler.ts    # 任务调度器（管理与后端的 WebSocket 连接）
│       │   └── useStore.ts        # 全局状态（配置/知识库/历史，均通过 REST 调后端）
│       │
│       ├── lib/
│       │   ├── api-config.ts      # 后端 API / WebSocket 地址拼接
│       │   ├── agent-display.ts   # Agent 展示名称（纯 UI 元数据）
│       │   ├── tools/tool-definitions.ts # 工具展示元数据（纯 UI）
│       │   ├── constants.ts / utils.ts
│       │   └── rag/slicing.ts     # 前端本地切片预览（上传前）
│       │
│       └── types/                 # TypeScript 类型定义
│
└── backend/                       # FastAPI 后端（DB / AI 调用 / RAG / Agent 编排）
    ├── main.py                    # FastAPI 入口，注册路由 + CORS + DB 初始化
    ├── requirements.txt
    ├── .env                       # 后端环境变量（API Key、DB 地址等）
    └── app/
        ├── api/routes/
        │   ├── tasks.py, config.py, rag_docs.py  # REST：任务/配置/知识库 CRUD
        │   ├── rag_query.py       # REST：/api/rag/search、/api/rag/ask
        │   └── orchestrator_ws.py # WebSocket：/ws/orchestrator 编排接口
        ├── agents/
        │   ├── state.py           # LangGraph State 定义
        │   ├── graph.py           # StateGraph：planner→document→generator→quality→delivery
        │   ├── prompts.py         # 各 Agent 的系统提示词
        │   ├── context.py         # 上下文压缩
        │   └── tool_loop.py       # 工具调用解析、执行、审批中断（interrupt）
        ├── db/
        │   ├── models.py          # SQLAlchemy 模型
        │   └── session.py         # DB session / 初始化
        ├── rag/
        │   ├── loader.py          # 从 DB 加载知识库文档
        │   └── middleware.py      # BM25 检索 + Agent 感知重排序
        ├── services/
        │   └── providers.py       # 统一 AI Provider 封装（OpenAI/Anthropic/Groq/硅基流动）
        └── plugins/
            └── registry.py        # 插件 Hook 系统
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
