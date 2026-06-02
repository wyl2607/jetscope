from __future__ import annotations

import importlib
import sys
import types
from pathlib import Path


def _load_sqlite_module_with_fakes():
    """Import app.db.sqlite with a lightweight fake sqlalchemy dependency."""
    fake_sqlalchemy = types.ModuleType("sqlalchemy")
    fake_sqlalchemy_orm = types.ModuleType("sqlalchemy.orm")

    def fake_create_engine(url: str, **kwargs):
        return {"url": url, "kwargs": kwargs}

    def fake_sessionmaker(**kwargs):
        class SessionFactory:
            kw = kwargs

            def __call__(self):
                class Session:
                    def close(self):
                        return None

                return Session()

        return SessionFactory()

    fake_sqlalchemy.create_engine = fake_create_engine
    fake_sqlalchemy_orm.sessionmaker = fake_sessionmaker

    sys.modules["sqlalchemy"] = fake_sqlalchemy
    sys.modules["sqlalchemy.orm"] = fake_sqlalchemy_orm

    sys.path.insert(0, str(Path("apps/api").resolve()))
    return importlib.import_module("app.db.sqlite")


sqlite = _load_sqlite_module_with_fakes()


def test_ensure_db_dir_creates_parent_and_returns_db_path(tmp_path):
    db_path = tmp_path / "nested" / "state" / "market.sqlite3"

    assert not db_path.parent.exists()

    returned = sqlite.ensure_db_dir(str(db_path))

    assert db_path.parent.exists()
    assert db_path.parent.is_dir()
    assert returned == db_path


def test_create_sqlite_engine_builds_absolute_url_and_expected_kwargs(monkeypatch, tmp_path):
    db_path = tmp_path / "market.sqlite3"
    captured: dict[str, object] = {}

    def fake_create_engine(url: str, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(sqlite, "create_engine", fake_create_engine)

    engine = sqlite.create_sqlite_engine(str(db_path), check_same_thread=True)

    assert engine is not None
    assert captured["url"] == f"sqlite:///{db_path.absolute()}"
    assert captured["kwargs"] == {
        "connect_args": {"check_same_thread": True},
        "echo": False,
        "future": True,
    }


def test_get_sqlite_session_local_returns_sessionmaker_and_engine(monkeypatch):
    fake_engine = object()

    monkeypatch.setattr(sqlite, "create_sqlite_engine", lambda _db_path: fake_engine)

    session_local, returned_engine = sqlite.get_sqlite_session_local("/tmp/unit.db")

    assert returned_engine is fake_engine
    assert session_local.kw["bind"] is fake_engine
    assert session_local.kw["autoflush"] is False
    assert session_local.kw["autocommit"] is False
    assert session_local.kw["future"] is True


def test_get_sqlite_db_yields_session_and_closes_after_use(monkeypatch):
    class FakeDB:
        def __init__(self):
            self.closed = False

        def close(self):
            self.closed = True

    fake_db = FakeDB()

    class FakeSessionLocal:
        def __call__(self):
            return fake_db

    monkeypatch.setattr(
        sqlite,
        "get_sqlite_session_local",
        lambda _db_path: (FakeSessionLocal(), object()),
    )

    db_gen = sqlite.get_sqlite_db("/tmp/unit.db")
    yielded_db = next(db_gen)

    assert yielded_db is fake_db
    assert fake_db.closed is False

    try:
        next(db_gen)
    except StopIteration:
        pass

    assert fake_db.closed is True


def test_get_backup_path_creates_dir_and_formats_filename(monkeypatch, tmp_path):
    class FrozenDateTime:
        @classmethod
        def now(cls):
            class FixedNow:
                def strftime(self, fmt: str) -> str:
                    assert fmt == "%Y%m%d_%H%M%S"
                    return "20260101_010203"

            return FixedNow()

    monkeypatch.setattr(sqlite, "datetime", FrozenDateTime)

    backup_dir = tmp_path / "backups"
    db_path = tmp_path / "db" / "market.db"

    backup_path = sqlite.get_backup_path(str(db_path), str(backup_dir))

    assert backup_dir.exists()
    assert backup_dir.is_dir()
    assert Path(backup_path) == backup_dir / "market_20260101_010203.db"
