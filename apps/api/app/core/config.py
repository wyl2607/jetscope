from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    api_prefix: str = "/v1"
    app_env: str = "development"
    database_url: str = "sqlite:///./data/market.db"
    workspace_slug: str = "default"
    admin_token: str = ""
    market_refresh_interval_seconds: int = 600
    market_source_timeout_seconds: float = 12.0
    enable_sqlite_routes: bool = False
    phase0_deprecation_gate: str = "not-ready"
    schema_bootstrap_mode: str = Field(
        default="alembic",
        validation_alias=AliasChoices("JETSCOPE_SCHEMA_BOOTSTRAP_MODE", "SAFVSOIL_SCHEMA_BOOTSTRAP_MODE"),
    )
    anthropic_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("JETSCOPE_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
    )
    newsapi_key: str = Field(
        default="",
        validation_alias=AliasChoices("JETSCOPE_NEWSAPI_KEY", "NEWSAPI_KEY"),
    )
    ai_research_enabled: bool = Field(
        default=False,
        validation_alias=AliasChoices("JETSCOPE_AI_RESEARCH_ENABLED", "AI_RESEARCH_ENABLED"),
    )
    ai_research_daily_token_budget: int = Field(
        default=500000,
        validation_alias=AliasChoices(
            "JETSCOPE_AI_RESEARCH_DAILY_TOKEN_BUDGET",
            "AI_RESEARCH_DAILY_TOKEN_BUDGET",
        ),
    )
    ai_research_mock_mode: bool = Field(
        default=True,
        validation_alias=AliasChoices("JETSCOPE_AI_RESEARCH_MOCK_MODE", "AI_RESEARCH_MOCK_MODE"),
    )
    ai_research_request_timeout_seconds: float = Field(
        default=30.0,
        validation_alias=AliasChoices(
            "JETSCOPE_AI_RESEARCH_REQUEST_TIMEOUT_SECONDS",
            "AI_RESEARCH_REQUEST_TIMEOUT_SECONDS",
        ),
    )
    ai_research_max_retries: int = Field(
        default=3,
        validation_alias=AliasChoices("JETSCOPE_AI_RESEARCH_MAX_RETRIES", "AI_RESEARCH_MAX_RETRIES"),
    )
    json_logs: bool = Field(
        default=False,
        validation_alias=AliasChoices("JETSCOPE_JSON_LOGS", "JSON_LOGS"),
    )
    sentry_dsn: str = Field(
        default="",
        validation_alias=AliasChoices("JETSCOPE_SENTRY_DSN", "SENTRY_DSN"),
    )

    model_config = SettingsConfigDict(env_file=".env", env_prefix="JETSCOPE_")


settings = Settings()
