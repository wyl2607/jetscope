"""Focused unit tests for app.db.session."""

from __future__ import annotations

import importlib
import sys
from types import ModuleType

import pytest


@pytest.fixture
def session_module(monkeypatch):
    """Import app.db.session with deterministic env for module-level constants."""
    monkeypatch.setenv("READ_POSTGRES_PCT", "0")
    if "app.db.session" in sys.modules:
        del sys.modules["app.db.session"]
    return importlib.import_module("app.db.session")


def test_get_db_yields_session_and_closes_on_generator_finalize(session_module, monkeypatch):
    class FakeSession:
        def __init__(self):
            self.closed = 0

        def close(self):
            self.closed += 1

    fake_session = FakeSession()

    def fake_session_local():
        return fake_session

    monkeypatch.setattr(session_module, "SessionLocal", fake_session_local)

    gen = session_module.get_db()
    yielded = next(gen)

    assert yielded is fake_session
    assert fake_session.closed == 0

    with pytest.raises(StopIteration):
        next(gen)

    assert fake_session.closed == 1


def test_get_read_db_routes_to_sqlite_path_when_percentage_is_zero(session_module, monkeypatch):
    sqlite_session = object()

    def fake_get_db():
        yield sqlite_session

    monkeypatch.setattr(session_module, "get_db", fake_get_db)
    monkeypatch.setattr(session_module, "_READ_POSTGRES_PCT", 0)
    monkeypatch.setattr(session_module.random, "randint", lambda _a, _b: 50)

    gen = session_module.get_read_db()
    assert next(gen) is sqlite_session
    with pytest.raises(StopIteration):
        next(gen)


def test_get_read_db_routes_to_postgres_path_when_roll_under_cutover(session_module, monkeypatch):
    postgres_session = object()

    fake_postgres_module = ModuleType("app.db.postgres")

    def fake_get_postgres_db():
        yield postgres_session

    fake_postgres_module.get_postgres_db = fake_get_postgres_db
    monkeypatch.setitem(sys.modules, "app.db.postgres", fake_postgres_module)

    monkeypatch.setattr(session_module, "_READ_POSTGRES_PCT", 100)
    monkeypatch.setattr(session_module.random, "randint", lambda _a, _b: 1)

    gen = session_module.get_read_db()
    assert next(gen) is postgres_session
    with pytest.raises(StopIteration):
        next(gen)


def test_get_migration_status_reflects_cutover_setting(session_module, monkeypatch):
    monkeypatch.setattr(session_module, "_READ_POSTGRES_PCT", 37)

    status = session_module.get_migration_status()

    assert status["read_postgres_pct"] == 37
    assert status["sqlite_primary"] is True

    monkeypatch.setattr(session_module, "_READ_POSTGRES_PCT", 100)
    status = session_module.get_migration_status()
    assert status["sqlite_primary"] is False
