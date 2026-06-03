"""Focused unit tests for app.db.bootstrap.

Tests _alembic_config() and apply_schema_bootstrap() in isolation
with mocked external dependencies.
"""

from unittest.mock import MagicMock, patch

import pytest
from alembic.config import Config
from sqlalchemy.engine import Engine

from app.db.bootstrap import _alembic_config, apply_schema_bootstrap
from app.db.base import Base


class TestAlembicConfig:
    """Tests for _alembic_config()."""

    def test_returns_config_with_script_location(self, monkeypatch):
        monkeypatch.setattr("app.db.bootstrap.settings.database_url", "sqlite:///test.db")
        cfg = _alembic_config()
        assert isinstance(cfg, Config)
        assert cfg.get_main_option("sqlalchemy.url") == "sqlite:///test.db"
        assert cfg.get_main_option("script_location").endswith("/migrations")

    def test_database_url_from_settings(self, monkeypatch):
        monkeypatch.setattr("app.db.bootstrap.settings.database_url", "postgresql://u:p@h/db")
        cfg = _alembic_config()
        assert cfg.get_main_option("sqlalchemy.url") == "postgresql://u:p@h/db"


class TestApplySchemaBootstrap:
    """Tests for apply_schema_bootstrap(engine)."""

    def test_create_all_calls_base_create_all(self, monkeypatch):
        engine = MagicMock(spec=Engine)
        monkeypatch.setattr("app.db.bootstrap.settings.schema_bootstrap_mode", "create_all")
        with patch.object(Base.metadata, "create_all") as mock_create_all:
            result = apply_schema_bootstrap(engine)
        assert result == "create_all"
        mock_create_all.assert_called_once_with(bind=engine)

    def test_alembic_calls_command_upgrade(self, monkeypatch):
        engine = MagicMock(spec=Engine)
        monkeypatch.setattr("app.db.bootstrap.settings.schema_bootstrap_mode", "alembic")
        with patch("app.db.bootstrap.command.upgrade") as mock_upgrade:
            with patch("app.db.bootstrap._alembic_config") as mock_config:
                mock_config.return_value = MagicMock(spec=Config)
                result = apply_schema_bootstrap(engine)
        assert result == "alembic"
        mock_upgrade.assert_called_once()
        args, _ = mock_upgrade.call_args
        assert args[1] == "head"

    def test_invalid_mode_raises_runtime_error(self, monkeypatch):
        engine = MagicMock(spec=Engine)
        monkeypatch.setattr("app.db.bootstrap.settings.schema_bootstrap_mode", "unsupported")
        with pytest.raises(RuntimeError, match="Unsupported"):
            apply_schema_bootstrap(engine)

    def test_create_all_engine_passed_to_base(self, monkeypatch):
        engine = MagicMock(spec=Engine)
        monkeypatch.setattr("app.db.bootstrap.settings.schema_bootstrap_mode", "create_all")
        with patch.object(Base.metadata, "create_all") as mock_create_all:
            apply_schema_bootstrap(engine)
        mock_create_all.assert_called_once_with(bind=engine)
