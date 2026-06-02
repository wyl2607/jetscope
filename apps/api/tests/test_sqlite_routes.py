from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.router import api_router
from app.api.routes import sqlite_alerts, sqlite_markets, sqlite_scenarios
from app.db.base import Base
from app.db.session import get_db
from app.db.sqlite import get_sqlite_db
from app.models.sqlite_models import MarketAlert, MarketPrice, PriceCache, UserScenario


@pytest.fixture
def db_path(tmp_path: Path):
    return tmp_path / "test_sqlite_routes.sqlite3"


@pytest.fixture
def client(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    app = FastAPI(title="sqlite-route-test")
    app.include_router(api_router, prefix="/v1")
    app.include_router(sqlite_markets.router, prefix="/v1", tags=["sqlite-markets-test"])
    app.include_router(sqlite_scenarios.router, prefix="/v1", tags=["sqlite-scenarios-test"])
    app.include_router(sqlite_alerts.router, prefix="/v1", tags=["sqlite-alerts-test"])

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_sqlite_db] = _override_db
    return TestClient(app)


def test_market_prices_get_routes_return_seeded_rows(client: TestClient, db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    older = datetime(2026, 5, 1, 9, 0, tzinfo=timezone.utc)
    newer = older + timedelta(hours=1)
    with SessionLocal() as session:
        session.add_all(
            [
                MarketPrice(
                    id="price-older",
                    timestamp=older,
                    market_type="ARA",
                    price=82.1,
                    unit="USD/bbl",
                    source="seed",
                    created_at=older,
                ),
                MarketPrice(
                    id="price-newer",
                    timestamp=newer,
                    market_type="ARA",
                    price=84.2,
                    unit="USD/bbl",
                    source="seed",
                    created_at=newer,
                ),
                PriceCache(
                    market_type="ARA",
                    cached_data={
                        "latest": {
                            "id": "price-newer",
                            "timestamp": newer.isoformat(),
                            "market_type": "ARA",
                            "price": 84.2,
                            "unit": "USD/bbl",
                            "source": "seed",
                            "created_at": newer.isoformat(),
                        }
                    },
                    expires_at=datetime.now(timezone.utc) + timedelta(days=1),
                ),
            ]
        )
        session.commit()

    list_response = client.get("/v1/sqlite/market-prices", params={"market_type": "ARA"})
    assert list_response.status_code == 200
    prices = list_response.json()
    assert [price["id"] for price in prices] == ["price-newer", "price-older"]
    assert {"id", "timestamp", "market_type", "price", "unit", "source", "created_at"}.issubset(
        prices[0].keys()
    )

    detail_response = client.get("/v1/sqlite/market-prices/price-newer")
    assert detail_response.status_code == 200
    assert detail_response.json()["price"] == pytest.approx(84.2)

    latest_response = client.get("/v1/sqlite/market-prices/latest/ARA")
    assert latest_response.status_code == 200
    assert latest_response.json()["id"] == "price-newer"


def test_market_price_detail_returns_404_for_unknown_id(client: TestClient):
    response = client.get("/v1/sqlite/market-prices/missing-price")
    assert response.status_code == 404
    assert response.json()["detail"] == "Market price not found"


def test_market_alerts_get_routes_return_seeded_rows(client: TestClient, db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    created = datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc)
    with SessionLocal() as session:
        session.add_all(
            [
                MarketAlert(
                    id="alert-active",
                    market_type="EU_ETS",
                    threshold_type="above",
                    threshold_value=95.0,
                    status="active",
                    created_at=created,
                    updated_at=created,
                ),
                MarketAlert(
                    id="alert-inactive",
                    market_type="ARA",
                    threshold_type="below",
                    threshold_value=75.0,
                    status="inactive",
                    created_at=created - timedelta(hours=1),
                    updated_at=created - timedelta(hours=1),
                ),
            ]
        )
        session.commit()

    list_response = client.get(
        "/v1/sqlite/market-alerts",
        params={"market_type": "EU_ETS", "status": "active"},
    )
    assert list_response.status_code == 200
    alerts = list_response.json()
    assert len(alerts) == 1
    assert alerts[0]["id"] == "alert-active"
    assert {"id", "market_type", "threshold_type", "threshold_value", "status"}.issubset(alerts[0].keys())

    detail_response = client.get("/v1/sqlite/market-alerts/alert-active")
    assert detail_response.status_code == 200
    assert detail_response.json()["threshold_value"] == pytest.approx(95.0)


def test_market_alert_detail_returns_404_for_unknown_id(client: TestClient):
    response = client.get("/v1/sqlite/market-alerts/missing-alert")
    assert response.status_code == 404
    assert response.json()["detail"] == "Alert not found"


def test_user_scenarios_get_routes_return_seeded_rows(client: TestClient, db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    created = datetime(2026, 5, 1, 11, 0, tzinfo=timezone.utc)
    with SessionLocal() as session:
        session.add_all(
            [
                UserScenario(
                    id="scenario-newer",
                    user_id="user-1",
                    scenario_name="High carbon price",
                    description="EU ETS stress case",
                    parameters={"carbon_price_eur_per_t": 120},
                    created_at=created,
                    updated_at=created,
                ),
                UserScenario(
                    id="scenario-other-user",
                    user_id="user-2",
                    scenario_name="Other user case",
                    description=None,
                    parameters={"carbon_price_eur_per_t": 80},
                    created_at=created - timedelta(hours=1),
                    updated_at=created - timedelta(hours=1),
                ),
            ]
        )
        session.commit()

    list_response = client.get("/v1/sqlite/user-scenarios", params={"user_id": "user-1"})
    assert list_response.status_code == 200
    scenarios = list_response.json()
    assert len(scenarios) == 1
    assert scenarios[0]["id"] == "scenario-newer"
    assert scenarios[0]["parameters"] == {"carbon_price_eur_per_t": 120}
    assert {"id", "user_id", "scenario_name", "parameters", "created_at", "updated_at"}.issubset(
        scenarios[0].keys()
    )

    detail_response = client.get("/v1/sqlite/user-scenarios/scenario-newer")
    assert detail_response.status_code == 200
    assert detail_response.json()["scenario_name"] == "High carbon price"


def test_user_scenarios_list_requires_user_id(client: TestClient):
    response = client.get("/v1/sqlite/user-scenarios")
    assert response.status_code == 422


def test_user_scenario_detail_returns_404_for_unknown_id(client: TestClient):
    response = client.get("/v1/sqlite/user-scenarios/missing-scenario")
    assert response.status_code == 404
    assert response.json()["detail"] == "Scenario not found"
