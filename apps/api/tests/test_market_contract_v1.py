from datetime import datetime, UTC
from pathlib import Path

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
def db_path(tmp_path: Path):
    return tmp_path / "test_contract.sqlite3"


@pytest.fixture
def client(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    app = FastAPI(title="market-contract-v1-test")
    app.include_router(api_router, prefix="/v1")

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


@pytest.fixture
def seeded_refresh_run(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        db.add(
            MarketRefreshRun(
                refreshed_at=datetime(2100, 1, 1, tzinfo=UTC),
                source_status="degraded",
                ingest="test-seed",
                sources={
                    "brent": {
                        "source": "eia",
                        "status": "ok",
                        "region": "global",
                        "market_scope": "physical_spot_benchmark",
                        "confidence_score": 0.88,
                        "fallback_used": False,
                    },
                    "jet": {
                        "source": "fred",
                        "status": "ok",
                        "region": "us",
                        "market_scope": "statistical_series",
                        "confidence_score": 0.78,
                        "fallback_used": False,
                        "error": "FRED delayed",
                    },
                    "carbon": {
                        "source": "cbam+ecb",
                        "status": "fallback",
                        "region": "eu",
                        "market_scope": "regulatory_proxy",
                        "confidence_score": 0.7,
                        "fallback_used": True,
                        "note": "CBAM refreshed with ECB FX",
                        "cbam_eur": 88.0,
                        "usd_per_eur": 1.0923,
                    },
                    "jet_eu_proxy": {
                        "source": "brent-derived",
                        "status": "fallback",
                        "region": "eu",
                        "market_scope": "derived_proxy",
                        "confidence_score": 0.65,
                        "fallback_used": True,
                    },
                },
            )
        )
        db.commit()


def test_snapshot_has_source_details_shape(client: TestClient, seeded_refresh_run):
    response = client.get("/v1/market/snapshot")
    assert response.status_code == 200
    payload = response.json()

    assert "source_details" in payload
    source_details = payload["source_details"]
    assert isinstance(source_details, dict)
    assert source_details

    expected_keys = {
        "source",
        "status",
        "region",
        "market_scope",
        "confidence_score",
        "fallback_used",
    }

    for metric_key in ("brent", "jet", "carbon", "jet_eu_proxy"):
        assert metric_key in source_details, f"missing source detail for {metric_key}"
        detail = source_details[metric_key]
        assert expected_keys.issubset(detail.keys()), f"{metric_key} missing keys"
        assert isinstance(detail["source"], str) and detail["source"]
        assert isinstance(detail["status"], str) and detail["status"]
        assert isinstance(detail["region"], str) and detail["region"]
        assert isinstance(detail["market_scope"], str) and detail["market_scope"]
        assert isinstance(detail["confidence_score"], (int, float))
        assert 0.0 <= float(detail["confidence_score"]) <= 1.0
        assert isinstance(detail["fallback_used"], bool)


def test_snapshot_source_details_has_fallback_flag(client: TestClient, seeded_refresh_run):
    response = client.get("/v1/market/snapshot")
    assert response.status_code == 200
    payload = response.json()

    source_details = payload["source_details"]
    fallback_flags = [bool(detail.get("fallback_used")) for detail in source_details.values() if isinstance(detail, dict)]
    assert fallback_flags, "expected non-empty fallback flags from source_details"
    assert all(isinstance(flag, bool) for flag in fallback_flags)


def test_source_coverage_carries_display_supplements(client: TestClient, seeded_refresh_run):
    response = client.get("/v1/sources/coverage")
    assert response.status_code == 200
    payload = response.json()

    metrics = {metric["metric_key"]: metric for metric in payload["metrics"]}
    carbon = metrics["carbon_proxy_usd_per_t"]

    assert carbon["note"] == "CBAM refreshed with ECB FX"
    assert carbon["cbam_eur"] == 88.0
    assert carbon["usd_per_eur"] == 1.0923

    jet = metrics["jet_usd_per_l"]
    assert jet["error"] == "FRED delayed"
