from datetime import datetime, timezone
import importlib.util
import sys
from types import SimpleNamespace
import types


def _install_import_shims_for_bare_python():
    bare_python = False
    try:
        __import__("pydantic")
    except Exception:
        bare_python = True
        sys.modules.pop("pydantic", None)
        pydantic = types.ModuleType("pydantic")

        class _FieldInfo:
            def __init__(self, default=None, default_factory=None, **_kwargs):
                self.default = default
                self.default_factory = default_factory

        class BaseModel:
            def __init__(self, **kwargs):
                for name, annotation in getattr(self.__class__, "__annotations__", {}).items():
                    if name in kwargs:
                        value = kwargs[name]
                    else:
                        default = getattr(self.__class__, name, None)
                        if isinstance(default, _FieldInfo):
                            value = default.default_factory() if default.default_factory else default.default
                        else:
                            value = default
                    setattr(self, name, value)

        pydantic.AliasChoices = lambda *_args: None
        pydantic.BaseModel = BaseModel
        pydantic.Field = lambda default=None, **kwargs: _FieldInfo(default=default, **kwargs)
        sys.modules["pydantic"] = pydantic

    if importlib.util.find_spec("fastapi") is None:
        bare_python = True
        fastapi = types.ModuleType("fastapi")

        class APIRouter:
            def get(self, *_args, **_kwargs):
                def decorator(func):
                    return func

                return decorator

        fastapi.APIRouter = APIRouter
        fastapi.Depends = lambda dependency=None: dependency
        sys.modules["fastapi"] = fastapi

    if importlib.util.find_spec("sqlalchemy") is None:
        bare_python = True
        sqlalchemy = types.ModuleType("sqlalchemy")
        sqlalchemy.text = lambda sql: sql
        sqlalchemy.create_engine = lambda *_args, **_kwargs: SimpleNamespace()
        sqlalchemy_orm = types.ModuleType("sqlalchemy.orm")
        sqlalchemy_orm.Session = object
        sqlalchemy_orm.sessionmaker = lambda *_args, **_kwargs: lambda: SimpleNamespace(close=lambda: None)
        sqlalchemy.orm = sqlalchemy_orm
        sys.modules["sqlalchemy"] = sqlalchemy
        sys.modules["sqlalchemy.orm"] = sqlalchemy_orm

    try:
        __import__("pydantic_settings")
    except Exception:
        bare_python = True
        sys.modules.pop("pydantic_settings", None)
        pydantic_settings = types.ModuleType("pydantic_settings")

        class BaseSettings:
            def __init__(self):
                for name, value in self.__class__.__dict__.items():
                    if name.startswith("_") or name == "model_config" or callable(value):
                        continue
                    default = getattr(value, "default", value)
                    setattr(self, name, default)

        pydantic_settings.BaseSettings = BaseSettings
        pydantic_settings.SettingsConfigDict = lambda **kwargs: kwargs
        sys.modules["pydantic_settings"] = pydantic_settings

    if bare_python:
        bootstrap = types.ModuleType("app.services.bootstrap")
        bootstrap.utcnow = lambda: datetime.now(timezone.utc)
        market = types.ModuleType("app.services.market")
        market.build_market_snapshot_response = lambda _db: None
        sources = types.ModuleType("app.services.sources")
        sources.build_source_coverage_response = lambda _db: None
        sys.modules["app.services.bootstrap"] = bootstrap
        sys.modules["app.services.market"] = market
        sys.modules["app.services.sources"] = sources


_install_import_shims_for_bare_python()

from app.api.routes import health


class FakeDb:
    def __init__(self):
        self.executed = []

    def execute(self, statement):
        self.executed.append(statement)


def test_get_health_returns_liveness_payload_with_capabilities(monkeypatch):
    fixed_now = datetime(2026, 6, 2, 18, 30, tzinfo=timezone.utc)

    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            assert tz is timezone.utc
            return fixed_now

    monkeypatch.setattr(health, "datetime", FrozenDateTime)

    payload = health.get_health()

    assert payload["ok"] is True
    assert payload["service"] == "api"
    assert payload["time"] == "2026-06-02T18:30:00+00:00"
    assert payload["phase0_deprecation_gate"] == health.settings.phase0_deprecation_gate
    assert payload["phase_b_capabilities"] == {
        "market_snapshot": True,
        "scenario_crud": True,
        "preferences_persistence": True,
        "pathways_admin": True,
        "policies_admin": True,
    }


def test_get_readiness_returns_ready_when_all_checks_pass(monkeypatch):
    fixed_now = datetime(2026, 6, 2, 18, 31, tzinfo=timezone.utc)
    db = FakeDb()

    monkeypatch.setattr(health, "text", lambda sql: f"sql:{sql}")
    monkeypatch.setattr(
        health,
        "build_market_snapshot_response",
        lambda received_db: SimpleNamespace(
            values={"jet_fuel_usd_per_l": 1.24},
            source_status=SimpleNamespace(overall="ok"),
        ),
    )
    monkeypatch.setattr(
        health,
        "build_source_coverage_response",
        lambda received_db: SimpleNamespace(
            completeness=0.875,
            degraded=False,
            metrics=[SimpleNamespace(metric_key="jet_fuel_usd_per_l")],
        ),
    )
    monkeypatch.setattr(health, "utcnow", lambda: fixed_now)
    monkeypatch.setattr(health.settings, "admin_token", "configured-token")
    monkeypatch.setattr(health.settings, "ai_research_enabled", True)
    monkeypatch.setattr(health.settings, "ai_research_mock_mode", False)
    monkeypatch.setattr(health.settings, "anthropic_api_key", "configured-key")

    response = health.get_readiness(db)

    assert db.executed == ["sql:SELECT 1"]
    assert response.ready is True
    assert response.status == "ready"
    assert response.degraded is False
    assert response.generated_at == fixed_now
    assert response.environment == health.settings.app_env
    assert response.api_prefix == health.settings.api_prefix
    assert response.checks["database"].ok is True
    assert response.checks["database"].status == "ok"
    assert response.checks["market_snapshot"].detail == "1 metrics available"
    assert response.checks["source_coverage"].detail == "completeness=0.875; metrics=1"
    assert response.checks["admin_token"].ok is True
    assert response.checks["admin_token"].detail == "protected write routes configured"
    assert response.checks["ai_research_pipeline"].ok is True
    assert response.checks["ai_research_pipeline"].status == "ok"


def test_get_readiness_reports_degraded_when_passing_check_is_degraded(monkeypatch):
    db = FakeDb()

    monkeypatch.setattr(health, "text", lambda sql: sql)
    monkeypatch.setattr(
        health,
        "build_market_snapshot_response",
        lambda received_db: SimpleNamespace(
            values={"jet_fuel_usd_per_l": 1.24},
            source_status=SimpleNamespace(overall="seed"),
        ),
    )
    monkeypatch.setattr(
        health,
        "build_source_coverage_response",
        lambda received_db: SimpleNamespace(
            completeness=0.5,
            degraded=True,
            metrics=[SimpleNamespace(metric_key="jet_fuel_usd_per_l")],
        ),
    )
    monkeypatch.setattr(health.settings, "admin_token", "configured-token")
    monkeypatch.setattr(health.settings, "ai_research_enabled", True)
    monkeypatch.setattr(health.settings, "ai_research_mock_mode", True)

    response = health.get_readiness(db)

    assert response.ready is True
    assert response.status == "degraded"
    assert response.degraded is True
    assert response.checks["market_snapshot"].ok is True
    assert response.checks["market_snapshot"].status == "seed"
    assert response.checks["source_coverage"].ok is True
    assert response.checks["source_coverage"].status == "degraded"
    assert response.checks["admin_token"].status == "ok"
    assert response.checks["ai_research_pipeline"].status == "mock"


def test_get_readiness_blocks_launch_when_admin_or_research_config_missing(monkeypatch):
    db = FakeDb()

    monkeypatch.setattr(health, "text", lambda sql: sql)
    monkeypatch.setattr(
        health,
        "build_market_snapshot_response",
        lambda received_db: SimpleNamespace(
            values={"jet_fuel_usd_per_l": 1.24},
            source_status=SimpleNamespace(overall="ok"),
        ),
    )
    monkeypatch.setattr(
        health,
        "build_source_coverage_response",
        lambda received_db: SimpleNamespace(
            completeness=1.0,
            degraded=False,
            metrics=[SimpleNamespace(metric_key="jet_fuel_usd_per_l")],
        ),
    )
    monkeypatch.setattr(health.settings, "admin_token", "")
    monkeypatch.setattr(health.settings, "ai_research_enabled", False)

    response = health.get_readiness(db)

    assert response.ready is False
    assert response.status == "not_ready"
    assert response.checks["admin_token"].ok is False
    assert response.checks["admin_token"].status == "missing"
    assert "JETSCOPE_ADMIN_TOKEN" in (response.checks["admin_token"].detail or "")
    assert response.checks["ai_research_pipeline"].ok is False
    assert response.checks["ai_research_pipeline"].status == "disabled"
    assert "JETSCOPE_AI_RESEARCH_ENABLED" in (response.checks["ai_research_pipeline"].detail or "")


def test_get_readiness_requires_ai_credentials_when_live_research_enabled(monkeypatch):
    db = FakeDb()

    monkeypatch.setattr(health, "text", lambda sql: sql)
    monkeypatch.setattr(
        health,
        "build_market_snapshot_response",
        lambda received_db: SimpleNamespace(
            values={"jet_fuel_usd_per_l": 1.24},
            source_status=SimpleNamespace(overall="ok"),
        ),
    )
    monkeypatch.setattr(
        health,
        "build_source_coverage_response",
        lambda received_db: SimpleNamespace(
            completeness=1.0,
            degraded=False,
            metrics=[SimpleNamespace(metric_key="jet_fuel_usd_per_l")],
        ),
    )
    monkeypatch.setattr(health.settings, "admin_token", "configured-token")
    monkeypatch.setattr(health.settings, "ai_research_enabled", True)
    monkeypatch.setattr(health.settings, "ai_research_mock_mode", False)
    monkeypatch.setattr(health.settings, "anthropic_api_key", "")

    response = health.get_readiness(db)

    assert response.ready is False
    assert response.checks["admin_token"].ok is True
    assert response.checks["ai_research_pipeline"].ok is False
    assert response.checks["ai_research_pipeline"].status == "missing_credentials"
    assert "JETSCOPE_ANTHROPIC_API_KEY" in (response.checks["ai_research_pipeline"].detail or "")


def test_get_readiness_reports_errors_without_raising(monkeypatch):
    db = FakeDb()

    def fail_database(sql):
        raise RuntimeError(f"cannot execute {sql}")

    def fail_market(received_db):
        raise ValueError("market source offline")

    def fail_coverage(received_db):
        raise LookupError("coverage source missing")

    monkeypatch.setattr(health, "text", lambda sql: sql)
    monkeypatch.setattr(db, "execute", fail_database)
    monkeypatch.setattr(health, "build_market_snapshot_response", fail_market)
    monkeypatch.setattr(health, "build_source_coverage_response", fail_coverage)

    response = health.get_readiness(db)

    assert response.ready is False
    assert response.status == "not_ready"
    assert response.degraded is False
    assert response.checks["database"].ok is False
    assert response.checks["database"].status == "error"
    assert response.checks["database"].detail == "cannot execute SELECT 1"
    assert response.checks["market_snapshot"].detail == "market source offline"
    assert response.checks["source_coverage"].detail == "coverage source missing"
