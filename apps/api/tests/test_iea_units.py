from __future__ import annotations

from datetime import datetime, timezone
import sys
import types

import pytest

session_module = types.ModuleType("app.db.session")
session_module.SessionLocal = object
cache_module = types.ModuleType("app.services.cache")
cache_module.PriceCacheService = object
sys.modules.setdefault("app.db.session", session_module)
sys.modules.setdefault("app.services.cache", cache_module)

from adapters.iea import IEAAdapter, IEA_MONTHLY_LIMIT
from models.market_data import SourceStatus


def test_validate_accepts_supported_country_and_numeric_stock_days() -> None:
    adapter = IEAAdapter()

    assert adapter.validate({"country_iso": "de", "stock_days": "21.5"}) is True
    assert adapter.get_source_status() == ("healthy", 0.92, None)


@pytest.mark.parametrize(
    ("payload", "expected_error"),
    [
        ({"country_iso": "US", "stock_days": 20}, "INVALID_FORMAT"),
        ({"country_iso": "DE"}, "MISSING_FIELD"),
        ({"country_iso": "FR", "stock_days": 366}, "INVALID_RANGE"),
        ({"country_iso": "NL", "stock_days": "many"}, "INVALID_FORMAT"),
    ],
)
def test_validate_rejects_invalid_payloads_and_records_error(
    payload: dict[str, object], expected_error: str
) -> None:
    adapter = IEAAdapter()

    assert adapter.validate(payload) is False
    assert adapter._last_error_code == expected_error
    assert adapter.get_source_status() == ("degraded", 0.30, expected_error)


def test_transform_normalizes_payload_and_source_status() -> None:
    adapter = IEAAdapter(source_id="unit_iea")
    timestamp = datetime(2026, 1, 15, tzinfo=timezone.utc)
    source_status = SourceStatus(
        source_name="IEA Oil Market Report",
        source_id="unit_iea",
        status="healthy",
        confidence=0.91,
        last_successful_fetch=None,
        consecutive_failures=0,
        error_code=None,
        cache_ttl_seconds=adapter.cache_ttl_seconds,
    )

    coverage = adapter.transform(
        {
            "country_iso": " fr ",
            "stock_days": "24.25",
            "source": "custom_source",
            "freshness_seconds": "12",
            "source_status": source_status.model_dump(mode="python"),
            "timestamp": timestamp,
        }
    )

    assert coverage.country_iso == "FR"
    assert coverage.stock_days == 24.25
    assert coverage.source == "custom_source"
    assert coverage.confidence == 0.91
    assert coverage.freshness_seconds == 12
    assert coverage.source_status.source_id == "unit_iea"
    assert coverage.timestamp is timestamp


def test_extract_stock_days_finds_matching_nested_candidate() -> None:
    adapter = IEAAdapter()
    payload = {
        "data": [
            {"country_iso": "DE", "stock_days": "not-a-number"},
            {"country": "FR", "coverage_days": "25.75"},
            {"countryCode": "NL", "days": 18},
        ],
        "results": {"country_iso": "ES", "value": 19.5},
    }

    assert adapter._extract_stock_days(payload, "FR") == 25.75
    assert adapter._extract_stock_days(payload, "NL") == 18.0
    assert adapter._extract_stock_days(payload, "ES") == 19.5
    assert adapter._extract_stock_days(payload, "PL") is None


def test_fetch_stock_days_rate_limit_returns_degraded_static_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    adapter = IEAAdapter()
    cache_writes: list[tuple[str, float, str | None]] = []

    monkeypatch.setenv("IEA_API_KEY", "unit-test-key")
    monkeypatch.setattr(adapter, "_get_cached_coverage", lambda country_iso: None)
    monkeypatch.setattr(adapter, "_get_usage_count", lambda month_key: IEA_MONTHLY_LIMIT)
    monkeypatch.setattr(
        adapter,
        "_set_cached_coverage",
        lambda country_iso, coverage: cache_writes.append(
            (country_iso, coverage.stock_days, coverage.error_code)
        ),
    )

    coverage = adapter.fetch_stock_days_coverage("pl")

    assert coverage.country_iso == "PL"
    assert coverage.stock_days == 17.0
    assert coverage.error_code == "RATE_LIMIT"
    assert coverage.confidence == 0.30
    assert coverage.source_status.status == "degraded"
    assert coverage.source_status.error_code == "RATE_LIMIT"
    assert adapter.get_source_status() == ("degraded", 0.30, "RATE_LIMIT")
    assert cache_writes == [("PL", 17.0, "RATE_LIMIT")]
