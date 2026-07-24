import sqlite3
from pathlib import Path

import pytest

from app.db import sqlite

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
        "connect_args": {"check_same_thread": True, "timeout": sqlite.SQLITE_BUSY_TIMEOUT_SECONDS},
        "echo": False,
        "future": True,
    }


def test_get_sqlite_session_local_returns_sessionmaker_and_engine(monkeypatch):
    fake_engine = object()
    captured: dict[str, object] = {}

    def fake_sessionmaker(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(sqlite, "create_sqlite_engine", lambda _db_path: fake_engine)
    monkeypatch.setattr(sqlite, "sessionmaker", fake_sessionmaker)

    session_local, returned_engine = sqlite.get_sqlite_session_local("/tmp/unit.db")

    assert returned_engine is fake_engine
    assert session_local is not None
    assert captured["bind"] is fake_engine
    assert captured["autoflush"] is False
    assert captured["autocommit"] is False
    assert captured["future"] is True


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


def test_backup_sqlite_database_copies_schema_and_rows(tmp_path):
    source = tmp_path / "source.db"
    with sqlite3.connect(source) as db:
        db.execute("CREATE TABLE snapshot (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
        db.execute("INSERT INTO snapshot (value) VALUES ('ready')")

    backup = Path(sqlite.backup_sqlite_database(str(source), str(tmp_path / "backups")))

    assert backup.is_file()
    with sqlite3.connect(backup) as db:
        assert db.execute("SELECT value FROM snapshot").fetchone() == ("ready",)


def test_backup_sqlite_database_requires_existing_source(tmp_path):
    with pytest.raises(FileNotFoundError, match="does not exist"):
        sqlite.backup_sqlite_database(str(tmp_path / "missing.db"), str(tmp_path / "backups"))
