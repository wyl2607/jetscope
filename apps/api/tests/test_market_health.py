"""Market health endpoint: refresh-run honesty, no invented prices."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.router import api_router
from app.db.base import Base
from app.db.session import get_db
from app.models.tables import MarketRefreshRun


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS", "600")
    engine = create_engine(f"sqlite:///{tmp_path / 'health.sqlite3'}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    app = FastAPI()
    app.include_router(api_router, prefix="/v1")

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app), SessionLocal


def test_market_health_empty_is_unhealthy(client):
    test_client, _ = client
    response = test_client.get("/v1/market/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["healthy"] is False
    assert payload["runs_total"] == 0
    assert payload["refresh_interval_seconds"] == 600
    assert payload["recent_runs"] == []
    assert "No market refresh runs" in payload["note"]


def test_market_health_with_recent_ok_run(client):
    test_client, SessionLocal = client
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    db.add(
        MarketRefreshRun(
            id=str(uuid4()),
            refreshed_at=now - timedelta(minutes=2),
            source_status="ok",
            sources={"brent": {"status": "ok"}},
            ingest="live-refresh",
        )
    )
    db.add(
        MarketRefreshRun(
            id=str(uuid4()),
            refreshed_at=now - timedelta(minutes=12),
            source_status="error",
            sources={},
            ingest="live-refresh",
        )
    )
    db.commit()
    db.close()

    response = test_client.get("/v1/market/health?runs_window=10")
    assert response.status_code == 200
    payload = response.json()
    assert payload["runs_total"] == 2
    assert payload["runs_ok"] == 1
    assert payload["success_rate"] == 0.5
    assert payload["latest_status"] == "ok"
    assert payload["healthy"] is True
    assert payload["age_seconds"] is not None
    assert payload["age_seconds"] >= 0
    assert payload["next_refresh_eta_seconds"] is not None
    assert len(payload["recent_runs"]) == 2
    assert payload["recent_runs"][0]["ok"] is True
