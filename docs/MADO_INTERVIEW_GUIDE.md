# MADO 项目面试说明文档

## 1. 项目一句话介绍

MADO 是一个面向前端研发场景的 AI 多 Agent 协同平台。用户输入自然语言需求后，系统会结合私有 RAG 知识库、可配置 Agent 工作流、流式大模型调用和任务调度能力，自动完成需求拆解、文档理解、代码生成、质量检查和交付物整理。

如果用面试里的话来讲，可以这样表达：

> 我做了一个 AI 前端研发工作台，把一次前端开发任务拆成多个专业 Agent 协作完成。用户只需要输入需求、选择技术栈、上传项目规范文档，系统会自动检索私有知识库，然后由 Planner、Document、Generator、Quality、Delivery 五个 Agent 串联执行，最终输出代码、使用说明、路由说明、部署步骤和质检报告。

## 2. 项目定位与解决的问题

### 2.1 背景问题

普通 ChatGPT 类工具虽然能生成代码，但在真实前端研发场景中会遇到几个问题：

- 需求通常不够结构化，模型容易直接写代码，缺少需求拆解和执行计划。
- 项目规范、历史组件、接口文档不在模型上下文里，生成结果容易和项目风格脱节。
- 一次生成缺少质量检查，容易出现类型错误、边界状态遗漏、交付说明不完整。
- 长任务缺少过程可视化，用户不知道当前执行到哪一步。
- 生成代码无法稳定解析为文件级交付物，复制和查看体验差。
- 多个任务不能并发执行，用户需要等待一个任务结束才能做下一个。

MADO 的核心思路是：把“让 AI 写代码”升级为“让 AI 按研发流程完成任务”。

### 2.2 项目目标

项目目标不是简单做一个聊天框，而是做一个面向前端研发的工作流系统：

- 通过多 Agent 拆分职责，降低单次大模型输出的不确定性。
- 通过 RAG 私有知识库，把项目规范和文档注入 Agent 上下文。
- 通过 Pipeline、日志、状态面板、实时预览，让执行过程可观察。
- 通过代码查看器和交付 JSON 规范，让结果可以文件级查看、复制和复用。
- 通过任务历史、并发任务、配置持久化，让它更接近真实工具产品。

## 3. 功能总览

### 3.1 首页任务执行工作台

首页是项目最核心的工作区，主要功能包括：

- 输入自然语言需求。
- 选择目标技术栈。
- 上传本次任务相关文档。
- 查看 RAG 命中预览。
- 启动多 Agent 协同任务。
- 查看 Agent 执行状态和进度。
- 切换多个并发任务线程。
- 打开右侧固定实时预览栏。
- 查看执行日志弹窗。
- 查看最终交付代码和说明。

#### 技术栈选择

项目支持用户主动选择生成目标：

- 自动判断。
- React + TypeScript。
- Vue 3。
- HTML + CSS + JavaScript。

这点对面试很值得讲，因为它体现了 prompt 设计不是写死 React，而是把技术栈作为任务输入的一部分传给所有 Agent。

相关类型：

```ts
export type TechStack = 'auto' | 'react-ts' | 'vue' | 'html-css-js';

export interface TaskInput {
  requirement: string;
  files?: FileUpload[];
  techStack?: TechStack;
}
```

### 3.2 五 Agent 协同工作流

系统内置五类 Agent：

| Agent | 职责 | 典型输出 |
| --- | --- | --- |
| Planner | 需求理解、任务拆解、执行计划 | summary、tasks、notes |
| Document | 解析上传文档和 RAG 规范 | 文档摘要、关键约束 |
| Generator | 按技术栈生成代码 | React/Vue/HTML 等代码 |
| Quality | 质量检查、风险识别 | 类型、安全、响应式、可访问性检查 |
| Delivery | 整理交付物 | code、instructions、routes、deployment、qualityReport |

执行链路：

```text
用户需求
  -> Planner 需求拆解
  -> Document 文档理解
  -> Generator 代码生成
  -> Quality 质量检查
  -> Delivery 交付整理
  -> 页面展示代码和报告
```

核心调度文件：

- `src/lib/orchestrator.ts`
- `src/hooks/useScheduler.ts`

### 3.3 Pipeline 可配置工作流

项目不是把 Agent 流程完全写死，而是提供了 Pipeline 配置能力：

- 可以配置 Agent 执行顺序。
- 可以启用或禁用某个 Agent。
- 可以配置每一步超时时间。
- 可以配置失败重试次数。
- 首页顶部有 Pipeline 指示器。
- Pipeline 编辑器以弹窗形式配置。

这部分的面试亮点是：项目把“AI 调用”抽象成可编排流程，而不是散落在页面按钮事件里。

相关文件：

- `src/components/pipeline/PipelineEditor.tsx`
- `src/lib/orchestrator.ts`

### 3.4 多任务并发调度

项目支持最多 3 个任务并发运行。

每个任务都有独立的：

- Agent 执行状态。
- 当前 Agent。
- 日志。
- 流式输出 buffer。
- 最终 result。
- 任务状态。

用户可以在首页的“任务线程”区域切换当前查看的线程。

关键设计：

- `tasksById` 保存所有运行时任务。
- `taskOrder` 维护任务展示顺序。
- `activeTaskId` 表示当前查看的任务。
- 页面仍然通过 `state.executions`、`state.streamBuffer` 等读取“当前活动任务视图”。

这样做的好处是：页面代码不用到处传 taskId 去读状态，但底层又能隔离不同任务。

### 3.5 实时预览与日志

项目支持流式输出预览：

- AI 生成时通过 `onChunk` 持续追加文本。
- `appendStream` 写入当前任务的 `streamBuffer`。
- 首页右侧固定抽屉展示实时预览。
- 用户可以关闭预览，只保留浮动按钮。

执行日志：

- 每个 Agent 独立记录日志。
- 日志不再占用首页底部空间，而是放在弹窗里。
- 可以看到 Agent 开始、进度、工具调用、错误、完成等信息。

这个体验点可以在面试里讲成：我把“AI 黑盒等待”改成了“可观察执行过程”。

### 3.6 交付结果查看器

项目不是简单把模型输出原样展示，而是把最终结果解析成文件级结构：

```ts
export interface DeliveryResult {
  code: Record<string, string>;
  instructions: string;
  routes: string;
  deployment: string;
  qualityReport: string;
}
```

前端使用 `DeliveryCodeViewer` 和 `CodeBlock` 展示：

- 多文件标签切换。
- CodeMirror 代码高亮。
- 支持 TS/TSX/JS/JSX/HTML/CSS/JSON/Vue。
- 支持自动换行开关。
- 支持复制代码。
- 处理模型输出中的转义换行，避免代码挤成一行。

相关文件：

- `src/components/editor/CodeBlock.tsx`
- `src/components/editor/DeliveryCodeViewer.tsx`
- `src/lib/orchestrator.ts` 中的 `parseDeliveryResult`

## 4. RAG 私有知识库能力

### 4.1 RAG 的定位

RAG 知识库用于让 Agent 参考项目私有规范、示例代码、接口文档和设计约束。

它解决的问题是：大模型不知道当前项目的真实规范，容易生成通用但不贴合项目的代码。

### 4.2 知识库页面功能

RAG 页面支持：

- 上传文档。
- 手动添加规范。
- 查看文档内容。
- 编辑文档。
- 删除文档。
- 下载文档。
- 自动切片。
- 检索测试。
- AI 问知识库。
- 检索参数调节。
- 多轮知识库问答。

支持文件类型：

- txt
- md
- ts
- tsx
- js
- jsx
- vue
- html
- css
- less
- scss
- json

### 4.3 文档切片

切片逻辑抽到了公共模块：

- `src/lib/rag/slicing.ts`

切片规则不是简单固定长度截断，而是结合自然结构：

- Markdown 标题。
- 代码块。
- import/export。
- interface/type。
- 内容长度。

每个切片包含：

```ts
export interface RagSlice {
  id: string;
  docId: string;
  content: string;
  keywords: string[];
  index: number;
}
```

编辑文档时会重新生成切片，并同步更新数据库里的 `document_chunks` 表。

### 4.4 检索算法

当前 RAG 检索实现是本地关键词/BM25 风格检索，不依赖向量数据库。

核心能力：

- Query 扩展。
- BM25 评分。
- Agent 感知重排。
- Token 预算控制。
- topK 限制。
- matchedKeywords 展示。

相关文件：

- `src/lib/rag/rag-middleware.ts`

#### Query 扩展示例

例如用户输入“组件”，系统会扩展：

- component
- 组件
- 部件

用户输入“接口”，会扩展：

- API
- api
- rest
- endpoint

#### Agent 感知重排

不同 Agent 对知识库的关注点不同：

- Planner 偏需求、任务、规划。
- Document 偏接口、文档、规范。
- Generator 偏代码、组件、实现。
- Quality 偏错误、类型、测试、风险。
- Delivery 偏部署、安装、说明。

所以同样的查询，不同 Agent 会对命中切片进行不同权重排序。

### 4.5 后端 RAG API

项目补了后端 RAG 接口，不再只靠前端内存模拟。

#### `/api/rag/search`

作用：

- 从数据库读取知识库文档。
- 执行 RAG 检索。
- 返回命中切片、分数、token 估算、知识库统计。

典型请求：

```json
{
  "query": "React 表单 loading 错误提示 Props 校验",
  "agentId": "generator",
  "topK": 8,
  "maxTokensPerSlice": 800,
  "enableBM25": true,
  "enableAgentAwareness": true
}
```

#### `/api/rag/ask`

作用：

- 从数据库读取知识库。
- 检索命中切片。
- 通过服务端 AI 调用生成回答。
- 要求回答基于来源并使用 `[来源1]` 这种引用。
- 支持传入最近几轮问答历史。

返回：

```json
{
  "answer": "...",
  "sources": [...],
  "totalTokens": 1234,
  "summary": "检索到 8 个相关切片..."
}
```

### 4.6 RAG 与多 Agent 的结合

在 `executeAgent` 中，每个 Agent 执行前都会：

1. 根据用户需求和当前 Agent 调用 `buildContextWindow`。
2. 从知识库中找相关切片。
3. 经过插件系统增强 RAG 结果。
4. 把命中内容注入到对应 Agent prompt。

这意味着 RAG 不是一个孤立页面，而是进入了实际代码生成链路。

### 4.7 默认知识库

项目中已经写入了一批默认知识库文档，用于测试和增强 Agent 输出：

- React TypeScript 组件开发规范。
- Vue 3 SFC 开发规范。
- 原生 HTML/CSS/JS 交付规范。
- 多 Agent 交付结果 JSON 规范。
- AI RAG 私有知识库使用规范。
- 表单与交互开发细则。
- 接口请求与错误处理规范。
- 状态管理选择规范。
- 响应式布局与视觉设计规范。
- 可访问性检查规范。
- 质量检查和测试策略规范。
- Next.js 前后端接口协作规范。

## 5. AI 调用与中转代理

### 5.1 前端调用方式

前端不直接访问 OpenAI 或 Claude，而是统一请求项目自己的接口：

- `POST /api/ai/stream`

这样可以：

- 避免浏览器暴露 API Key。
- 规避 CORS 问题。
- 统一处理中转地址。
- 统一处理不同 provider。
- 统一流式读取格式。

前端封装：

- `src/lib/ai-sdk-service.ts`
- `src/lib/ai-stream.ts`

### 5.2 后端 AI Stream API

后端使用 Vercel AI SDK：

- `@ai-sdk/openai`
- `@ai-sdk/anthropic`
- `ai`

支持 provider：

- OpenAI 兼容接口。
- Anthropic Claude。
- Groq。
- SiliconFlow。

支持自定义 OpenAI Base URL，例如：

```env
OPENAI_BASE_URL=https://www.codex2api.com/v1
```

后端优先级：

```text
请求体 baseUrl > 数据库配置 baseUrl > 环境变量 OPENAI_BASE_URL
```

### 5.3 模型选择

项目支持：

- GPT only。
- Claude only。
- 双模型协同。

默认策略：

- Document Agent 更适合文档理解，可走 Claude。
- 其他 Agent 默认走 GPT。
- 如果用户选择 GPT-only，则全部走 GPT。
- 如果用户选择 Claude-only，则全部走 Claude。

### 5.4 流式输出

`callAI` 使用 `/api/ai/stream` 返回的 body，通过 `readAITextStream` 读取分片。

每个 chunk 会触发：

- 追加实时预览。
- 更新 Agent 进度。
- 写入当前任务的 streamBuffer。

## 6. 工具调用系统

项目内置了一个轻量 Tool Calling 机制，不完全依赖模型供应商原生 tool calling。

### 6.1 支持的工具

包括：

- `web_search`：联网搜索。
- `web_fetch`：抓取网页内容。
- `code_interpreter`：执行 JS/TS 片段。
- `json_transform`：JSON 解析、过滤、映射、合并等。
- `format_date`：日期格式化。

### 6.2 工具调用格式

模型可以输出：

```text
__TOOL_CALL__
{"tool":"web_search","params":{"query":"Next.js Route Handler"}}
__END_TOOL_CALL__
```

系统会解析、审批、执行工具，并把结果重新送回模型继续生成。

### 6.3 工具审批

前端有 `ToolApprovalDialog`：

- 用户可以批准单个工具调用。
- 可以拒绝。
- 可以开启自动批准。
- 审批超时会拒绝。

这是一个挺适合面试讲的点：AI 工具调用不能完全放任，尤其是搜索、执行代码这类能力，需要一个用户可控的安全边界。

## 7. 数据持久化设计

### 7.1 技术选型

数据库使用：

- Drizzle ORM。
- libSQL。
- 本地 SQLite 文件。
- 后续可切到 Turso。

相关文件：

- `src/lib/db/schema.ts`
- `src/lib/db/client.ts`
- `src/lib/db/init.ts`

### 7.2 数据表

#### tasks

保存任务历史：

- id
- name
- input
- executions
- status
- result
- createdAt
- updatedAt

#### chat_messages

预留聊天记录：

- taskId
- role
- content
- agentId
- tokens
- createdAt

#### rag_documents

保存 RAG 文档：

- id
- name
- type
- fileSize
- content
- slices
- uploadTime

#### document_chunks

保存 RAG 切片：

- id
- docId
- content
- keywords
- index

#### app_configs

保存应用配置：

- API Key。
- baseUrl。
- GPT 模型。
- Claude 模型。
- modelMode。
- temperature。
- maxTokens。
- Agent 配置。

### 7.3 localStorage 与 DB 双写

项目中很多配置采用前端 localStorage 和后端 DB 双写策略：

- localStorage 提供快速加载和离线兜底。
- DB 提供后端接口读取能力。
- API Key 前端存储时会进行简单编码。
- 后端真正调用模型时优先读取 DB 或环境变量。

这个设计适合本地工具型项目，但如果进入生产环境，API Key 应进一步只保存在服务端。

## 8. 前端架构与 UI 设计

### 8.1 页面结构

主要页面：

- `/` 首页任务执行。
- `/agent-manage` Agent 管理。
- `/rag-knowledge` RAG 知识库。
- `/history-task` 历史任务。
- `/setting-help` 设置帮助。

### 8.2 UI 技术

使用：

- React 19。
- Next.js 16 App Router。
- Tailwind CSS v4。
- Radix UI。
- Lucide React。

UI 风格偏工具台：

- 左侧 Agent 状态面板。
- 顶部导航。
- 中间任务输入和结果区。
- 右侧实时预览抽屉。
- 日志弹窗。
- 代码查看器。

### 8.3 交互体验优化

做过的体验优化包括：

- 执行日志从底部面板改为弹窗，避免占空间。
- 实时预览从底部改为右侧固定抽屉。
- Agent 完成状态实时更新。
- 首页输入区域加宽并靠左。
- 多任务线程卡片切换。
- RAG 命中预览。
- 交付代码用 CodeMirror 高亮，而不是单行文本。

## 9. 关键技术点

### 9.1 多 Agent 编排

核心点：

- 把复杂任务拆成多个专业角色。
- 每个 Agent 有独立 system prompt。
- 每个 Agent 都可以拿到前一个 Agent 的输出。
- 每个 Agent 都可以检索 RAG。
- 每个 Agent 都有进度、日志、错误、输出。
- Pipeline 可以动态调整。

面试可讲：

> 我没有把所有逻辑塞给一个大 prompt，而是按研发流程拆成多个 Agent。这样每个 Agent 的上下文更聚焦，也便于观察和调试。比如 Quality Agent 只关心风险和质量，Delivery Agent 只关心结构化交付。

### 9.2 RAG 检索增强

核心点：

- 文档切片。
- 关键词抽取。
- Query 扩展。
- BM25 评分。
- Agent 权重重排。
- topK 和 token 预算控制。
- 检索结果注入 prompt。
- 后端 RAG search/ask API。

面试可讲：

> 这个项目的 RAG 不是只做一个知识库页面，而是进入了多 Agent 执行链路。每个 Agent 执行前都会根据当前角色和用户需求检索私有知识库，然后把命中的规范注入 prompt。这样 Generator 会参考代码规范，Quality 会参考质检规范，Delivery 会参考交付格式规范。

### 9.3 任务并发调度

核心点：

- reducer 管理任务池。
- 每个任务隔离运行态。
- activeTaskId 映射当前视图。
- 支持最多 3 个并发任务。
- 完成后保持结果，不覆盖其他任务。
- 任务状态同步历史记录。

面试可讲：

> 一开始只有单个任务状态，第二个任务会覆盖第一个。我后来把调度器改成任务池结构，用 tasksById 保存每个任务的 runtime state，再用 activeTaskId 派生页面当前视图。这样页面改动较小，但底层支持并发任务。

### 9.4 流式输出

核心点：

- 后端使用 Vercel AI SDK `streamText`。
- 前端通过 ReadableStream 读取。
- chunk 写入 streamBuffer。
- 实时预览抽屉展示。
- Agent 进度根据输出长度估算。

### 9.5 结果解析与代码展示

核心点：

- Delivery Agent 输出结构化 JSON。
- 后端/前端解析 `code`、`instructions`、`routes`、`deployment`、`qualityReport`。
- 兼容模型输出 code block 的情况。
- 处理转义换行。
- 推断文件后缀。
- CodeMirror 高亮。

### 9.6 后端 API 设计

主要 API：

- `/api/ai/stream`
- `/api/db/config`
- `/api/db/tasks`
- `/api/db/rag`
- `/api/rag/search`
- `/api/rag/ask`

特点：

- AI 代理在服务端执行。
- DB 初始化自动化。
- RAG 检索后端化。
- 配置可从 DB 和环境变量读取。
- OpenAI 兼容中转地址可配置。

## 10. 项目亮点

### 10.1 从聊天工具升级为研发工作流

不是简单问答，而是把前端开发流程产品化：

- 输入需求。
- 规划任务。
- 检索规范。
- 生成代码。
- 检查质量。
- 整理交付。

### 10.2 RAG 与 Agent 深度结合

RAG 不是摆设，而是每个 Agent 执行前都会用。

不同 Agent 使用同一个知识库，但检索和重排会结合角色差异。

### 10.3 技术栈不锁死

支持 React、Vue、原生 HTML/CSS/JS，并且技术栈选择会传入 Agent prompt。

这解决了很多 AI 代码生成工具默认 React 化的问题。

### 10.4 可观察性强

用户能看到：

- 当前 Agent。
- 每个 Agent 状态。
- 任务进度。
- 执行日志。
- 实时预览。
- RAG 命中。
- 最终结果。

### 10.5 结构化交付

最终结果不是一段聊天文本，而是：

- 文件级代码。
- 使用说明。
- 路由说明。
- 部署说明。
- 质检报告。

这更贴近真实交付物。

### 10.6 可扩展架构

项目预留了：

- Pipeline 配置。
- Plugin system。
- Tool system。
- RAG search/ask API。
- 多 provider AI。
- DB schema。

后续可以扩展向量检索、更多 Agent、更多工具、团队协作等。

## 11. 难点与解决方案

### 11.1 AI 输出格式不稳定

问题：

模型可能输出 Markdown、JSON、代码块混合文本，甚至转义换行。

解决：

- 设计 Delivery JSON 规范。
- `parseDeliveryResult` 兼容 JSON 和 code block。
- `normalizeEscapedCode` 修复 `\n` 字面量问题。
- 根据代码内容推断文件后缀。

### 11.2 多任务状态容易互相污染

问题：

单任务状态下，第二个任务会覆盖第一个任务日志和结果。

解决：

- reducer 改为任务池。
- 所有回调带 taskId。
- activeTaskId 决定当前视图。
- 旧任务回调不会写入当前任务。

### 11.3 RAG 文档编辑后检索不一致

问题：

只更新 `rag_documents.slices` 不更新 `document_chunks`，后端检索可能读到旧切片。

解决：

- 编辑文档后重新切片。
- DB PATCH 时删除旧 chunks。
- 重新插入新 chunks。

### 11.4 中转代理配置优先级

问题：

baseUrl 可能来自请求体、DB、环境变量、localStorage，容易混乱。

解决：

后端统一优先级：

```text
请求体 baseUrl > 数据库 baseUrl > 环境变量 OPENAI_BASE_URL
```

同时通过 API 配置弹窗和 `.env.local` 支持中转地址。

### 11.5 长上下文与 token 控制

问题：

多 Agent 串联时上下文会越来越长。

解决：

- conversationHistory 估算 token。
- 超出限制时进行上下文压缩。
- RAG 检索控制 topK 和 maxTokensPerSlice。

## 12. 面试讲解版本

### 12.1 30 秒版本

> MADO 是我做的一个 AI 前端研发 Agent 平台。它把一次开发任务拆成 Planner、Document、Generator、Quality、Delivery 五个 Agent，通过 RAG 私有知识库注入项目规范，再用流式 AI 调用生成代码、质检报告和部署说明。项目支持 React、Vue、原生 HTML/CSS/JS，多任务并发、Pipeline 配置、RAG 检索问答、代码高亮查看和任务历史。

### 12.2 1 分钟版本

> 这个项目的核心不是简单聊天，而是把 AI 代码生成做成研发工作流。用户输入需求后，系统先由 Planner 拆解任务，再由 Document 结合上传文档和 RAG 知识库提取约束，然后 Generator 按用户选择的技术栈生成代码，Quality 做类型、安全、响应式、可访问性检查，最后 Delivery 输出结构化交付物。技术上我用了 Next.js 16、React 19、TypeScript、Vercel AI SDK、Drizzle + libSQL、CodeMirror 和 Radix UI。比较有挑战的是多 Agent 编排、流式输出、多任务状态隔离、RAG 检索和交付结果解析。

### 12.3 3 分钟版本

> MADO 是一个面向前端研发的 AI 多 Agent 工作台。我希望解决的问题是：普通大模型可以写代码，但缺少项目上下文、质量检查和交付结构，所以我把任务拆成五个 Agent，模拟一个前端研发小团队。
>
> 用户在首页输入需求，选择 React、Vue、HTML/CSS/JS 或自动判断技术栈，还可以上传项目文档。启动任务后，调度器会按 Pipeline 执行 Planner、Document、Generator、Quality、Delivery。每个 Agent 执行前都会从 RAG 私有知识库检索相关规范，并把命中切片注入 prompt。执行过程中通过 Vercel AI SDK 做流式输出，页面右侧实时预览，左侧显示 Agent 状态，日志放在弹窗里。
>
> RAG 部分我做了文档上传、手动规范、自动切片、BM25 检索、Query 扩展、Agent 感知重排、后端 search/ask API 和 AI 问知识库。这样 RAG 既可以单独问答，也能进入多 Agent 代码生成链路。
>
> 结果交付不是普通文本，而是结构化 JSON，包括 code、instructions、routes、deployment、qualityReport。前端用 CodeMirror 做多文件代码查看，支持 Vue、TSX、HTML、CSS、JSON 等高亮。
>
> 另一个复杂点是并发任务。最早只有一个全局任务状态，多个任务会互相覆盖。后来我把调度器改成任务池，用 tasksById 保存每个任务 runtime state，用 activeTaskId 派生当前视图，实现最多三个任务并发。

## 13. 简历项目描述参考

可以写成：

> MADO - AI 前端研发多 Agent 协同平台  
> 基于 Next.js 16、React 19、TypeScript、Vercel AI SDK、Drizzle ORM 和 libSQL 开发的 AI 前端研发工作台。平台支持用户输入自然语言需求后，由 Planner、Document、Generator、Quality、Delivery 五个 Agent 串联完成需求拆解、文档理解、代码生成、质量检查和交付整理。实现了 RAG 私有知识库、BM25 检索、Agent 感知重排、流式输出、多任务并发调度、Pipeline 配置、工具调用审批、代码高亮查看和任务历史持久化等能力。

简历 bullet 可以写：

- 设计并实现五 Agent 协同编排引擎，支持动态 Pipeline、Agent 超时、失败重试、执行日志和流式进度回调。
- 实现 RAG 私有知识库，支持文档上传、自动切片、BM25 检索、Query 扩展、Agent 感知重排和后端问答 API。
- 基于 Vercel AI SDK 封装 OpenAI/Claude/Groq/SiliconFlow 多 provider 调用，支持 OpenAI 兼容中转代理和流式输出。
- 设计任务池状态模型，支持最多 3 个任务并发运行，并隔离每个任务的日志、流式内容、Agent 状态和交付结果。
- 构建结构化交付解析和 CodeMirror 多文件代码查看器，支持 TSX/Vue/HTML/CSS/JSON 等语法高亮。
- 使用 Drizzle ORM + libSQL 实现任务历史、RAG 文档、切片和应用配置持久化。

## 14. 可扩展方向

### 14.1 向量化 RAG

当前 RAG 是关键词/BM25 检索，下一步可以加入 embedding：

- 文档切片后生成 embedding。
- 存储到向量数据库。
- 查询时先向量召回，再 BM25 混合重排。
- 支持语义相似查询。

可选方案：

- pgvector。
- Turso/libSQL vector。
- Qdrant。
- Milvus。
- Chroma。

### 14.2 更强文档解析

当前主要支持文本和代码文件。可以扩展：

- PDF 解析。
- Word 文档解析。
- Excel 接口表解析。
- Figma 设计稿解析。
- OpenAPI/Swagger 自动生成接口上下文。

### 14.3 真正的 Agent 并行

当前主要是串行 Pipeline。后续可以：

- Planner 拆分多个子任务。
- Generator 并行生成多个模块。
- Quality 并行检查不同文件。
- Delivery 合并结果。

### 14.4 代码落盘与项目修改

当前主要是生成交付物。可以扩展成：

- 读取用户本地项目结构。
- 自动创建或修改文件。
- 生成 diff。
- 用户确认后应用 patch。
- 自动运行 lint/test/build。

### 14.5 更完整的工具系统

可以增加：

- 文件系统工具。
- Git diff 工具。
- npm 安装和脚本执行工具。
- Playwright 页面截图工具。
- API 请求测试工具。
- 单元测试生成工具。

### 14.6 权限与团队协作

可扩展：

- 用户登录。
- 团队知识库。
- 任务共享。
- Agent 配置模板。
- 审批流。
- 操作审计日志。

### 14.7 成本与性能优化

可扩展：

- Token 成本统计。
- 模型调用缓存。
- RAG 命中缓存。
- 长任务断点续跑。
- 后端队列。
- Worker 执行 Agent。

### 14.8 更严格的质量闭环

可以让 Quality Agent 不只给报告，还能：

- 对 Generator 输出提出修改建议。
- 触发二次修复。
- 对修复结果重新评分。
- 直到达到质量阈值再进入 Delivery。

## 15. 项目不足与诚实表达

面试时可以主动讲不足，这反而显得成熟。

当前不足：

- RAG 还不是向量检索，语义召回能力有限。
- AI 工具调用是自定义文本协议，不如原生 tool calling 稳定。
- 并发任务只是前端任务池，没有后端队列和真正任务恢复。
- 暂停/中断对已经发出的模型请求控制有限，可以进一步接 AbortController 到完整链路。
- API Key 存储还可以更安全，生产环境应只保存在服务端。
- 还没有自动把生成代码写入用户项目并运行测试。
- 还没有真实用户权限和团队协作体系。

可以这样讲：

> 这个项目目前更偏本地研发工具和 Demo 产品形态，重点验证多 Agent + RAG + 前端研发工作流。后续如果做生产化，我会优先补向量检索、后端任务队列、权限系统、代码落盘和自动测试闭环。

## 16. 面试可能被问到的问题

### Q1：为什么要拆成多个 Agent，而不是一个 prompt？

因为一个 prompt 同时做需求拆解、代码生成、质量检查和交付整理时，职责太混杂，输出不可控。拆成多个 Agent 后，每一步目标更明确，也更容易观察、重试和调试。

### Q2：RAG 是怎么参与代码生成的？

每个 Agent 执行前会根据用户需求和当前 Agent 类型检索知识库。检索到的切片会进入 Agent prompt。比如 Generator 会看到代码规范，Quality 会看到质检规范，Delivery 会看到交付 JSON 规范。

### Q3：为什么不用向量数据库？

当前项目优先做本地可跑和低成本，所以先用 BM25/关键词检索。它对规范类文档、代码片段、接口字段这种关键词明确的内容效果不错。后续可以加入 embedding 做混合检索。

### Q4：如何保证 AI 输出可以被前端解析？

通过 Delivery Agent 的 JSON 输出规范约束模型，同时前端解析层做兼容处理：优先解析 JSON，失败时解析 Markdown code block，并处理转义换行、文件名推断和默认后缀。

### Q5：多任务并发怎么做？

调度器维护 `tasksById`，每个任务都有独立 runtime state。页面通过 `activeTaskId` 查看某个任务。所有 Agent 回调都带 taskId，避免不同任务互相污染。

### Q6：RAG 问答怎么避免 AI 胡说？

后端 `/api/rag/ask` 会先检索 sources，如果没有命中就直接返回无法回答。命中后 system prompt 要求只基于来源回答，并使用 `[来源1]` 引用。虽然不能 100% 防止模型幻觉，但通过来源约束和空命中拒答降低了风险。

### Q7：项目最难的地方是什么？

可以回答：

- 多 Agent 流程的状态管理和回调隔离。
- 模型输出不稳定导致的交付解析问题。
- RAG 数据在前端、DB、后端 API 之间保持一致。
- 流式输出和并发任务的 UI 体验。

## 17. 技术栈清单

### 前端

- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS v4
- Radix UI
- Lucide React
- CodeMirror 6

### 后端

- Next.js Route Handler
- Vercel AI SDK
- Drizzle ORM
- libSQL / SQLite

### AI 能力

- OpenAI 兼容接口
- Anthropic Claude
- Groq
- SiliconFlow
- 自定义中转代理
- 流式输出
- RAG 检索
- Tool loop

### 工程能力

- ESLint
- TypeScript strict
- App Router
- 本地 SQLite 持久化
- 组件化 UI
- reducer 状态管理
- API 路由分层

## 18. 推荐演示路径

面试演示时可以按这个顺序：

1. 打开首页，输入一个需求。
2. 选择技术栈，比如 Vue 或 HTML/CSS/JS。
3. 展示 RAG 命中预览。
4. 启动多 Agent 协同。
5. 展示左侧 Agent 状态流转。
6. 打开右侧实时预览。
7. 打开执行日志弹窗。
8. 完成后展示交付代码查看器。
9. 切到 RAG 知识库页面，展示检索测试和问知识库。
10. 切到历史任务页面，展示任务持久化。

这条线能完整体现：

- AI 调用。
- 多 Agent。
- RAG。
- 前端 UI。
- 后端 API。
- 数据持久化。
- 工程完整度。

