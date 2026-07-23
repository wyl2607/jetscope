"""Unit tests for app.db.postgres — focused, deterministic, no network."""

from __future__ import annotations

import importlib
from contextlib import contextmanager
from unittest import mock

import pytest
from sqlalchemy import create_engine as _sa_create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.db import postgres as pg_mod


class TestDefaultUrlResolution:
    """Environment precedence without leaking reloaded module state."""

    @contextmanager
    def _reload_with(self, monkeypatch, *, jetscope=None, safvsoil=None):
        with monkeypatch.context() as patch:
            if jetscope is None:
                patch.delenv("JETSCOPE_POSTGRES_URL", raising=False)
            else:
                patch.setenv("JETSCOPE_POSTGRES_URL", jetscope)
            if safvsoil is None:
                patch.delenv("SAFVSOIL_POSTGRES_URL", raising=False)
            else:
                patch.setenv("SAFVSOIL_POSTGRES_URL", safvsoil)
            yield importlib.reload(pg_mod)

        # Restore the module-level default after the temporary environment exits.
        importlib.reload(pg_mod)

    def test_jetscope_env_takes_priority(self, monkeypatch):
        with self._reload_with(
            monkeypatch,
            jetscope="postgresql://jetscope:pass@primary:5432/jetscopedb",
            safvsoil="postgresql://safvsoil:pass@fallback:5432/safvsoildb",
        ) as mod:
            assert mod.DEFAULT_POSTGRES_URL == "postgresql://jetscope:pass@primary:5432/jetscopedb"

    def test_falls_back_to_safvsoil_env(self, monkeypatch):
        with self._reload_with(
            monkeypatch,
            safvsoil="postgresql://safvsoil:pass@fallback:5432/safvsoildb",
        ) as mod:
            assert mod.DEFAULT_POSTGRES_URL == "postgresql://safvsoil:pass@fallback:5432/safvsoildb"

    def test_falls_back_to_settings_database_url(self, monkeypatch):
        with self._reload_with(monkeypatch) as mod:
            assert mod.DEFAULT_POSTGRES_URL == mod.settings.database_url


def _sqlite_engine(url, **kwargs):
    """Create a real SQLite engine for testing — strips pool params
    that SQLiteDialect rejects."""
    return _sa_create_engine(url)


class TestCreatePostgresEngine:
    def test_returns_engine_with_correct_url(self):
        with mock.patch("app.db.postgres.create_engine") as mock_create:
            engine = mock.MagicMock()
            engine.url = "postgresql://user:pass@host/mydb"
            mock_create.return_value = engine
            result = pg_mod.create_postgres_engine("postgresql://user:pass@host/mydb")
            assert result.url == "postgresql://user:pass@host/mydb"

    def test_passes_production_pool_parameters(self):
        with mock.patch("app.db.postgres.create_engine") as mock_create:
            pg_mod.create_postgres_engine("postgresql://user:pass@host/mydb")
            mock_create.assert_called_once_with(
                "postgresql://user:pass@host/mydb",
                future=True,
                pool_size=8,
                max_overflow=2,
                pool_pre_ping=True,
                pool_recycle=300,
            )

    def test_default_argument_uses_module_level_default(self):
        engine = pg_mod.create_postgres_engine()
        assert str(engine.url) == pg_mod.DEFAULT_POSTGRES_URL


class TestGetPostgresSessionLocal:
    def test_returns_sessionmaker_and_engine(self):
        with mock.patch("app.db.postgres.create_engine") as mock_create:
            mock_engine = mock.MagicMock()
            mock_engine.url = "postgresql://user:pass@host/mydb"
            mock_create.return_value = mock_engine
            sm, engine = pg_mod.get_postgres_session_local(
                "postgresql://user:pass@host/mydb"
            )
            assert isinstance(sm, sessionmaker)
            assert engine.url == "postgresql://user:pass@host/mydb"

    def test_sessionmaker_produces_working_session(self):
        with mock.patch(
            "app.db.postgres.create_engine", side_effect=_sqlite_engine
        ):
            sm, _ = pg_mod.get_postgres_session_local("sqlite:///:memory:")
        with sm() as session:
            assert isinstance(session, Session)
            result = session.execute(text("SELECT 1"))
            assert result.scalar() == 1


class TestGetPostgresDb:
    def test_yields_session_then_stops(self):
        with mock.patch(
            "app.db.postgres.create_engine", side_effect=_sqlite_engine
        ):
            gen = pg_mod.get_postgres_db("sqlite:///:memory:")
            session = next(gen)
            assert isinstance(session, Session)
            with pytest.raises(StopIteration):
                next(gen)

    def test_closes_session_on_generator_close(self):
        with mock.patch(
            "app.db.postgres.create_engine", side_effect=_sqlite_engine
        ):
            gen = pg_mod.get_postgres_db("sqlite:///:memory:")
            session = next(gen)
            with mock.patch.object(session, "close") as mock_close:
                gen.close()
                mock_close.assert_called_once()
