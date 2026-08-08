# ============================================================
# MADO Backend - 应用配置
# 从环境变量读取默认 API Key / DB 地址
# ============================================================

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/mado.db"

    openai_api_key: str = ""
    anthropic_api_key: str = ""
    groq_api_key: str = ""
    siliconflow_api_key: str = ""
    openai_base_url: str = ""

    # CORS：允许前端来源，逗号分隔
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
