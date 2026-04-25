from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    api_prefix: str = "/v1"
    app_env: str = "development"
    database_url: str = "sqlite:///./data/market.db"
    workspace_slug: str = "default"
    admin_token: str = ""
    market_refresh_interval_seconds: int = 600
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

    model_config = SettingsConfigDict(env_file=".env", env_prefix="JETSCOPE_")


settings = Settings()
