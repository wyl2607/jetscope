from datetime import datetime, UTC
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.api.router import api_router
from app.db.base import Base
from app.db.session import get_db
from app.models.tables import MarketRefreshRun, MarketSnapshot
from app.services import market as market_service
from app.services.market import DEFAULT_MARKET_METRICS


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
                        "error": "FRED delayed: https://internal.example/token=secret",
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


def test_snapshot_source_details_errors_are_public_safe(client: TestClient, seeded_refresh_run):
    response = client.get("/v1/market/snapshot")
    assert response.status_code == 200
    payload = response.json()

    jet = payload["source_details"]["jet"]
    assert jet["error"] == "source_unavailable"
    assert "internal.example" not in str(payload["source_details"])


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
    assert jet["error"] == "source_unavailable"
    assert "internal.example" not in str(jet)


def test_source_coverage_generated_at_tracks_latest_market_snapshot(client: TestClient, db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)
    snapshot_time = datetime(2100, 1, 2, 3, 4, 5, tzinfo=UTC)

    with SessionLocal() as db:
        db.add(
            MarketRefreshRun(
                refreshed_at=snapshot_time,
                source_status="ok",
                ingest="test-live",
                sources={
                    "brent": {
                        "source": "eia",
                        "status": "ok",
                        "region": "global",
                        "market_scope": "physical_spot_benchmark",
                        "confidence_score": 0.88,
                        "fallback_used": False,
                    }
                },
            )
        )
        for metric in DEFAULT_MARKET_METRICS:
            db.add(
                MarketSnapshot(
                    source_key=metric["source_key"],
                    metric_key=metric["metric_key"],
                    value=float(metric["value"]),
                    unit=metric["unit"],
                    as_of=snapshot_time,
                    payload={"test": True},
                )
            )
        db.commit()

    response = client.get("/v1/sources/coverage")
    assert response.status_code == 200
    payload = response.json()

    assert payload["generated_at"].startswith("2100-01-02T03:04:05")


def test_history_backfill_inserts_public_proxy_curves(client: TestClient, db_path: Path, monkeypatch):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    latest_time = datetime(2100, 1, 10, tzinfo=UTC)
    with SessionLocal() as db:
        db.add(
            MarketRefreshRun(
                refreshed_at=latest_time,
                source_status="ok",
                ingest="test-live",
                sources={},
            )
        )
        for metric in DEFAULT_MARKET_METRICS:
            db.add(
                MarketSnapshot(
                    source_key=metric["source_key"],
                    metric_key=metric["metric_key"],
                    value=float(metric["value"]),
                    unit=metric["unit"],
                    as_of=latest_time,
                    payload={"test": True},
                )
            )
        db.commit()

        def fake_yahoo(symbol: str, *, days: int):
            if symbol == "BZ=F":
                return [
                    (datetime(2099, 12, 11, tzinfo=UTC), 100.0),
                    (datetime(2100, 1, 3, tzinfo=UTC), 110.0),
                    (datetime(2100, 1, 9, tzinfo=UTC), 120.0),
                ]
            if symbol == "CO2.L":
                return [
                    (datetime(2099, 12, 11, tzinfo=UTC), 70.0),
                    (datetime(2100, 1, 3, tzinfo=UTC), 75.0),
                    (datetime(2100, 1, 9, tzinfo=UTC), 80.0),
                ]
            raise AssertionError(symbol)

        def fake_fred(series_id: str, *, days: int):
            assert series_id == "DJFUELUSGULF"
            return [
                (datetime(2099, 12, 11, tzinfo=UTC), 3.6),
                (datetime(2100, 1, 3, tzinfo=UTC), 3.8),
                (datetime(2100, 1, 9, tzinfo=UTC), 4.0),
            ]

        monkeypatch.setattr(market_service, "_fetch_yahoo_chart_history", fake_yahoo)
        monkeypatch.setattr(market_service, "_fetch_fred_history", fake_fred)

        result = market_service.backfill_market_history_from_public_sources(db, days=30)

        assert result["inserted_metric_count"] == 21
        assert "Yahoo Finance BZ=F" in result["sources"]
        assert "FRED DJFUELUSGULF" in result["sources"]

        history = market_service.build_market_history_response(db)
        brent = history.metrics["brent_usd_per_bbl"]
        germany = history.metrics["germany_premium_pct"]
        eu_ets = history.metrics["eu_ets_price_eur_per_t"]

        assert len(brent.points) >= 4
        assert brent.change_pct_30d is not None
        assert germany.change_pct_30d is not None
        assert eu_ets.change_pct_30d is not None

        backfilled = db.scalars(
            select(MarketSnapshot).where(
                MarketSnapshot.metric_key == "eu_ets_price_eur_per_t",
                MarketSnapshot.payload["history_backfill"].as_boolean().is_(True),
            )
        ).all()
        assert backfilled
        assert backfilled[0].payload["source"] == "proxy:yahoo:CO2.L"


def test_history_prefers_non_seed_rows_for_chart_series(client: TestClient, db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        db.add(
            MarketRefreshRun(
                refreshed_at=datetime(2100, 1, 1, tzinfo=UTC),
                source_status="seed",
                ingest="seed",
                sources={},
            )
        )
        db.add(
            MarketRefreshRun(
                refreshed_at=datetime(2100, 1, 2, tzinfo=UTC),
                source_status="ok",
                ingest="history-backfill",
                sources={},
            )
        )
        db.add(
            MarketSnapshot(
                source_key="germany_premium",
                metric_key="germany_premium_pct",
                value=2.5,
                unit="%",
                as_of=datetime(2100, 1, 2, 12, tzinfo=UTC),
                payload={"seed": "b5-vertical-slice"},
            )
        )
        db.add(
            MarketSnapshot(
                source_key="germany_premium",
                metric_key="germany_premium_pct",
                value=8.0,
                unit="%",
                as_of=datetime(2100, 1, 2, 13, tzinfo=UTC),
                payload={"history_backfill": True, "source": "proxy:yahoo:BZ=F:inverse"},
            )
        )
        db.commit()

        history = market_service.build_market_history_response(db)

    points = history.metrics["germany_premium_pct"].points
    assert [point.value for point in points] == [8.0]
