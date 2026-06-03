from __future__ import annotations

import sys
import types
from pathlib import Path
from types import SimpleNamespace

import pytest

# Ensure `app.*` imports resolve when pytest is launched from repo root.
API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


if "alembic" not in sys.modules:
    alembic_module = types.ModuleType("alembic")
    command_module = types.ModuleType("alembic.command")
    config_module = types.ModuleType("alembic.config")

    class _FakeConfig:
        def __init__(self, config_file_name: str):
            self.config_file_name = config_file_name
            self._main_options: dict[str, str] = {}

        def set_main_option(self, key: str, value: str) -> None:
            self._main_options[key] = value

        def get_main_option(self, key: str) -> str:
            return self._main_options.get(key, "")

    command_module.upgrade = lambda *_args, **_kwargs: None
    config_module.Config = _FakeConfig
    alembic_module.command = command_module
    alembic_module.config = config_module
    sys.modules["alembic"] = alembic_module
    sys.modules["alembic.command"] = command_module
    sys.modules["alembic.config"] = config_module


if "sqlalchemy" not in sys.modules:
    sqlalchemy_module = types.ModuleType("sqlalchemy")
    engine_module = types.ModuleType("sqlalchemy.engine")
    orm_module = types.ModuleType("sqlalchemy.orm")

    class _FakeEngine:
        pass

    class _FakeDeclarativeBase:
        metadata = SimpleNamespace(create_all=lambda **_kwargs: None)

    engine_module.Engine = _FakeEngine
    orm_module.DeclarativeBase = _FakeDeclarativeBase
    sqlalchemy_module.engine = engine_module
    sqlalchemy_module.orm = orm_module
    sys.modules["sqlalchemy"] = sqlalchemy_module
    sys.modules["sqlalchemy.engine"] = engine_module
    sys.modules["sqlalchemy.orm"] = orm_module


if "app.core.config" not in sys.modules:
    config_module = types.ModuleType("app.core.config")
    config_module.settings = SimpleNamespace(
        database_url="sqlite:///./data/market.db",
        schema_bootstrap_mode="alembic",
    )
    sys.modules["app.core.config"] = config_module

from app.db import bootstrap


def test_alembic_config_sets_expected_paths_and_database_url(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        bootstrap,
        "settings",
        SimpleNamespace(database_url="sqlite:///./tmp/bootstrap-test.db", schema_bootstrap_mode="alembic"),
    )

    config = bootstrap._alembic_config()

    assert config.config_file_name.endswith("apps/api/alembic.ini")
    assert config.get_main_option("script_location").endswith("apps/api/migrations")
    assert config.get_main_option("sqlalchemy.url") == "sqlite:///./tmp/bootstrap-test.db"


def test_apply_schema_bootstrap_create_all_calls_metadata_create_all(monkeypatch: pytest.MonkeyPatch):
    calls: list[object] = []

    def fake_create_all(*, bind: object) -> None:
        calls.append(bind)

    fake_engine = object()

    monkeypatch.setattr(
        bootstrap,
        "settings",
        SimpleNamespace(database_url="sqlite:///unused.db", schema_bootstrap_mode="  cReAtE_aLl  "),
    )
    monkeypatch.setattr(bootstrap.Base.metadata, "create_all", fake_create_all)

    result = bootstrap.apply_schema_bootstrap(fake_engine)

    assert result == "create_all"
    assert calls == [fake_engine]


def test_apply_schema_bootstrap_creates_sqlite_parent_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    db_path = tmp_path / "nested" / "market.db"
    calls: list[object] = []

    def fake_create_all(*, bind: object) -> None:
        calls.append(bind)

    fake_engine = object()

    monkeypatch.setattr(
        bootstrap,
        "settings",
        SimpleNamespace(database_url=f"sqlite:///{db_path}", schema_bootstrap_mode="create_all"),
    )
    monkeypatch.setattr(bootstrap.Base.metadata, "create_all", fake_create_all)

    result = bootstrap.apply_schema_bootstrap(fake_engine)

    assert result == "create_all"
    assert calls == [fake_engine]
    assert db_path.parent.is_dir()


def test_apply_schema_bootstrap_handles_relative_sqlite_path(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    calls: list[object] = []

    def fake_create_all(*, bind: object) -> None:
        calls.append(bind)

    fake_engine = object()
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(
        bootstrap,
        "settings",
        SimpleNamespace(database_url="sqlite:///./data/market.db", schema_bootstrap_mode="create_all"),
    )
    monkeypatch.setattr(bootstrap.Base.metadata, "create_all", fake_create_all)

    result = bootstrap.apply_schema_bootstrap(fake_engine)

    assert result == "create_all"
    assert calls == [fake_engine]
    assert (tmp_path / "data").is_dir()


def test_apply_schema_bootstrap_alembic_runs_upgrade_head(monkeypatch: pytest.MonkeyPatch):
    upgrade_calls: list[tuple[object, str]] = []
    fake_config = object()

    def fake_upgrade(config: object, revision: str) -> None:
        upgrade_calls.append((config, revision))

    monkeypatch.setattr(
        bootstrap,
        "settings",
        SimpleNamespace(database_url="sqlite:///unused.db", schema_bootstrap_mode=" alembic "),
    )
    monkeypatch.setattr(bootstrap, "_alembic_config", lambda: fake_config)
    monkeypatch.setattr(bootstrap.command, "upgrade", fake_upgrade)

    result = bootstrap.apply_schema_bootstrap(object())

    assert result == "alembic"
    assert upgrade_calls == [(fake_config, "head")]


def test_apply_schema_bootstrap_raises_for_unsupported_mode(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        bootstrap,
        "settings",
        SimpleNamespace(database_url="sqlite:///unused.db", schema_bootstrap_mode="invalid-mode"),
    )

    with pytest.raises(RuntimeError) as exc:
        bootstrap.apply_schema_bootstrap(object())

    assert "Unsupported JETSCOPE_SCHEMA_BOOTSTRAP_MODE" in str(exc.value)
    assert "invalid-mode" in str(exc.value)
