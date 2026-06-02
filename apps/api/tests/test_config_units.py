from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
API_ROOT = REPO_ROOT / "apps" / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.core.config import Settings


@pytest.fixture
def clear_config_env(monkeypatch: pytest.MonkeyPatch) -> None:
    keys = [
        "JETSCOPE_API_PREFIX",
        "JETSCOPE_APP_ENV",
        "JETSCOPE_DATABASE_URL",
        "JETSCOPE_WORKSPACE_SLUG",
        "JETSCOPE_ADMIN_TOKEN",
        "JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS",
        "JETSCOPE_ENABLE_SQLITE_ROUTES",
        "JETSCOPE_PHASE0_DEPRECATION_GATE",
        "JETSCOPE_SCHEMA_BOOTSTRAP_MODE",
        "SAFVSOIL_SCHEMA_BOOTSTRAP_MODE",
        "JETSCOPE_ANTHROPIC_API_KEY",
        "ANTHROPIC_API_KEY",
        "JETSCOPE_NEWSAPI_KEY",
        "NEWSAPI_KEY",
        "JETSCOPE_AI_RESEARCH_ENABLED",
        "AI_RESEARCH_ENABLED",
        "JETSCOPE_AI_RESEARCH_DAILY_TOKEN_BUDGET",
        "AI_RESEARCH_DAILY_TOKEN_BUDGET",
        "JETSCOPE_AI_RESEARCH_MOCK_MODE",
        "AI_RESEARCH_MOCK_MODE",
    ]
    for key in keys:
        monkeypatch.delenv(key, raising=False)


def test_settings_defaults_when_env_missing(clear_config_env: None) -> None:
    settings = Settings(_env_file=None)

    assert settings.api_prefix == "/v1"
    assert settings.database_url == "sqlite:///./data/market.db"
    assert settings.enable_sqlite_routes is False
    assert settings.schema_bootstrap_mode == "alembic"
    assert settings.ai_research_daily_token_budget == 500000
    assert settings.ai_research_mock_mode is True


def test_settings_reads_prefixed_env_vars(clear_config_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JETSCOPE_DATABASE_URL", "sqlite:///./tmp/config_test.db")
    monkeypatch.setenv("JETSCOPE_ENABLE_SQLITE_ROUTES", "true")
    monkeypatch.setenv("JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS", "123")

    settings = Settings(_env_file=None)

    assert settings.database_url == "sqlite:///./tmp/config_test.db"
    assert settings.enable_sqlite_routes is True
    assert settings.market_refresh_interval_seconds == 123


def test_settings_alias_choices_prefer_jetscope_alias(clear_config_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAFVSOIL_SCHEMA_BOOTSTRAP_MODE", "legacy")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "fallback-key")
    monkeypatch.setenv("AI_RESEARCH_ENABLED", "true")

    from_fallback = Settings(_env_file=None)
    assert from_fallback.schema_bootstrap_mode == "legacy"
    assert from_fallback.anthropic_api_key == "fallback-key"
    assert from_fallback.ai_research_enabled is True

    monkeypatch.setenv("JETSCOPE_SCHEMA_BOOTSTRAP_MODE", "alembic")
    monkeypatch.setenv("JETSCOPE_ANTHROPIC_API_KEY", "primary-key")
    monkeypatch.setenv("JETSCOPE_AI_RESEARCH_ENABLED", "false")

    from_primary = Settings(_env_file=None)
    assert from_primary.schema_bootstrap_mode == "alembic"
    assert from_primary.anthropic_api_key == "primary-key"
    assert from_primary.ai_research_enabled is False


def test_module_level_settings_uses_env_at_import_time(
    clear_config_env: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("JETSCOPE_WORKSPACE_SLUG", "module-reload-slug")

    import app.core.config as config_module

    reloaded = importlib.reload(config_module)

    assert reloaded.settings.workspace_slug == "module-reload-slug"
    assert reloaded.settings.api_prefix == "/v1"
