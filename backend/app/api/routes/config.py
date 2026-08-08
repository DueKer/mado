# ============================================================
# MADO Backend - /api/db/config  (GET / PATCH)
# ============================================================

from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import AppConfigModel
from app.db.session import get_db, init_db
from app.schemas import AppConfigOut, AppConfigPatch, ApiKeys, PerAgentConfig

router = APIRouter()

CONFIG_ID = "default"

DEFAULT_AGENT_CONFIGS: dict[str, dict] = {
    "planner":  {"enabled": True, "timeout": 30},
    "document": {"enabled": True, "timeout": 60},
    "generator": {"enabled": True, "timeout": 60},
    "quality":  {"enabled": True, "timeout": 30},
    "delivery": {"enabled": True, "timeout": 30},
}


def _parse_agent_configs(raw: str) -> dict[str, PerAgentConfig]:
    try:
        parsed = json.loads(raw) if raw else {}
    except Exception:
        parsed = {}
    merged = {**DEFAULT_AGENT_CONFIGS, **parsed}
    return {k: PerAgentConfig(**v) if isinstance(v, dict) else v for k, v in merged.items()}


def _row_to_out(row: AppConfigModel) -> AppConfigOut:
    settings = get_settings()
    return AppConfigOut(
        apiKeys=ApiKeys(
            openai=row.api_keys_openai or settings.openai_api_key,
            anthropic=row.api_keys_anthropic or settings.anthropic_api_key,
            groq=row.api_keys_groq or settings.groq_api_key,
            siliconflow=row.api_keys_siliconflow or settings.siliconflow_api_key,
        ),
        baseUrl=row.base_url or None,
        gptModel=row.gpt_model or None,
        claudeModel=row.claude_model or None,
        modelMode=row.model_mode,  # type: ignore[arg-type]
        temperature=row.temperature / 10.0,  # int(x*10) → float
        maxTokens=row.max_tokens,
        timeout=row.timeout,
        agentConfigs=_parse_agent_configs(row.agent_configs),
    )


def _get_or_create_default(db: Session) -> AppConfigModel:
    row = db.get(AppConfigModel, CONFIG_ID)
    if row is None:
        row = AppConfigModel(
            id=CONFIG_ID,
            api_keys_openai="",
            api_keys_anthropic="",
            api_keys_groq="",
            api_keys_siliconflow="",
            model_mode="dual",
            temperature=1,
            max_tokens=4096,
            timeout=30,
            agent_configs=json.dumps(DEFAULT_AGENT_CONFIGS),
            updated_at=int(time.time() * 1000),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("")
def get_config(db: Session = Depends(get_db)) -> AppConfigOut:
    init_db()
    row = _get_or_create_default(db)
    return _row_to_out(row)


@router.patch("")
def patch_config(body: AppConfigPatch, db: Session = Depends(get_db)):
    init_db()
    row = _get_or_create_default(db)

    if body.apiKeys is not None:
        if body.apiKeys.openai is not None:
            row.api_keys_openai = body.apiKeys.openai
        if body.apiKeys.anthropic is not None:
            row.api_keys_anthropic = body.apiKeys.anthropic
        if body.apiKeys.groq is not None:
            row.api_keys_groq = body.apiKeys.groq
        if body.apiKeys.siliconflow is not None:
            row.api_keys_siliconflow = body.apiKeys.siliconflow
    if body.baseUrl is not None:
        row.base_url = body.baseUrl or None
    if body.gptModel is not None:
        row.gpt_model = body.gptModel or None
    if body.claudeModel is not None:
        row.claude_model = body.claudeModel or None
    if body.modelMode is not None:
        row.model_mode = body.modelMode
    if body.temperature is not None:
        row.temperature = round(body.temperature * 10)
    if body.maxTokens is not None:
        row.max_tokens = body.maxTokens
    if body.timeout is not None:
        row.timeout = body.timeout
    if body.agentConfigs is not None:
        row.agent_configs = json.dumps(
            {k: v.model_dump() if hasattr(v, "model_dump") else v
             for k, v in body.agentConfigs.items()}
        )
    row.updated_at = int(time.time() * 1000)
    db.commit()
    return {"ok": True}
