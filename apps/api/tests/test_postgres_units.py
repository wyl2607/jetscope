"""Unit tests for app.db.postgres — focused, deterministic, no network.

Production is frozen on SQLite; the Postgres helpers must fail loudly unless an
explicit Postgres DSN is configured (no silent SQLite fallback).
"""

from __future__ import annotations

from contextlib import contextmanager
from unittest import mock

import pytest
from sqlalchemy import create_engine as _sa_create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.db import postgres as pg_mod


class TestPostgresUrlResolution:
    @contextmanager
    def _env(self, monkeypatch, *, jetscope=None, safvsoil=None):
        with monkeypatch.context() as patch:
            if jetscope is None:
                patch.delenv("JETSCOPE_POSTGRES_URL", raising=False)
            else:
                patch.setenv("JETSCOPE_POSTGRES_URL", jetscope)
            if safvsoil is None:
                patch.delenv("SAFVSOIL_POSTGRES_URL", raising=False)
            else:
                patch.setenv("SAFVSOIL_POSTGRES_URL", safvsoil)
            yield

    def test_explicit_argument_takes_priority(self):
        assert (
            pg_mod._resolve_postgres_url("postgresql://arg:pass@host:5432/db")
            == "postgresql://arg:pass@host:5432/db"
        )

    def test_jetscope_env_takes_priority(self, monkeypatch):
        with self._env(
            monkeypatch,
            jetscope="postgresql://jetscope:pass@primary:5432/jetscopedb",
            safvsoil="postgresql://safvsoil:pass@fallback:5432/safvsoildb",
        ):
            assert (
                pg_mod._resolve_postgres_url()
                == "postgresql://jetscope:pass@primary:5432/jetscopedb"
            )

    def test_falls_back_to_safvsoil_env(self, monkeypatch):
        with self._env(
            monkeypatch,
            safvsoil="postgresql://safvsoil:pass@fallback:5432/safvsoildb",
        ):
            assert (
                pg_mod._resolve_postgres_url()
                == "postgresql://safvsoil:pass@fallback:5432/safvsoildb"
            )

    def test_raises_when_no_postgres_url_configured(self, monkeypatch):
        with self._env(monkeypatch):
            with pytest.raises(RuntimeError, match="no Postgres URL is configured"):
                pg_mod._resolve_postgres_url()

    def test_refuses_a_sqlite_url(self):
        with pytest.raises(RuntimeError, match="non-Postgres URL"):
            pg_mod._resolve_postgres_url("sqlite:///./data/market.db")


def _sqlite_engine(url, **kwargs):
    """Build an in-memory SQLite engine as a stand-in for a Postgres engine,
    ignoring the (Postgres) URL and the pool params SQLite rejects."""
    return _sa_create_engine("sqlite:///:memory:")


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

    def test_raises_without_an_explicit_or_env_url(self, monkeypatch):
        monkeypatch.delenv("JETSCOPE_POSTGRES_URL", raising=False)
        monkeypatch.delenv("SAFVSOIL_POSTGRES_URL", raising=False)
        with pytest.raises(RuntimeError, match="no Postgres URL is configured"):
            pg_mod.create_postgres_engine()


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
        with mock.patch("app.db.postgres.create_engine", side_effect=_sqlite_engine):
            sm, _ = pg_mod.get_postgres_session_local("postgresql://user:pass@host/db")
        with sm() as session:
            assert isinstance(session, Session)
            result = session.execute(text("SELECT 1"))
            assert result.scalar() == 1


class TestGetPostgresDb:
    def test_yields_session_then_stops(self):
        with mock.patch("app.db.postgres.create_engine", side_effect=_sqlite_engine):
            gen = pg_mod.get_postgres_db("postgresql://user:pass@host/db")
            session = next(gen)
            assert isinstance(session, Session)
            with pytest.raises(StopIteration):
                next(gen)

    def test_closes_session_on_generator_close(self):
        with mock.patch("app.db.postgres.create_engine", side_effect=_sqlite_engine):
            gen = pg_mod.get_postgres_db("postgresql://user:pass@host/db")
            session = next(gen)
            with mock.patch.object(session, "close") as mock_close:
                gen.close()
                mock_close.assert_called_once()
