"""Unit tests for app.db.session in complete isolation.

Every test pins ``database_url`` to an in-memory SQLite database so no
external infrastructure is required.  ``READ_POSTGRES_PCT`` is set to ``"0"``
by default so ``get_read_db`` deterministically routes to the SQLite path.
"""

from __future__ import annotations

import importlib
from unittest.mock import MagicMock

import pytest
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session

from app.core.config import settings


def _reload_session_module(monkeypatch):
    """Force ``app.db.session`` to re-import with test-safe settings.

    Pins the database to in-memory SQLite and read-cutover to 0 % so every
    test is offline and deterministic.
    """
    monkeypatch.setattr(settings, "database_url", "sqlite://")
    monkeypatch.setenv("READ_POSTGRES_PCT", "0")
    import app.db.session as mod
    importlib.reload(mod)
    return mod


# ---------------------------------------------------------------------------
# get_db
# ---------------------------------------------------------------------------


class TestGetDb:
    def test_yields_a_real_sqlalchemy_session(self, monkeypatch):
        mod = _reload_session_module(monkeypatch)
        gen = mod.get_db()
        db = next(gen)
        try:
            assert isinstance(db, Session)
            result = db.execute(sa_text("SELECT 1"))
            assert result.scalar() == 1
        finally:
            gen.close()

    def test_closes_session_on_generator_exit(self, monkeypatch):
        mod = _reload_session_module(monkeypatch)

        close_called = False
        original_session_local = mod.SessionLocal

        def tracking_session_local(*args, **kwargs):
            nonlocal close_called
            session = original_session_local(*args, **kwargs)
            original_close = session.close

            def tracked_close():
                nonlocal close_called
                close_called = True
                original_close()

            session.close = tracked_close
            return session

        monkeypatch.setattr(mod, "SessionLocal", tracking_session_local)

        gen = mod.get_db()
        db = next(gen)
        assert not close_called
        gen.close()
        assert close_called

    def test_get_db_yields_new_session_each_call(self, monkeypatch):
        mod = _reload_session_module(monkeypatch)
        gen1 = mod.get_db()
        db1 = next(gen1)
        gen2 = mod.get_db()
        db2 = next(gen2)
        try:
            assert db1 is not db2
        finally:
            gen1.close()
            gen2.close()


# ---------------------------------------------------------------------------
# get_read_db
# ---------------------------------------------------------------------------


class TestGetReadDb:
    def test_routes_to_sqlite_when_pct_is_zero(self, monkeypatch):
        mod = _reload_session_module(monkeypatch)
        gen = mod.get_read_db()
        db = next(gen)
        try:
            assert isinstance(db, Session)
            result = db.execute(sa_text("SELECT 1"))
            assert result.scalar() == 1
        finally:
            gen.close()

    def test_routes_to_postgres_when_pct_is_one_hundred(self, monkeypatch):
        monkeypatch.setenv("READ_POSTGRES_PCT", "100")
        monkeypatch.setattr(settings, "database_url", "sqlite://")
        import app.db.session as mod
        importlib.reload(mod)

        fake_db = MagicMock(spec=Session)
        fake_gen = MagicMock()
        fake_gen.__next__ = MagicMock(return_value=fake_db)
        fake_gen.__iter__ = MagicMock(return_value=fake_gen)
        monkeypatch.setattr("app.db.postgres.get_postgres_db", lambda: fake_gen)

        gen = mod.get_read_db()
        db = next(gen)
        assert db is fake_db


# ---------------------------------------------------------------------------
# get_migration_status
# ---------------------------------------------------------------------------


class TestGetMigrationStatus:
    def test_returns_expected_structure(self, monkeypatch):
        mod = _reload_session_module(monkeypatch)
        status = mod.get_migration_status()
        assert isinstance(status, dict)
        assert status == {"read_postgres_pct": 0, "sqlite_primary": True}

    def test_sqlite_primary_false_when_pct_is_one_hundred(self, monkeypatch):
        monkeypatch.setenv("READ_POSTGRES_PCT", "100")
        monkeypatch.setattr(settings, "database_url", "sqlite://")
        import app.db.session as mod
        importlib.reload(mod)
        status = mod.get_migration_status()
        assert status == {"read_postgres_pct": 100, "sqlite_primary": False}
