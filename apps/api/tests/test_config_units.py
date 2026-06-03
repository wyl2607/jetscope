"""Unit tests for app.core.config — Settings model & module-level singleton."""

from app.core.config import Settings, settings


def test_defaults_apply_when_no_env_overrides():
    inst = Settings(_env_file=None)
    assert inst.api_prefix == "/v1"
    assert inst.app_env == "development"
    assert inst.database_url == "sqlite:///./data/market.db"
    assert inst.workspace_slug == "default"
    assert inst.admin_token == ""
    assert inst.market_refresh_interval_seconds == 600
    assert inst.enable_sqlite_routes is False
    assert inst.phase0_deprecation_gate == "not-ready"
    assert inst.schema_bootstrap_mode == "alembic"
    assert inst.anthropic_api_key == ""
    assert inst.newsapi_key == ""
    assert inst.ai_research_enabled is False
    assert inst.ai_research_daily_token_budget == 500000
    assert inst.ai_research_mock_mode is True


def test_jetscope_prefix_env_overrides(monkeypatch):
    monkeypatch.setenv("JETSCOPE_APP_ENV", "staging")
    monkeypatch.setenv("JETSCOPE_DATABASE_URL", "postgresql://host/db")
    monkeypatch.setenv("JETSCOPE_API_PREFIX", "/api/v2")

    inst = Settings(_env_file=None)
    assert inst.app_env == "staging"
    assert inst.database_url == "postgresql://host/db"
    assert inst.api_prefix == "/api/v2"


def test_jetscope_prefix_bool_coercion(monkeypatch):
    monkeypatch.setenv("JETSCOPE_AI_RESEARCH_ENABLED", "true")
    monkeypatch.setenv("JETSCOPE_ENABLE_SQLITE_ROUTES", "1")

    inst = Settings(_env_file=None)
    assert inst.ai_research_enabled is True
    assert inst.enable_sqlite_routes is True


def test_jetscope_prefix_int_coercion(monkeypatch):
    monkeypatch.setenv("JETSCOPE_AI_RESEARCH_DAILY_TOKEN_BUDGET", "777000")
    monkeypatch.setenv("JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS", "300")

    inst = Settings(_env_file=None)
    assert inst.ai_research_daily_token_budget == 777000
    assert inst.market_refresh_interval_seconds == 300


def test_legacy_aliases_fallback(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-legacy")
    monkeypatch.setenv("NEWSAPI_KEY", "news-legacy")
    monkeypatch.setenv("AI_RESEARCH_ENABLED", "true")
    monkeypatch.setenv("AI_RESEARCH_DAILY_TOKEN_BUDGET", "100")

    inst = Settings(_env_file=None)
    assert inst.anthropic_api_key == "sk-ant-legacy"
    assert inst.newsapi_key == "news-legacy"
    assert inst.ai_research_enabled is True
    assert inst.ai_research_daily_token_budget == 100


def test_legacy_alias_schema_bootstrap(monkeypatch):
    monkeypatch.setenv("SAFVSOIL_SCHEMA_BOOTSTRAP_MODE", "manual")

    inst = Settings(_env_file=None)
    assert inst.schema_bootstrap_mode == "manual"


def test_legacy_alias_ai_research_mock_mode(monkeypatch):
    monkeypatch.setenv("AI_RESEARCH_MOCK_MODE", "false")

    inst = Settings(_env_file=None)
    assert inst.ai_research_mock_mode is False


def test_jetscope_prefix_trumps_legacy_alias(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "legacy-key")
    monkeypatch.setenv("JETSCOPE_ANTHROPIC_API_KEY", "jetscope-key")

    inst = Settings(_env_file=None)
    assert inst.anthropic_api_key == "jetscope-key"


def test_module_level_settings_is_instance():
    assert isinstance(settings, Settings)


def test_module_level_settings_has_prefix():
    prefix = settings.model_config.get("env_prefix", "")
    assert prefix == "JETSCOPE_"


def test_trailing_whitespace_stripped(monkeypatch):
    monkeypatch.setenv("JETSCOPE_ADMIN_TOKEN", " my-token ")
    inst = Settings(_env_file=None)
    assert inst.admin_token == " my-token "
