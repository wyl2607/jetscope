from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import Float, create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.sqlite_models import (
    MarketAlert,
    MarketPrice,
    PriceCache,
    UserScenario,
    _utcnow,
)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    with SessionLocal() as session:
        yield session


# ---------------------------------------------------------------------------
# _utcnow helper
# ---------------------------------------------------------------------------

class TestUtcNow:
    def test_returns_timezone_aware_datetime(self):
        result = _utcnow()
        assert isinstance(result, datetime)
        assert result.tzinfo is not None
        assert result.tzinfo is timezone.utc or result.utcoffset() == timezone.utc.utcoffset(result)

    def test_returns_increasing_values(self):
        t1 = _utcnow()
        t2 = _utcnow()
        assert t2 >= t1


# ---------------------------------------------------------------------------
# Model metadata (no DB needed)
# ---------------------------------------------------------------------------

class TestModelMetadata:
    def test_table_names(self):
        assert MarketPrice.__tablename__ == "market_prices"
        assert UserScenario.__tablename__ == "user_scenarios"
        assert MarketAlert.__tablename__ == "market_alerts"
        assert PriceCache.__tablename__ == "price_cache"

    def test_market_price_columns(self):
        cols = MarketPrice.__table__.columns
        assert cols["id"].primary_key
        assert cols["id"].type.length == 36
        assert not cols["timestamp"].nullable
        assert cols["timestamp"].index
        assert not cols["market_type"].nullable
        assert cols["market_type"].type.length == 32
        assert cols["market_type"].index
        assert not cols["price"].nullable
        assert isinstance(cols["price"].type, type(Float()))
        assert not cols["unit"].nullable
        assert cols["unit"].type.length == 24
        assert cols["source"].nullable
        assert cols["source"].type.length == 80
        assert not cols["created_at"].nullable

    def test_user_scenario_columns(self):
        cols = UserScenario.__table__.columns
        assert cols["id"].primary_key
        assert cols["id"].type.length == 36
        assert not cols["user_id"].nullable
        assert cols["user_id"].index
        assert cols["user_id"].type.length == 36
        assert not cols["scenario_name"].nullable
        assert cols["scenario_name"].type.length == 120
        assert cols["description"].nullable
        assert not cols["parameters"].nullable
        assert not cols["created_at"].nullable
        assert not cols["updated_at"].nullable

    def test_market_alert_columns(self):
        cols = MarketAlert.__table__.columns
        assert cols["id"].primary_key
        assert cols["id"].type.length == 36
        assert not cols["market_type"].nullable
        assert cols["market_type"].index
        assert cols["market_type"].type.length == 32
        assert not cols["threshold_type"].nullable
        assert cols["threshold_type"].type.length == 32
        assert not cols["threshold_value"].nullable
        assert not cols["status"].nullable
        assert cols["status"].type.length == 16
        assert cols["last_triggered"].nullable
        assert not cols["created_at"].nullable
        assert not cols["updated_at"].nullable

    def test_price_cache_columns(self):
        cols = PriceCache.__table__.columns
        assert cols["id"].primary_key
        assert cols["id"].type.length == 36
        assert not cols["market_type"].nullable
        assert cols["market_type"].unique
        assert cols["market_type"].index
        assert cols["market_type"].type.length == 32
        assert not cols["cached_data"].nullable
        assert not cols["last_updated"].nullable
        assert not cols["expires_at"].nullable

    def test_indexes(self):
        mp_indexes = {i.name for i in MarketPrice.__table_args__ if hasattr(i, "name")}
        assert "idx_market_prices_timestamp_market_type" in mp_indexes

        us_indexes = {i.name for i in UserScenario.__table_args__ if hasattr(i, "name")}
        assert "idx_user_scenarios_user_id" in us_indexes

        ma_indexes = {i.name for i in MarketAlert.__table_args__ if hasattr(i, "name")}
        assert "idx_market_alerts_market_type_status" in ma_indexes


# ---------------------------------------------------------------------------
# Default value behaviour
# ---------------------------------------------------------------------------

class TestDefaults:
    def test_id_default_generates_uuid_string(self, db_session):
        mp = MarketPrice(market_type="ARA", price=85.0, unit="USD/bbl", timestamp=_utcnow())
        db_session.add(mp)
        db_session.flush()
        assert isinstance(mp.id, str)
        assert len(mp.id) == 36

    def test_id_defaults_are_unique(self, db_session):
        ids = set()
        for i in range(50):
            mp = MarketPrice(market_type="ARA", price=float(i), unit="X", timestamp=_utcnow())
            db_session.add(mp)
            db_session.flush()
            ids.add(mp.id)
        assert len(ids) == 50

    def test_market_alert_default_status(self, db_session):
        alert = MarketAlert(market_type="EU_ETS", threshold_type="above", threshold_value=100.0)
        db_session.add(alert)
        db_session.flush()
        assert alert.status == "active"

    def test_created_at_set_on_flush(self, db_session):
        mp = MarketPrice(market_type="ARA", price=85.0, unit="USD/bbl", timestamp=_utcnow())
        db_session.add(mp)
        db_session.flush()
        assert mp.created_at is not None
        assert mp.created_at.tzinfo is not None


# ---------------------------------------------------------------------------
# Persistence round-trips (real SQLite via tmp_path)
# ---------------------------------------------------------------------------

class TestPersistence:
    def test_market_price_round_trip(self, db_session):
        now = _utcnow()
        mp = MarketPrice(
            market_type="US_Gulf",
            price=72.50,
            unit="USD/bbl",
            source="EIA",
            timestamp=now,
        )
        db_session.add(mp)
        db_session.commit()

        row = db_session.query(MarketPrice).filter(MarketPrice.market_type == "US_Gulf").one()
        assert row.price == 72.50
        assert row.unit == "USD/bbl"
        assert row.source == "EIA"
        assert row.market_type == "US_Gulf"

    def test_user_scenario_round_trip(self, db_session):
        scenario = UserScenario(
            user_id="user-abc",
            scenario_name="High Oil Case",
            description="Test",
            parameters={"price": 120, "weeks": 8},
        )
        db_session.add(scenario)
        db_session.commit()

        row = db_session.query(UserScenario).filter(UserScenario.user_id == "user-abc").one()
        assert row.scenario_name == "High Oil Case"
        assert row.parameters == {"price": 120, "weeks": 8}

    def test_market_alert_round_trip(self, db_session):
        alert = MarketAlert(
            market_type="ARA",
            threshold_type="above",
            threshold_value=90.0,
            status="inactive",
        )
        db_session.add(alert)
        db_session.commit()

        row = db_session.query(MarketAlert).filter(MarketAlert.market_type == "ARA").one()
        assert row.threshold_value == 90.0
        assert row.status == "inactive"
        assert row.last_triggered is None

    def test_price_cache_round_trip(self, db_session):
        now = _utcnow()
        cache = PriceCache(
            market_type="iea_cov_de",
            cached_data={"stock_days": 21, "label": "Germany"},
            expires_at=now,
        )
        db_session.add(cache)
        db_session.commit()

        row = db_session.query(PriceCache).filter(PriceCache.market_type == "iea_cov_de").one()
        assert row.cached_data == {"stock_days": 21, "label": "Germany"}

    def test_unique_constraint_on_price_cache_market_type(self, db_session):
        now = _utcnow()
        db_session.add(PriceCache(market_type="unique_test", cached_data={"a": 1}, expires_at=now))
        db_session.commit()
        db_session.add(PriceCache(market_type="unique_test", cached_data={"b": 2}, expires_at=now))
        with pytest.raises(Exception):
            db_session.commit()
