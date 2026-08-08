# ============================================================
# MADO Backend - Pydantic Schemas
# 对齐前端 src/types/index.ts 的数据结构
# ============================================================

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

AgentId = Literal["planner", "document", "generator", "quality", "delivery"]
AgentStatus = Literal["idle", "running", "completed", "failed"]
ModelType = Literal["dual", "gpt-only", "claude-only"]
TechStack = Literal["auto", "react-ts", "vue", "html-css-js"]


class PerAgentConfig(BaseModel):
    enabled: bool = True
    timeout: int = 30


class FileUpload(BaseModel):
    id: str
    name: str
    size: int = 0
    type: str = ""
    content: str = ""
    uploadTime: int = 0


class TaskInput(BaseModel):
    requirement: str
    files: Optional[list[FileUpload]] = None
    techStack: Optional[TechStack] = None


class DeliveryResult(BaseModel):
    code: dict[str, str] = Field(default_factory=dict)
    instructions: str = ""
    routes: str = ""
    deployment: str = ""
    qualityReport: str = ""


class AgentExecution(BaseModel):
    agentId: AgentId
    status: AgentStatus = "idle"
    progress: int = 0
    input: Any = None
    output: Any = None
    error: Optional[str] = None
    startTime: Optional[int] = None
    endTime: Optional[int] = None
    logs: list[str] = Field(default_factory=list)


# -------------------- Tasks --------------------


class TaskCreate(BaseModel):
    id: str
    name: str
    input: TaskInput
    executions: Optional[dict[str, Any]] = None
    status: str
    result: Optional[DeliveryResult] = None
    createdAt: int
    updatedAt: Optional[int] = None


class TaskUpdate(BaseModel):
    id: str
    name: Optional[str] = None
    executions: Optional[dict[str, Any]] = None
    status: Optional[str] = None
    result: Optional[DeliveryResult] = None


class TaskOut(BaseModel):
    id: str
    name: str
    input: Any
    executions: Any = None
    status: str
    result: Any = None
    createdAt: int
    updatedAt: int


# -------------------- RAG Documents --------------------


class RagSlice(BaseModel):
    id: str
    docId: str
    content: str
    keywords: list[str] = Field(default_factory=list)
    index: int


class RagDocumentCreate(BaseModel):
    id: str
    name: str
    type: str
    fileSize: Optional[int] = None
    content: str
    slices: list[RagSlice] = Field(default_factory=list)
    uploadTime: Optional[int] = None


class RagDocumentUpdate(BaseModel):
    id: str
    name: Optional[str] = None
    content: Optional[str] = None
    slices: Optional[list[RagSlice]] = None


class RagDocumentOut(BaseModel):
    id: str
    name: str
    type: str
    fileSize: Optional[int] = None
    content: str
    slices: list[Any] = Field(default_factory=list)
    uploadTime: int


class RagQueryResult(BaseModel):
    slice: RagSlice
    doc: RagDocumentOut
    score: float
    matchedKeywords: list[str] = Field(default_factory=list)


# -------------------- App Config --------------------


class ApiKeys(BaseModel):
    openai: str = ""
    anthropic: str = ""
    groq: str = ""
    siliconflow: str = ""


class AppConfigOut(BaseModel):
    apiKeys: ApiKeys
    baseUrl: Optional[str] = None
    gptModel: Optional[str] = None
    claudeModel: Optional[str] = None
    modelMode: ModelType
    temperature: float
    maxTokens: int
    timeout: int
    agentConfigs: dict[str, PerAgentConfig]


class AppConfigPatch(BaseModel):
    apiKeys: Optional[ApiKeys] = None
    baseUrl: Optional[str] = None
    gptModel: Optional[str] = None
    claudeModel: Optional[str] = None
    modelMode: Optional[ModelType] = None
    temperature: Optional[float] = None
    maxTokens: Optional[int] = None
    timeout: Optional[int] = None
    agentConfigs: Optional[dict[str, PerAgentConfig]] = None


# -------------------- RAG Search / Ask --------------------


class RagSearchRequest(BaseModel):
    query: str
    agentId: str = "generator"
    topK: Optional[int] = None
    maxTokensPerSlice: Optional[int] = None
    enableBM25: Optional[bool] = None
    enableAgentAwareness: Optional[bool] = None


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class RagAskRequest(BaseModel):
    question: str
    history: list[ChatMessageIn] = Field(default_factory=list)
    topK: Optional[int] = None
    maxTokensPerSlice: Optional[int] = None
    enableBM25: Optional[bool] = None
    enableAgentAwareness: Optional[bool] = None
