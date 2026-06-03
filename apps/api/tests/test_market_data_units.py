"""Unit tests for market_data Pydantic models (pure, no IO)."""

import json
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from models.market_data import (
    CarbonIntensity,
    EUETSVolume,
    Freshness,
    GermanyPremium,
    MarketPrice,
    RotterdamEmissions,
    SourceStatus,
    _utcnow,
)


class TestUtcNow:
    def test_returns_utc_now(self):
        dt = _utcnow()
        assert dt.tzinfo is not None
        assert dt.tzinfo.utcoffset(dt) == timezone.utc.utcoffset(dt)

    def test_returns_datetime(self):
        assert isinstance(_utcnow(), datetime)


class TestMarketPrice:
    MIN_VALID = dict(price=100.0, source="OpenAQ", confidence=0.9, freshness_seconds=60)

    def test_valid_model(self):
        m = MarketPrice(**self.MIN_VALID)
        assert m.price == 100.0
        assert m.source == "OpenAQ"
        assert m.confidence == 0.9

    def test_negative_price_raises(self):
        with pytest.raises(ValidationError):
            MarketPrice(**{**self.MIN_VALID, "price": -1})

    def test_confidence_out_of_range_raises(self):
        with pytest.raises(ValidationError):
            MarketPrice(**{**self.MIN_VALID, "confidence": 1.5})

    def test_default_timestamp_is_utc(self):
        m = MarketPrice(**self.MIN_VALID)
        assert m.timestamp.tzinfo is not None

    def test_optional_error_code_defaults_none(self):
        m = MarketPrice(**self.MIN_VALID)
        assert m.error_code is None

    def test_roundtrip_json(self):
        m = MarketPrice(**self.MIN_VALID)
        d = json.loads(m.model_dump_json())
        assert d["price"] == 100.0
        assert d["source"] == "OpenAQ"
        assert d["confidence"] == 0.9

    def test_freshness_seconds_must_be_non_negative(self):
        with pytest.raises(ValidationError):
            MarketPrice(**{**self.MIN_VALID, "freshness_seconds": -5})


class TestCarbonIntensity:
    MIN_VALID = dict(value=0.05, source="EPA", confidence=0.8, freshness_seconds=120)

    def test_valid_model(self):
        c = CarbonIntensity(**self.MIN_VALID)
        assert c.value == 0.05
        assert c.source == "EPA"

    def test_negative_value_raises(self):
        with pytest.raises(ValidationError):
            CarbonIntensity(**{**self.MIN_VALID, "value": -1})

    def test_optional_error_code(self):
        c = CarbonIntensity(**self.MIN_VALID, error_code="TIMEOUT")
        assert c.error_code == "TIMEOUT"

    def test_serialize_includes_timestamp(self):
        c = CarbonIntensity(**self.MIN_VALID)
        d = c.model_dump()
        assert "timestamp" in d
        assert "value" in d


class TestGermanyPremium:
    MIN_VALID = dict(premium_pct=12.5, source="DESTATIS", confidence=0.75, freshness_seconds=300)

    def test_valid_model(self):
        g = GermanyPremium(**self.MIN_VALID)
        assert g.premium_pct == 12.5

    def test_negative_premium_raises(self):
        with pytest.raises(ValidationError):
            GermanyPremium(**{**self.MIN_VALID, "premium_pct": -1})

    def test_confidence_boundary(self):
        GermanyPremium(**{**self.MIN_VALID, "confidence": 0.0})
        GermanyPremium(**{**self.MIN_VALID, "confidence": 1.0})


class TestRotterdamEmissions:
    MIN_VALID = dict(source="RIVM", confidence=0.85, freshness_seconds=180)

    def test_valid_with_all_optionals(self):
        r = RotterdamEmissions(
            **self.MIN_VALID,
            pm25_ugm3=15.2,
            no2_ppb=42.0,
            wind_speed_ms=3.5,
        )
        assert r.pm25_ugm3 == 15.2
        assert r.no2_ppb == 42.0
        assert r.wind_speed_ms == 3.5

    def test_optionals_default_none(self):
        r = RotterdamEmissions(**self.MIN_VALID)
        assert r.pm25_ugm3 is None
        assert r.no2_ppb is None
        assert r.wind_speed_ms is None

    def test_negative_pm25_raises(self):
        with pytest.raises(ValidationError):
            RotterdamEmissions(**self.MIN_VALID, pm25_ugm3=-1)


class TestEUETSVolume:
    MIN_VALID = dict(price_eur=75.0, source="ICAP", confidence=0.9, freshness_seconds=600)

    def test_valid_model(self):
        e = EUETSVolume(**self.MIN_VALID)
        assert e.price_eur == 75.0
        assert e.volume_tons is None

    def test_with_volume(self):
        e = EUETSVolume(**self.MIN_VALID, volume_tons=1_000_000)
        assert e.volume_tons == 1_000_000

    def test_negative_price_raises(self):
        with pytest.raises(ValidationError):
            EUETSVolume(**{**self.MIN_VALID, "price_eur": -10})

    def test_negative_volume_raises(self):
        with pytest.raises(ValidationError):
            EUETSVolume(**{**self.MIN_VALID, "volume_tons": -1})


class TestFreshness:
    MIN_VALID = dict(
        oldest_data_seconds=0,
        newest_data_seconds=100,
        average_age_seconds=50.0,
        confidence=0.95,
        freshness_seconds=30,
    )

    def test_valid_model(self):
        f = Freshness(**self.MIN_VALID)
        assert f.oldest_data_seconds == 0
        assert f.average_age_seconds == 50.0
        assert f.source == "freshness_aggregator"

    def test_negative_oldest_raises(self):
        with pytest.raises(ValidationError):
            Freshness(**{**self.MIN_VALID, "oldest_data_seconds": -1})

    def test_newest_older_than_oldest_still_valid(self):
        # The model does not enforce newest >= oldest — just check it stores correctly.
        f = Freshness(
            oldest_data_seconds=500,
            newest_data_seconds=100,
            average_age_seconds=300.0,
            confidence=0.95,
            freshness_seconds=30,
        )
        assert f.newest_data_seconds == 100
        assert f.oldest_data_seconds == 500


class TestSourceStatus:
    MIN_VALID = dict(
        source_name="OpenAQ",
        source_id="openaq-v1",
        status="healthy",
        confidence=0.99,
        consecutive_failures=0,
        cache_ttl_seconds=300,
    )

    def test_valid_model(self):
        s = SourceStatus(**self.MIN_VALID)
        assert s.source_name == "OpenAQ"
        assert s.status == "healthy"
        assert s.consecutive_failures == 0

    def test_invalid_status_stored_as_is(self):
        # The model does not constrain status to an enum — verify pass-through.
        s = SourceStatus(**{**self.MIN_VALID, "status": "unknown_value"})
        assert s.status == "unknown_value"

    def test_negative_consecutive_failures_raises(self):
        with pytest.raises(ValidationError):
            SourceStatus(**{**self.MIN_VALID, "consecutive_failures": -1})

    def test_negative_cache_ttl_raises(self):
        with pytest.raises(ValidationError):
            SourceStatus(**{**self.MIN_VALID, "cache_ttl_seconds": -1})

    def test_last_successful_fetch_defaults_none(self):
        s = SourceStatus(**self.MIN_VALID)
        assert s.last_successful_fetch is None

    def test_set_last_successful_fetch(self):
        dt = datetime(2026, 6, 4, tzinfo=timezone.utc)
        s = SourceStatus(**self.MIN_VALID, last_successful_fetch=dt)
        assert s.last_successful_fetch == dt
