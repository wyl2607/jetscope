from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.router import api_router
from app.db.base import Base
from app.db.session import get_db


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
    assert payload["ready"] is True
    assert payload["status"] == "ready"
    assert payload["service"] == "api"
    assert payload["environment"]
    assert payload["api_prefix"] == "/v1"
    assert payload["schema_bootstrap_mode"]
    assert set(payload["checks"]) == {"database", "market_snapshot", "source_coverage"}
    assert payload["checks"]["database"]["ok"] is True
    assert payload["checks"]["market_snapshot"]["ok"] is True
    assert payload["checks"]["source_coverage"]["ok"] is True
