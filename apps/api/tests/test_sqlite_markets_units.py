from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.api.routes import sqlite_markets
from app.models.sqlite_models import MarketPrice
from app.schemas.sqlite_schemas import MarketPriceCreate, MarketPriceUpdate


class FakeQuery:
    def __init__(self, *, all_result=None, first_result=None):
        self.all_result = all_result or []
        self.first_result = first_result
        self.filters = []
        self.orderings = []

    def filter(self, *criteria):
        self.filters.extend(criteria)
        return self

    def order_by(self, *criteria):
        self.orderings.extend(criteria)
        return self

    def all(self):
        return self.all_result

    def first(self):
        return self.first_result


class FakeSession:
    def __init__(self, query: FakeQuery | None = None):
        self.query_obj = query or FakeQuery()
        self.queried_models = []
        self.added = []
        self.deleted = []
        self.commits = 0
        self.refreshed = []

    def query(self, model):
        self.queried_models.append(model)
        return self.query_obj

    def add(self, obj):
        self.added.append(obj)

    def delete(self, obj):
        self.deleted.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        self.refreshed.append(obj)


def _market_price(**overrides) -> MarketPrice:
    values = {
        "id": "price-1",
        "market_type": "ARA",
        "price": 97.5,
        "unit": "USD/bbl",
        "source": "unit-test",
        "timestamp": datetime(2026, 1, 2, tzinfo=timezone.utc),
        "created_at": datetime(2026, 1, 2, 1, tzinfo=timezone.utc),
    }
    values.update(overrides)
    return MarketPrice(**values)


def test_list_market_prices_applies_filters_and_orders_by_timestamp_desc():
    expected = [_market_price(id="price-new"), _market_price(id="price-old")]
    query = FakeQuery(all_result=expected)
    db = FakeSession(query)
    start_date = datetime(2026, 1, 1, tzinfo=timezone.utc)
    end_date = datetime(2026, 1, 31, tzinfo=timezone.utc)

    result = sqlite_markets.list_market_prices(
        start_date=start_date,
        end_date=end_date,
        market_type="ARA",
        db=db,
    )

    assert result == expected
    assert db.queried_models == [MarketPrice]
    assert len(query.filters) == 3
    assert len(query.orderings) == 1


def test_create_market_price_persists_real_model_and_invalidates_cache(monkeypatch):
    db = FakeSession()
    invalidations = []
    payload = MarketPriceCreate(
        market_type="EU_ETS",
        price=82.25,
        unit="EUR/tonne",
        source="ICE",
        timestamp=datetime(2026, 2, 3, tzinfo=timezone.utc),
    )

    monkeypatch.setattr(
        sqlite_markets.PriceCacheService,
        "invalidate_cache",
        lambda session, market_type: invalidations.append((session, market_type)),
    )

    created = sqlite_markets.create_market_price(payload, db=db)

    assert isinstance(created, MarketPrice)
    assert created.market_type == "EU_ETS"
    assert created.price == 82.25
    assert db.added == [created]
    assert db.commits == 1
    assert db.refreshed == [created]
    assert invalidations == [(db, "EU_ETS")]


def test_create_market_price_rejects_invalid_market_type_without_writes(monkeypatch):
    db = FakeSession()
    invalidations = []
    payload = MarketPriceCreate(
        market_type="Brent",
        price=79.0,
        unit="USD/bbl",
        timestamp=datetime(2026, 3, 4, tzinfo=timezone.utc),
    )

    monkeypatch.setattr(
        sqlite_markets.PriceCacheService,
        "invalidate_cache",
        lambda session, market_type: invalidations.append((session, market_type)),
    )

    with pytest.raises(HTTPException) as exc_info:
        sqlite_markets.create_market_price(payload, db=db)

    assert exc_info.value.status_code == 400
    assert "Invalid market_type" in exc_info.value.detail
    assert db.added == []
    assert db.commits == 0
    assert invalidations == []


def test_update_market_price_patches_set_fields_and_invalidates_final_market_type(monkeypatch):
    existing = _market_price(market_type="US_Gulf", price=92.0, unit="USD/bbl")
    db = FakeSession(FakeQuery(first_result=existing))
    invalidations = []
    payload = MarketPriceUpdate(price=94.75)

    monkeypatch.setattr(
        sqlite_markets.PriceCacheService,
        "invalidate_cache",
        lambda session, market_type: invalidations.append((session, market_type)),
    )

    updated = sqlite_markets.update_market_price("price-1", payload, db=db)

    assert updated is existing
    assert existing.price == 94.75
    assert existing.unit == "USD/bbl"
    assert db.added == [existing]
    assert db.commits == 1
    assert db.refreshed == [existing]
    assert invalidations == [(db, "US_Gulf")]


def test_get_latest_price_returns_cached_latest_without_querying_database(monkeypatch):
    latest = {"id": "cached-price", "market_type": "ARA", "price": 101.2}
    db = FakeSession()

    monkeypatch.setattr(
        sqlite_markets.PriceCacheService,
        "get_cache",
        lambda session, market_type: type(
            "Cache",
            (),
            {"cached_data": {"latest": latest}},
        )(),
    )

    result = sqlite_markets.get_latest_price("ARA", db=db)

    assert result == latest
    assert db.queried_models == []


def test_delete_market_price_removes_row_and_invalidates_deleted_market_type(monkeypatch):
    existing = _market_price(market_type="ARA")
    db = FakeSession(FakeQuery(first_result=existing))
    invalidations = []

    monkeypatch.setattr(
        sqlite_markets.PriceCacheService,
        "invalidate_cache",
        lambda session, market_type: invalidations.append((session, market_type)),
    )

    result = sqlite_markets.delete_market_price("price-1", db=db)

    assert result is None
    assert db.deleted == [existing]
    assert db.commits == 1
    assert invalidations == [(db, "ARA")]
