from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.db.base import Base
from app.models import sqlite_models
from app.models.sqlite_models import MarketAlert, MarketPrice, PriceCache


def test_utcnow_returns_timezone_aware_utc_datetime():
    before = datetime.now(timezone.utc)
    current = sqlite_models._utcnow()
    after = datetime.now(timezone.utc)

    assert current.tzinfo == timezone.utc
    assert before <= current <= after


def test_market_price_schema_has_expected_columns_and_composite_index():
    table = MarketPrice.__table__

    assert table.name == "market_prices"
    assert table.c.id.primary_key is True
    assert table.c.id.type.length == 36

    composite_indexes = {
        (index.name, tuple(column.name for column in index.columns))
        for index in table.indexes
    }
    assert (
        "idx_market_prices_timestamp_market_type",
        ("timestamp", "market_type"),
    ) in composite_indexes

    created_at_default = table.c.created_at.default
    assert created_at_default is not None
    assert callable(created_at_default.arg)
    assert created_at_default.arg.__name__ == "_utcnow"


def test_market_alert_defaults_are_applied_on_insert_with_sqlite_memory_db():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    with SessionLocal() as db:
        alert = MarketAlert(
            market_type="EU_ETS",
            threshold_type="above",
            threshold_value=95.5,
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

    assert len(alert.id) == 36
    assert alert.status == "active"
    assert alert.created_at is not None
    assert alert.updated_at is not None


def test_price_cache_market_type_is_unique_constraint_in_sqlite():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    with SessionLocal() as db:
        db.add(
            PriceCache(
                market_type="iea_cov_de",
                cached_data={"stock_days": 21},
                expires_at=datetime.now(timezone.utc),
            )
        )
        db.commit()

        db.add(
            PriceCache(
                market_type="iea_cov_de",
                cached_data={"stock_days": 20},
                expires_at=datetime.now(timezone.utc),
            )
        )

        with pytest.raises(IntegrityError):
            db.commit()
