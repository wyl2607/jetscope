"""Tests for the reserves service: DB aggregation + refresh fallback."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.tables import ReservesCoverage
from app.services.analysis.dashboard_contracts import build_eu_reserve_signal_response
from app.services.analysis.reserve_stress import get_eu_reserve_stress
from app.services.reserves import (
    EU_COUNTRIES,
    get_eu_reserve_stress_from_db,
    refresh_reserves_coverage,
)


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'reserves.sqlite3'}", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def _insert_row(
    session,
    iso: str,
    stock_days: float,
    at: datetime,
    confidence: float = 0.9,
    source: str = "iea_oil_market_report",
):
    session.add(
        ReservesCoverage(
            id=str(uuid4()),
            country_iso=iso,
            timestamp=at,
            stock_days=stock_days,
            source=source,
            confidence=confidence,
            fetched_at=at,
        )
    )
    session.commit()


def test_reserve_stress_returns_none_when_table_empty(db_session):
    assert get_eu_reserve_stress_from_db(db_session) is None


def test_reserve_stress_aggregates_latest_per_country(db_session):
    now = datetime.now(timezone.utc)
    # Two rows for DE; the newer one should win.
    _insert_row(db_session, "DE", 40.0, now - timedelta(days=5))
    _insert_row(db_session, "DE", 18.0, now)
    _insert_row(db_session, "FR", 22.0, now)
    _insert_row(db_session, "NL", 14.0, now)

    resp = get_eu_reserve_stress_from_db(db_session)
    assert resp is not None
    # Average of 18/22/14 = 18
    assert resp.coverage_days == 18
    assert resp.region == "eu"
    assert resp.stress_level == "elevated"  # 14 <= 18 < 21
    assert resp.source_type == "official"  # iea source present
    assert 0.0 < resp.confidence <= 1.0


def test_reserve_stress_critical_when_below_14_days(db_session):
    now = datetime.now(timezone.utc)
    for iso in ("DE", "FR"):
        _insert_row(db_session, iso, 10.0, now)
    resp = get_eu_reserve_stress_from_db(db_session)
    assert resp is not None
    assert resp.stress_level == "critical"
    assert resp.supply_gap_pct == 100.0


def test_reserve_stress_falls_back_without_db_rows(db_session):
    resp = get_eu_reserve_stress(db_session)

    assert resp.region == "eu"
    assert resp.coverage_days == 20
    assert resp.source_type == "manual"


def test_reserve_signal_response_uses_db_backed_official_source(db_session):
    now = datetime.now(timezone.utc)
    _insert_row(db_session, "DE", 21.0, now)
    _insert_row(db_session, "FR", 28.0, now)

    resp = build_eu_reserve_signal_response(db=db_session)

    assert resp.region == "eu"
    assert resp.coverage_days == 24
    assert resp.coverage_weeks == round(24 / 7, 2)
    assert resp.source_type == "official"
    assert resp.source_name == "IEA Oil Market Report"
    assert resp.generated_at == now


def test_refresh_without_api_key_returns_zero(db_session, monkeypatch):
    """When IEA_API_KEY is unset, refresh should silently return 0 (no crash)."""
    monkeypatch.delenv("IEA_API_KEY", raising=False)
    inserted = refresh_reserves_coverage(db_session)
    assert inserted == 0
    # No rows persisted.
    assert db_session.query(ReservesCoverage).count() == 0


def test_refresh_with_stubbed_adapter_persists_rows(db_session):
    """A minimal duck-typed adapter proves refresh persists one row per country."""
    from types import SimpleNamespace

    class FakeAdapter:
        def fetch_stock_days_coverage(self, iso):
            return SimpleNamespace(
                country_iso=iso,
                stock_days=20.0,
                source="iea_oil_market_report",
                confidence=0.9,
                timestamp=datetime.now(timezone.utc),
            )

    inserted = refresh_reserves_coverage(db_session, adapter=FakeAdapter())
    assert inserted == len(EU_COUNTRIES)
    assert db_session.query(ReservesCoverage).count() == len(EU_COUNTRIES)
