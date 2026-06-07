import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.router import api_router
from app.api.routes import health as health_route
from app.db.base import Base
from app.db.session import get_db
from app.schemas.sources import SourceCoverageMetric, SourceCoverageResponse
from app.services.bootstrap import utcnow


def _client(db_path: Path, db_override=None) -> TestClient:
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    app = FastAPI(title="readiness-route-test")
    app.include_router(api_router, prefix="/v1")

    def _override_db():
        if db_override is None:
            db = SessionLocal()
            try:
                yield db
            finally:
                db.close()
        else:
            yield db_override

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


def test_health_remains_liveness_only(tmp_path: Path):
    client = _client(tmp_path / "health.sqlite3")

    response = client.get("/v1/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["service"] == "api"
    assert "phase_b_capabilities" in payload


def test_readiness_reports_database_market_and_source_checks(tmp_path: Path):
    client = _client(tmp_path / "readiness.sqlite3")

    response = client.get("/v1/readiness")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ready"] is False
    assert payload["status"] == "not_ready"
    assert payload["degraded"] is True
    assert payload["service"] == "api"
    assert payload["environment"]
    assert payload["api_prefix"] == "/v1"
    assert payload["schema_bootstrap_mode"]
    assert set(payload["checks"]) == {
        "database",
        "market_snapshot",
        "source_coverage",
        "admin_token",
        "ai_research_pipeline",
    }
    assert payload["checks"]["database"]["ok"] is True
    assert payload["checks"]["market_snapshot"]["ok"] is True
    assert payload["checks"]["source_coverage"]["ok"] is False
    assert payload["checks"]["admin_token"]["ok"] is False
    assert payload["checks"]["admin_token"]["status"] == "missing"
    assert payload["checks"]["admin_token"]["severity"] == "blocker"
    assert payload["checks"]["admin_token"]["blocking"] is True
    assert payload["checks"]["admin_token"]["action"] == {
        "key": "configure_admin_token",
        "href": "/admin",
        "config_keys": ["JETSCOPE_ADMIN_TOKEN"],
    }
    assert payload["checks"]["ai_research_pipeline"]["ok"] is False
    assert payload["checks"]["ai_research_pipeline"]["status"] == "disabled"
    assert payload["checks"]["ai_research_pipeline"]["severity"] == "blocker"
    assert payload["checks"]["ai_research_pipeline"]["action"] == {
        "key": "enable_ai_research",
        "href": "/research",
        "config_keys": ["JETSCOPE_AI_RESEARCH_ENABLED"],
    }


def test_readiness_reports_degraded_when_source_coverage_is_partial(tmp_path: Path, monkeypatch):
    client = _client(tmp_path / "partial-readiness.sqlite3")

    def _partial_coverage(_db):
        return SourceCoverageResponse(
            generated_at=utcnow(),
            completeness=0.5,
            degraded=True,
            metrics=[
                SourceCoverageMetric(
                    metric_key="brent_usd_per_bbl",
                    source_name="eia",
                    source_type="official",
                    confidence_score=0.9,
                    lag_minutes=30,
                    fallback_used=False,
                    status="ok",
                    region="global",
                    market_scope="benchmark",
                )
            ],
        )

    monkeypatch.setattr(health_route, "build_source_coverage_response", _partial_coverage)
    monkeypatch.setattr(health_route.settings, "admin_token", "configured-token")
    monkeypatch.setattr(health_route.settings, "ai_research_enabled", True)
    monkeypatch.setattr(health_route.settings, "ai_research_mock_mode", True)

    response = client.get("/v1/readiness")
    assert response.status_code == 200
    payload = response.json()

    assert payload["ready"] is True
    assert payload["status"] == "degraded"
    assert payload["degraded"] is True
    assert payload["checks"]["source_coverage"]["ok"] is True
    assert payload["checks"]["source_coverage"]["status"] == "degraded"
    assert payload["checks"]["source_coverage"]["detail"] == "completeness=0.500; metrics=1"
    assert payload["checks"]["source_coverage"]["severity"] == "review"
    assert payload["checks"]["source_coverage"]["blocking"] is False
    assert payload["checks"]["source_coverage"]["action"] == {
        "key": "review_source_coverage",
        "href": "/sources?filter=review",
        "config_keys": [],
    }
    assert payload["checks"]["admin_token"]["ok"] is True
    assert payload["checks"]["ai_research_pipeline"]["status"] == "mock"


def test_readiness_reports_not_ready_when_database_check_fails(tmp_path: Path, monkeypatch):
    client = _client(tmp_path / "db-failure-readiness.sqlite3")

    def _raise_database_error(*_args, **_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(health_route, "text", _raise_database_error)

    response = client.get("/v1/readiness")
    assert response.status_code == 200
    payload = response.json()

    assert payload["ready"] is False
    assert payload["status"] == "not_ready"
    assert payload["checks"]["database"]["ok"] is False
    assert payload["checks"]["database"]["status"] == "error"


def test_readiness_route_does_not_leak_secret_like_values(tmp_path: Path, monkeypatch):
    dummy_admin = "dummy-admin-token-value"
    dummy_api_key = "sk-dummy-anthropic-value"
    dummy_bearer = "Bearer dummy-bearer-value"
    dummy_db_url = "postgresql://user:dummy-password@example/db"
    dummy_url_token = "?token=dummy-url-token"

    class FailingDb:
        def execute(self, statement):
            raise RuntimeError(
                f"db connection failed for {dummy_db_url}{dummy_url_token} with auth {dummy_bearer}"
            )

    def _raise_with_secret_message(_db):
        raise RuntimeError(f"market source reported bad key {dummy_api_key}")

    def _raise_with_url_token(_db):
        raise RuntimeError(f"coverage source includes {dummy_url_token}")

    client = _client(tmp_path / "readiness-secret-route.sqlite3", db_override=FailingDb())

    monkeypatch.setattr(health_route, "text", lambda sql: sql)
    monkeypatch.setattr(health_route, "build_market_snapshot_response", _raise_with_secret_message)
    monkeypatch.setattr(health_route, "build_source_coverage_response", _raise_with_url_token)
    monkeypatch.setattr(health_route.settings, "admin_token", "")
    monkeypatch.setattr(health_route.settings, "ai_research_enabled", True)
    monkeypatch.setattr(health_route.settings, "ai_research_mock_mode", False)
    monkeypatch.setattr(health_route.settings, "anthropic_api_key", dummy_api_key)
    monkeypatch.setattr(health_route.settings, "database_url", dummy_db_url)

    response = client.get("/v1/readiness")
    assert response.status_code == 200
    payload = response.json()
    serialized = json.dumps(payload)

    assert payload["ready"] is False
    assert payload["status"] == "not_ready"
    assert payload["checks"]["admin_token"]["status"] == "missing"
    assert payload["checks"]["admin_token"]["action"]["config_keys"] == ["JETSCOPE_ADMIN_TOKEN"]
    assert payload["checks"]["database"]["action"]["config_keys"] == ["JETSCOPE_DATABASE_URL", "JETSCOPE_SCHEMA_BOOTSTRAP_MODE"]
    assert dummy_admin not in serialized
    assert dummy_api_key not in serialized
    assert dummy_bearer not in serialized
    assert dummy_db_url not in serialized
    assert "dummy-password" not in serialized
    assert "dummy-url-token" not in serialized
