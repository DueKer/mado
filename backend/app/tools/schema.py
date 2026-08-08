# ============================================================
# MADO Backend - Tool Schema
# 移植自 frontend src/lib/tools/tool-schema.ts
# ============================================================

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

ToolParamType = Literal["string", "number", "boolean", "object", "array"]


@dataclass
class ToolParam:
    name: str
    description: str
    type: ToolParamType
    required: bool
    default: Any = None
    enum: Optional[list[str]] = None


@dataclass
class ToolDefinition:
    name: str
    description: str
    category: Literal["search", "compute", "http", "code", "system", "rag"]
    parameters: list[ToolParam] = field(default_factory=list)
    enabled: bool = True


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolResult:
    callId: str
    toolName: str
    success: bool
    content: str
    error: Optional[str] = None
    durationMs: Optional[int] = None


def validate_args(args: dict[str, Any], params: list[ToolParam]) -> tuple[bool, Optional[str]]:
    for p in params:
        if p.required and p.name not in args:
            return False, f"Missing required parameter: {p.name}"
        if p.name in args:
            val = args[p.name]
            if p.type == "string" and not isinstance(val, str):
                return False, f"Parameter {p.name} must be string, got {type(val).__name__}"
            if p.type == "number" and not isinstance(val, (int, float)):
                return False, f"Parameter {p.name} must be number, got {type(val).__name__}"
            if p.type == "boolean" and not isinstance(val, bool):
                return False, f"Parameter {p.name} must be boolean, got {type(val).__name__}"
            if p.enum and str(val) not in p.enum:
                return False, f"Parameter {p.name} must be one of: {', '.join(p.enum)}"
    return True, None


def to_openai_function_schema(tools: list[ToolDefinition]) -> list[dict]:
    schemas = []
    for t in tools:
        properties = {}
        for p in t.parameters:
            prop: dict[str, Any] = {"type": p.type, "description": p.description}
            if p.enum:
                prop["enum"] = p.enum
            if p.default is not None:
                prop["default"] = p.default
            properties[p.name] = prop
        schemas.append(
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": {
                        "type": "object",
                        "properties": properties,
                        "required": [p.name for p in t.parameters if p.required],
                    },
                },
            }
        )
    return schemas

