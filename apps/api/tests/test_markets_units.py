from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.api.routes import markets
from app.schemas.sqlite_schemas import MarketPriceCreate, MarketPriceUpdate


class FakeQuery:
    def __init__(self, first_result=None):
        self._first_result = first_result

    def filter(self, *_args, **_kwargs):
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    def all(self):
        return []

    def first(self):
        return self._first_result


class FakeDB:
    def __init__(self, first_result=None):
        self._query = FakeQuery(first_result=first_result)
        self.added = []
        self.committed = False
        self.refreshed = []
        self.deleted = []

    def query(self, _model):
        return self._query

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        self.refreshed.append(obj)

    def delete(self, obj):
        self.deleted.append(obj)


class NoQueryDB:
    def query(self, _model):
        raise AssertionError("DB query should not run when cached latest exists")


class CachedPrice:
    def __init__(self, cached_data):
        self.cached_data = cached_data


class StubMarketPrice:
    def __init__(self):
        self.id = "price-1"
        self.market_type = "ARA"
        self.price = 100.0
        self.unit = "USD/bbl"
        self.timestamp = datetime(2026, 1, 2, tzinfo=timezone.utc)


def test_create_market_price_rejects_invalid_market_type():
    db = FakeDB()
    payload = MarketPriceCreate(
        market_type="INVALID",
        price=90.0,
        unit="USD/bbl",
        source="test",
    )

    with pytest.raises(HTTPException) as exc:
        markets.create_market_price(payload, db)

    assert exc.value.status_code == 400
    assert "Invalid market_type" in exc.value.detail
    assert db.committed is False


def test_update_market_price_updates_fields_and_invalidates_cache(monkeypatch: pytest.MonkeyPatch):
    existing = StubMarketPrice()
    db = FakeDB(first_result=existing)
    invalidate_calls = []

    def _fake_invalidate_cache(db_arg, market_type):
        invalidate_calls.append((db_arg, market_type))
        return 1

    monkeypatch.setattr(markets.PriceCacheService, "invalidate_cache", _fake_invalidate_cache)

    updated = markets.update_market_price(
        "price-1",
        MarketPriceUpdate(price=123.45),
        db,
    )

    assert updated is existing
    assert existing.price == 123.45
    assert existing.unit == "USD/bbl"
    assert db.committed is True
    assert db.refreshed == [existing]
    assert invalidate_calls == [(db, "ARA")]


def test_get_latest_price_returns_cached_latest_without_db_query(monkeypatch: pytest.MonkeyPatch):
    latest_payload = {"id": "cached-1", "market_type": "ARA", "price": 77.7}

    def _fake_get_cache(_db, _market_type):
        return CachedPrice(cached_data={"latest": latest_payload})

    def _fake_set_cache(_db, _market_type, _cached_data):
        raise AssertionError("set_cache should not run when cache hit exists")

    monkeypatch.setattr(markets.PriceCacheService, "get_cache", _fake_get_cache)
    monkeypatch.setattr(markets.PriceCacheService, "set_cache", _fake_set_cache)

    result = markets.get_latest_price("ARA", NoQueryDB())

    assert result == latest_payload


def test_get_latest_price_reads_from_db_and_sets_cache_on_cache_miss(monkeypatch: pytest.MonkeyPatch):
    live_price = StubMarketPrice()
    db = FakeDB(first_result=live_price)
    set_calls = []

    def _fake_get_cache(_db, _market_type):
        return None

    def _fake_set_cache(db_arg, market_type, cache_data):
        set_calls.append((db_arg, market_type, cache_data))
        return None

    monkeypatch.setattr(markets.PriceCacheService, "get_cache", _fake_get_cache)
    monkeypatch.setattr(markets.PriceCacheService, "set_cache", _fake_set_cache)

    result = markets.get_latest_price("ARA", db)

    assert result is live_price
    assert len(set_calls) == 1
    assert set_calls[0][0] is db
    assert set_calls[0][1] == "ARA"
    assert set_calls[0][2]["latest"]["id"] == "price-1"
    assert "timestamp" in set_calls[0][2]
