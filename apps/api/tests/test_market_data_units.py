from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

try:
    from models.market_data import MarketPrice, RotterdamEmissions, SourceStatus
except ModuleNotFoundError:
    from apps.api.models.market_data import MarketPrice, RotterdamEmissions, SourceStatus


def test_market_price_defaults_and_timestamp_are_utc_aware():
    before = datetime.now(timezone.utc)
    model = MarketPrice(
        price=115.5,
        source="OpenAQ",
        confidence=0.95,
        freshness_seconds=300,
    )
    after = datetime.now(timezone.utc)

    assert model.error_code is None
    assert model.timestamp.tzinfo is not None
    assert model.timestamp.utcoffset() == timezone.utc.utcoffset(model.timestamp)
    assert before <= model.timestamp <= after


def test_market_price_rejects_invalid_bounds():
    with pytest.raises(ValidationError):
        MarketPrice(
            price=-1,
            source="OpenAQ",
            confidence=0.95,
            freshness_seconds=300,
        )

    with pytest.raises(ValidationError):
        MarketPrice(
            price=100,
            source="OpenAQ",
            confidence=1.2,
            freshness_seconds=300,
        )



def test_rotterdam_emissions_optional_fields_and_non_negative_validation():
    model = RotterdamEmissions(
        pm25_ugm3=None,
        no2_ppb=None,
        wind_speed_ms=None,
        source="sensor-grid",
        confidence=0.8,
        freshness_seconds=120,
    )

    assert model.pm25_ugm3 is None
    assert model.no2_ppb is None
    assert model.wind_speed_ms is None

    with pytest.raises(ValidationError):
        RotterdamEmissions(
            pm25_ugm3=10.0,
            no2_ppb=-0.1,
            wind_speed_ms=3.0,
            source="sensor-grid",
            confidence=0.8,
            freshness_seconds=120,
        )



def test_source_status_accepts_nullable_last_success_and_validates_failures():
    model = SourceStatus(
        source_name="OpenAQ",
        source_id="openaq",
        status="healthy",
        confidence=0.9,
        last_successful_fetch=None,
        consecutive_failures=0,
        cache_ttl_seconds=60,
    )

    assert model.last_successful_fetch is None
    assert model.consecutive_failures == 0
    assert model.error_code is None

    with pytest.raises(ValidationError):
        SourceStatus(
            source_name="OpenAQ",
            source_id="openaq",
            status="degraded",
            confidence=0.5,
            consecutive_failures=-1,
            cache_ttl_seconds=60,
        )
