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


def _client(db_path: Path) -> TestClient:
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    app = FastAPI(title="readiness-route-test")
    app.include_router(api_router, prefix="/v1")

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

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
    assert set(payload["checks"]) == {"database", "market_snapshot", "source_coverage"}
    assert payload["checks"]["database"]["ok"] is True
    assert payload["checks"]["market_snapshot"]["ok"] is True
    assert payload["checks"]["source_coverage"]["ok"] is False


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

    response = client.get("/v1/readiness")
    assert response.status_code == 200
    payload = response.json()

    assert payload["ready"] is True
    assert payload["status"] == "degraded"
    assert payload["degraded"] is True
    assert payload["checks"]["source_coverage"] == {
        "ok": True,
        "status": "degraded",
        "detail": "completeness=0.500; metrics=1",
    }


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
