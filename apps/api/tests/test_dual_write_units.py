from __future__ import annotations

import sys
from pathlib import Path
from types import ModuleType

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


# Keep unit tests offline by stubbing import-time dependencies used by dual_write.
if "sqlalchemy" not in sys.modules:
    sqlalchemy_mod = ModuleType("sqlalchemy")
    sqlalchemy_orm_mod = ModuleType("sqlalchemy.orm")

    class _Session:  # pragma: no cover - type placeholder only
        pass

    sqlalchemy_orm_mod.Session = _Session
    sqlalchemy_mod.orm = sqlalchemy_orm_mod
    sys.modules["sqlalchemy"] = sqlalchemy_mod
    sys.modules["sqlalchemy.orm"] = sqlalchemy_orm_mod

if "app.db.postgres" not in sys.modules:
    postgres_mod = ModuleType("app.db.postgres")
    postgres_mod.get_postgres_db = lambda: iter(())
    sys.modules["app.db.postgres"] = postgres_mod

if "app.db.sqlite" not in sys.modules:
    sqlite_mod = ModuleType("app.db.sqlite")
    sqlite_mod.get_sqlite_db = lambda: iter(())
    sys.modules["app.db.sqlite"] = sqlite_mod


from app.db import dual_write


class FakeSession:
    def __init__(self, name: str):
        self.name = name
        self.closed = 0

    def close(self) -> None:
        self.closed += 1


def test_get_write_dbs_phase1_yields_sqlite_then_postgres(monkeypatch):
    sqlite_session = FakeSession("sqlite")
    postgres_session = FakeSession("postgres")

    monkeypatch.setattr(dual_write, "_DUAL_WRITE_PHASE", "phase1")
    monkeypatch.setattr(dual_write, "get_sqlite_db", lambda: iter([sqlite_session]))
    monkeypatch.setattr(dual_write, "get_postgres_db", lambda: iter([postgres_session]))

    sessions = list(dual_write.get_write_dbs())

    assert sessions == [sqlite_session, postgres_session]


def test_get_write_dbs_phase3_yields_only_postgres(monkeypatch):
    sqlite_session = FakeSession("sqlite")
    postgres_session = FakeSession("postgres")

    monkeypatch.setattr(dual_write, "_DUAL_WRITE_PHASE", "phase3")
    monkeypatch.setattr(dual_write, "get_sqlite_db", lambda: iter([sqlite_session]))
    monkeypatch.setattr(dual_write, "get_postgres_db", lambda: iter([postgres_session]))

    sessions = list(dual_write.get_write_dbs())

    assert sessions == [postgres_session]


def test_dual_write_context_closes_all_sessions_on_error(monkeypatch):
    first = FakeSession("first")
    second = FakeSession("second")

    monkeypatch.setattr(dual_write, "get_write_dbs", lambda: iter([first, second]))

    with pytest.raises(RuntimeError):
        with dual_write.dual_write_context() as sessions:
            assert sessions == [first, second]
            raise RuntimeError("boom")

    assert first.closed == 1
    assert second.closed == 1


def test_get_read_db_uses_probability_for_phase2(monkeypatch):
    sqlite_session = FakeSession("sqlite")
    postgres_session = FakeSession("postgres")

    monkeypatch.setattr(dual_write, "_DUAL_WRITE_PHASE", "phase2")
    monkeypatch.setattr(dual_write, "_READ_POSTGRES_PCT", 10)
    monkeypatch.setattr(dual_write, "get_sqlite_db", lambda: iter([sqlite_session]))
    monkeypatch.setattr(dual_write, "get_postgres_db", lambda: iter([postgres_session]))

    monkeypatch.setattr(dual_write.random, "randint", lambda _a, _b: 5)
    assert list(dual_write.get_read_db()) == [postgres_session]

    monkeypatch.setattr(dual_write.random, "randint", lambda _a, _b: 50)
    assert list(dual_write.get_read_db()) == [sqlite_session]


def test_phase3_forces_postgres_and_status_reports_primary(monkeypatch):
    sqlite_session = FakeSession("sqlite")
    postgres_session = FakeSession("postgres")

    monkeypatch.setattr(dual_write, "_DUAL_WRITE_PHASE", "phase3")
    monkeypatch.setattr(dual_write, "_READ_POSTGRES_PCT", 0)
    monkeypatch.setattr(dual_write, "get_sqlite_db", lambda: iter([sqlite_session]))
    monkeypatch.setattr(dual_write, "get_postgres_db", lambda: iter([postgres_session]))
    monkeypatch.setattr(dual_write.random, "randint", lambda _a, _b: 100)

    assert list(dual_write.get_read_db()) == [postgres_session]
    assert dual_write.is_postgres_primary() is True
    assert dual_write.migration_status() == {
        "phase": "phase3",
        "read_postgres_pct": 0,
        "postgres_primary": True,
        "write_targets": ["postgres"],
    }
