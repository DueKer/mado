# ============================================================
# MADO Backend - AI Provider 封装
# 统一 OpenAI / Anthropic / Groq / SiliconFlow 调用接口
# 基于 langchain-openai / langchain-anthropic，兼容自定义 base_url
# ============================================================

from __future__ import annotations

from typing import Literal, Optional

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import AppConfigModel

Provider = Literal["openai", "anthropic", "groq", "siliconflow"]

CONFIG_ID = "default"


def read_stored_config(db: Session) -> Optional[AppConfigModel]:
    return db.get(AppConfigModel, CONFIG_ID)


def _normalize_openai_base_url(base_url: Optional[str]) -> Optional[str]:
    if not base_url:
        return None
    trimmed = base_url.strip().rstrip("/")
    if trimmed.endswith("/v1"):
        return trimmed
    # Bare origin (e.g. https://api.openai.com) → append /v1
    from urllib.parse import urlparse

    parsed = urlparse(trimmed)
    if parsed.path in ("", "/"):
        return f"{parsed.scheme}://{parsed.netloc}/v1"
    return trimmed


def _normalize_openai_model_name(model_name: Optional[str]) -> str:
    if not model_name or model_name in ("gpt-4o", "gpt-4o-mini", "gpt-4-turbo"):
        return "gpt-5.4-mini"
    return model_name


def _create_model(
    provider: Provider,
    model_name: Optional[str],
    api_key: Optional[str],
    base_url: Optional[str],
    temperature: float,
    max_tokens: int,
):
    if provider == "openai":
        settings = get_settings()
        return ChatOpenAI(
            api_key=api_key or settings.openai_api_key or None,
            base_url=_normalize_openai_base_url(base_url or settings.openai_base_url),
            model=_normalize_openai_model_name(model_name),
            temperature=temperature,
            max_tokens=max_tokens,
        )
    if provider == "anthropic":
        settings = get_settings()
        return ChatAnthropic(
            api_key=api_key or settings.anthropic_api_key or None,
            model=model_name or "claude-sonnet-4-20250514",
            temperature=temperature,
            max_tokens=max_tokens,
        )
    if provider == "groq":
        settings = get_settings()
        return ChatOpenAI(
            api_key=api_key or settings.groq_api_key or None,
            base_url=base_url or "https://api.groq.com/openai/v1",
            model=model_name or "llama-4-scout-17b-16e-instruct",
            temperature=temperature,
            max_tokens=max_tokens,
        )
    # siliconflow
    settings = get_settings()
    return ChatOpenAI(
        api_key=api_key or settings.siliconflow_api_key or None,
        base_url=base_url or "https://api.siliconflow.cn/v1",
        model=model_name or "Qwen/Qwen2.5-7B-Instruct",
        temperature=temperature,
        max_tokens=max_tokens,
    )


def _to_lc_messages(messages: list[dict]) -> list[BaseMessage]:
    lc_messages: list[BaseMessage] = []
    for m in messages:
        role = m.get("role")
        content = m.get("content", "")
        if role == "system":
            lc_messages.append(SystemMessage(content=content))
        elif role == "assistant":
            lc_messages.append(AIMessage(content=content))
        else:
            lc_messages.append(HumanMessage(content=content))
    return lc_messages


def get_chat_model(
    db: Session,
    provider: Provider = "openai",
    model: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 1600,
):
    """Build a LangChain chat model using DB-stored config with env fallback.

    Raises ValueError if no API key is configured for the provider.
    """
    stored = read_stored_config(db)
    settings = get_settings()

    api_key_map: dict[Provider, str] = {
        "openai": (stored.api_keys_openai if stored else "") or settings.openai_api_key,
        "anthropic": (stored.api_keys_anthropic if stored else "") or settings.anthropic_api_key,
        "groq": (stored.api_keys_groq if stored else "") or settings.groq_api_key,
        "siliconflow": (stored.api_keys_siliconflow if stored else "") or settings.siliconflow_api_key,
    }
    api_key = api_key_map[provider]
    if not api_key:
        raise ValueError(f"{provider} API Key 未配置")

    model_name = model
    if model_name is None:
        model_name = (stored.gpt_model if stored and provider == "openai" else None) or (
            stored.claude_model if stored and provider != "openai" else None
        )
    base_url = None
    if provider == "openai":
        base_url = (stored.base_url if stored else None) or settings.openai_base_url or None

    return _create_model(provider, model_name, api_key, base_url, temperature, max_tokens)


def generate_server_ai_text(
    db: Session,
    messages: list[dict],
    provider: Provider = "openai",
    model: Optional[str] = None,
    temperature: float = 0.1,
    max_tokens: int = 1600,
) -> str:
    """Synchronous text generation, mirrors generateServerAIText in the old TS backend."""
    llm = get_chat_model(db, provider=provider, model=model, temperature=temperature, max_tokens=max_tokens)

    # Merge system messages into one, keep the rest in order (matches TS behavior)
    system_texts = [m["content"] for m in messages if m.get("role") == "system"]
    non_system = [m for m in messages if m.get("role") != "system"]
    lc_messages: list[BaseMessage] = []
    if system_texts:
        lc_messages.append(SystemMessage(content="\n".join(system_texts)))
    lc_messages.extend(_to_lc_messages(non_system))

    result = llm.invoke(lc_messages)
    return str(result.content)
