from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    api_prefix: str = "/v1"
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/safvsoil"
    workspace_slug: str = "default"
    admin_token: str = "dev-admin-token-change-me"
    market_refresh_interval_seconds: int = 600
    enable_sqlite_routes: bool = False
    phase0_deprecation_gate: str = "not-ready"
    schema_bootstrap_mode: str = "alembic"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="SAFVSOIL_")


settings = Settings()
