from __future__ import annotations

import sys
import importlib
from pathlib import Path

import pytest
from sqlalchemy import text as sa_text

from app.db import sqlite as sqlite_mod
from app.db.sqlite import (
    DEFAULT_DB_PATH,
    create_sqlite_engine,
    ensure_db_dir,
    get_backup_path,
    get_sqlite_db,
    get_sqlite_session_local,
)


def test_ensure_db_dir_creates_parent_dirs(tmp_path: Path) -> None:
    nested = str(tmp_path / "a" / "b" / "test.db")
    result = ensure_db_dir(nested)
    assert result == Path(nested)
    assert result.parent.exists()


def test_ensure_db_dir_reuses_existing_dir(tmp_path: Path) -> None:
    d = tmp_path / "sub"
    d.mkdir(parents=True)
    existing = str(d / "existing.db")
    result = ensure_db_dir(existing)
    assert result.parent == d
    assert d.exists()


def test_create_sqlite_engine_url(tmp_path: Path) -> None:
    db_path = str(tmp_path / "engine_test.db")
    engine = create_sqlite_engine(db_path)
    assert str(engine.url).startswith("sqlite:///")
    assert "engine_test.db" in str(engine.url)
    assert engine.dialect.name == "sqlite"
    engine.dispose()


def test_create_sqlite_engine_accepts_check_same_thread(tmp_path: Path) -> None:
    db_path = str(tmp_path / "thread_test.db")
    engine = create_sqlite_engine(db_path, check_same_thread=True)
    assert engine.dialect.name == "sqlite"
    engine.dispose()


def test_create_sqlite_engine_creates_file_on_write(tmp_path: Path) -> None:
    db_path = str(tmp_path / "write_test.db")
    engine = create_sqlite_engine(db_path)
    with engine.begin() as conn:
        conn.execute(sa_text("CREATE TABLE t (x INTEGER)"))
        conn.execute(sa_text("INSERT INTO t VALUES (42)"))
        rows = conn.execute(sa_text("SELECT x FROM t")).fetchall()
    assert rows == [(42,)]
    assert Path(db_path).exists()
    engine.dispose()


def test_get_sqlite_session_local_returns_sessionmaker_and_engine(tmp_path: Path) -> None:
    db_path = str(tmp_path / "session_test.db")
    SessionLocal, engine = get_sqlite_session_local(db_path)
    assert SessionLocal.kw["autoflush"] is False
    assert SessionLocal.kw["autocommit"] is False
    with SessionLocal() as session:
        session.execute(sa_text("SELECT 1"))
    engine.dispose()


def test_get_sqlite_db_yields_session_and_closes(tmp_path: Path) -> None:
    db_path = str(tmp_path / "gen_test.db")
    gen = get_sqlite_db(db_path)
    db = next(gen)
    assert db is not None
    db.execute(sa_text("SELECT 1"))
    with pytest.raises(StopIteration):
        next(gen)
    # After the generator is exhausted, ensure we can close
    gen.close()


def test_get_backup_path_creates_backup_dir_and_returns_path(tmp_path: Path) -> None:
    db_path = str(tmp_path / "market.db")
    backup_dir = str(tmp_path / "backups")
    result = get_backup_path(db_path, backup_dir)
    assert isinstance(result, str)
    assert result.startswith(backup_dir)
    assert "market_" in result
    assert result.endswith(".db")
    assert Path(backup_dir).exists()


def test_get_backup_path_with_explicit_db_name(tmp_path: Path) -> None:
    db_path = str(tmp_path / "custom_name.db")
    backup_dir = str(tmp_path / "my_backups")
    result = get_backup_path(db_path, backup_dir)
    assert "custom_name_" in result
    assert result.endswith(".db")


def test_default_db_path_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JETSCOPE_SQLITE_PATH", "/tmp/custom/path.db")
    monkeypatch.setenv("SAFVSOIL_SQLITE_PATH", "")  # ensure no interference
    importlib.reload(sqlite_mod)
    assert sqlite_mod.DEFAULT_DB_PATH == "/tmp/custom/path.db"


def test_default_db_path_fallback_safvsoil(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("JETSCOPE_SQLITE_PATH", raising=False)
    monkeypatch.setenv("SAFVSOIL_SQLITE_PATH", "/tmp/fallback.db")
    importlib.reload(sqlite_mod)
    assert sqlite_mod.DEFAULT_DB_PATH == "/tmp/fallback.db"
