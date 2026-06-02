from __future__ import annotations

import sys
import types
from importlib.util import find_spec
from pathlib import Path

import pytest


sys.path.insert(0, str(Path("apps/api").resolve()))

if find_spec("sqlalchemy") is None:
    fake_sqlalchemy = types.ModuleType("sqlalchemy")
    fake_sqlalchemy_orm = types.ModuleType("sqlalchemy.orm")
    fake_sqlalchemy.create_engine = lambda *args, **kwargs: object()
    fake_sqlalchemy_orm.sessionmaker = lambda **kwargs: object()
    sys.modules["sqlalchemy"] = fake_sqlalchemy
    sys.modules["sqlalchemy.orm"] = fake_sqlalchemy_orm

fake_config = types.ModuleType("app.core.config")
fake_config.settings = types.SimpleNamespace(database_url="postgresql://settings-default/db")
sys.modules["app.core.config"] = fake_config

from app.db import postgres


def test_create_postgres_engine_uses_expected_pooling_options(monkeypatch):
    captured: dict[str, object] = {}
    fake_engine = object()

    def fake_create_engine(database_url: str, **kwargs):
        captured["database_url"] = database_url
        captured["kwargs"] = kwargs
        return fake_engine

    monkeypatch.setattr(postgres, "create_engine", fake_create_engine)

    engine = postgres.create_postgres_engine("postgresql://unit-test/db")

    assert engine is fake_engine
    assert captured["database_url"] == "postgresql://unit-test/db"
    assert captured["kwargs"] == {
        "future": True,
        "pool_size": 8,
        "max_overflow": 2,
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }


def test_get_postgres_session_local_returns_sessionmaker_and_engine(monkeypatch):
    fake_engine = object()
    captured: dict[str, object] = {}
    fake_sessionmaker = object()

    def fake_create_postgres_engine(database_url: str):
        captured["database_url"] = database_url
        return fake_engine

    def fake_sessionmaker_factory(**kwargs):
        captured["sessionmaker_kwargs"] = kwargs
        return fake_sessionmaker

    monkeypatch.setattr(postgres, "create_postgres_engine", fake_create_postgres_engine)
    monkeypatch.setattr(postgres, "sessionmaker", fake_sessionmaker_factory)

    session_local, engine = postgres.get_postgres_session_local("postgresql://unit-test/session")

    assert session_local is fake_sessionmaker
    assert engine is fake_engine
    assert captured["database_url"] == "postgresql://unit-test/session"
    assert captured["sessionmaker_kwargs"] == {
        "bind": fake_engine,
        "autoflush": False,
        "autocommit": False,
        "future": True,
    }


def test_get_postgres_db_yields_session_and_closes_after_use(monkeypatch):
    class FakeDB:
        def __init__(self):
            self.closed = 0

        def close(self):
            self.closed += 1

    fake_db = FakeDB()

    class FakeSessionLocal:
        def __call__(self):
            return fake_db

    monkeypatch.setattr(
        postgres,
        "get_postgres_session_local",
        lambda _database_url: (FakeSessionLocal(), object()),
    )

    db_gen = postgres.get_postgres_db("postgresql://unit-test/dependency")
    yielded_db = next(db_gen)

    assert yielded_db is fake_db
    assert fake_db.closed == 0

    with pytest.raises(StopIteration):
        next(db_gen)

    assert fake_db.closed == 1
