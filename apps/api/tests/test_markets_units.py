"""Focused unit tests for markets router — real SQLite, no network."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Generator
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes.markets import router
from app.db.base import Base
from app.db.session import get_db


@pytest.fixture
def db_engine(tmp_path):
    """Per-test fresh SQLite database."""
    engine = create_engine(f"sqlite:///{tmp_path / 'markets.db'}", echo=False)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_engine, monkeypatch):
    """TestClient with real SQLite and mocked cache service."""
    monkeypatch.setattr(
        "app.services.cache.PriceCacheService.invalidate_cache",
        MagicMock(return_value=0),
    )
    monkeypatch.setattr(
        "app.services.cache.PriceCacheService.get_cache",
        MagicMock(return_value=None),
    )
    monkeypatch.setattr(
        "app.services.cache.PriceCacheService.set_cache",
        MagicMock(),
    )

    TestSessionLocal = sessionmaker(
        bind=db_engine, autoflush=False, autocommit=False
    )

    def override_get_db() -> Generator[Session, None, None]:
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _create_market_price(
    client: TestClient,
    market_type: str = "EU_ETS",
    price: float = 89.5,
    **overrides,
):
    payload = {
        "market_type": market_type,
        "price": price,
        "unit": "EUR/tonne",
        "source": "test",
    }
    payload.update(overrides)
    return client.post("/market-prices", json=payload)


class TestCreateMarketPrice:
    def test_creates_and_returns_price(self, client):
        resp = _create_market_price(client)
        assert resp.status_code == 201
        data = resp.json()
        assert data["market_type"] == "EU_ETS"
        assert data["price"] == 89.5
        assert data["unit"] == "EUR/tonne"
        assert data["source"] == "test"
        assert "id" in data
        assert "created_at" in data

    def test_rejects_invalid_market_type(self, client):
        resp = _create_market_price(client, market_type="INVALID")
        assert resp.status_code == 400
        assert "Invalid market_type" in resp.json()["detail"]


class TestListMarketPrices:
    def test_returns_all_prices(self, client):
        _create_market_price(client, market_type="EU_ETS", price=50.0)
        _create_market_price(client, market_type="ARA", price=60.0)
        resp = client.get("/market-prices")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_filters_by_market_type(self, client):
        _create_market_price(client, market_type="EU_ETS", price=50.0)
        _create_market_price(client, market_type="ARA", price=60.0)
        resp = client.get("/market-prices?market_type=EU_ETS")
        assert resp.status_code == 200
        prices = resp.json()
        assert len(prices) == 1
        assert prices[0]["market_type"] == "EU_ETS"


class TestGetMarketPrice:
    def test_returns_price_by_id(self, client):
        create_resp = _create_market_price(client)
        price_id = create_resp.json()["id"]
        resp = client.get(f"/market-prices/{price_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == price_id

    def test_returns_404_for_nonexistent_id(self, client):
        resp = client.get("/market-prices/nonexistent")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Market price not found"


class TestUpdateMarketPrice:
    def test_updates_price_field(self, client):
        create_resp = _create_market_price(client, price=50.0)
        price_id = create_resp.json()["id"]
        resp = client.put(f"/market-prices/{price_id}", json={"price": 99.9})
        assert resp.status_code == 200
        assert resp.json()["price"] == 99.9

    def test_returns_404_for_nonexistent_id(self, client):
        resp = client.put("/market-prices/nonexistent", json={"price": 99.9})
        assert resp.status_code == 404


class TestDeleteMarketPrice:
    def test_deletes_and_removes_price(self, client):
        create_resp = _create_market_price(client)
        price_id = create_resp.json()["id"]
        resp = client.delete(f"/market-prices/{price_id}")
        assert resp.status_code == 204
        get_resp = client.get(f"/market-prices/{price_id}")
        assert get_resp.status_code == 404

    def test_returns_404_for_nonexistent_id(self, client):
        resp = client.delete("/market-prices/nonexistent")
        assert resp.status_code == 404


class TestGetLatestPrice:
    def test_returns_latest_price(self, client):
        now = datetime.now(timezone.utc)
        _create_market_price(
            client,
            market_type="EU_ETS",
            price=50.0,
            timestamp=(now - timedelta(hours=2)).isoformat(),
        )
        _create_market_price(
            client,
            market_type="EU_ETS",
            price=60.0,
            timestamp=(now - timedelta(hours=1)).isoformat(),
        )
        resp = client.get("/market-prices/latest/EU_ETS")
        assert resp.status_code == 200
        assert resp.json()["price"] == 60.0

    def test_returns_null_when_no_prices(self, client):
        resp = client.get("/market-prices/latest/EU_ETS")
        assert resp.status_code == 200
        assert resp.json() is None
