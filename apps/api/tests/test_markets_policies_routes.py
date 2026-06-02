from pathlib import Path
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.router import api_router
from app.api.routes import markets
from app.db.base import Base
from app.db.session import get_db
from app.models.sqlite_models import MarketPrice


@pytest.fixture
def db_path(tmp_path: Path):
    return tmp_path / "test_markets_policies.sqlite3"


@pytest.fixture
def client(db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)

    app = FastAPI(title="markets-policies-route-test")
    app.include_router(api_router, prefix="/v1")
    app.include_router(markets.router, prefix="/v1")

    def _override_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_db
    return TestClient(app)


def test_market_prices_route_lists_seeded_prices(client: TestClient, db_path: Path):
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    timestamp = datetime(2026, 4, 23, 12, 0, tzinfo=timezone.utc)
    with SessionLocal() as session:
        session.add_all(
            [
                MarketPrice(
                    id="ara-price",
                    timestamp=timestamp,
                    market_type="ARA",
                    price=123.45,
                    unit="USD/bbl",
                    source="test-seed",
                ),
                MarketPrice(
                    id="ets-price",
                    timestamp=timestamp,
                    market_type="EU_ETS",
                    price=82.1,
                    unit="EUR/tonne",
                    source="test-seed",
                ),
            ]
        )
        session.commit()

    response = client.get("/v1/market-prices", params={"market_type": "ARA"})
    assert response.status_code == 200
    payload = response.json()

    assert isinstance(payload, list)
    assert len(payload) == 1
    assert {"id", "timestamp", "market_type", "price", "unit", "source", "created_at"}.issubset(
        payload[0].keys()
    )
    assert payload[0]["market_type"] == "ARA"
    assert payload[0]["price"] == 123.45


def test_market_price_detail_route_returns_404_for_missing_price(client: TestClient):
    response = client.get("/v1/market-prices/missing-price")
    assert response.status_code == 404
    assert response.json()["detail"] == "Market price not found"


def test_refuel_eu_policy_route_returns_default_targets(client: TestClient):
    response = client.get("/v1/policies/refuel-eu")
    assert response.status_code == 200
    payload = response.json()

    assert isinstance(payload, list)
    assert len(payload) == 3
    assert {"year", "saf_share_pct", "synthetic_share_pct", "label"}.issubset(payload[0].keys())
    assert [target["year"] for target in payload] == [2030, 2035, 2050]
    assert payload[-1]["saf_share_pct"] == 70
