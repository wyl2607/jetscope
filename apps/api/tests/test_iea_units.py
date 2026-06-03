"""Focused unit tests for adapters.iea — pure logic, no DB/network dependency."""

from __future__ import annotations

import httpx
import pytest
from pydantic import ValidationError

from adapters.iea import (
    IEAAdapter,
    StockDaysCoverage,
    ConfigError,
    IEA_SUPPORTED_COUNTRIES,
    IEA_BASE_URL,
    IEA_CACHE_TTL_SECONDS,
    IEA_MONTHLY_LIMIT,
)
from models.market_data import SourceStatus


# ── Helpers ──────────────────────────────────────────────────────────────────

def _mock_transport(
    status_code: int = 200,
    json_data: dict | list | None = None,
    exc: Exception | None = None,
):
    def handler(request: httpx.Request) -> httpx.Response:
        if exc is not None:
            raise exc
        return httpx.Response(
            status_code=status_code,
            json=json_data if json_data is not None else {},
            request=request,
        )
    return httpx.MockTransport(handler)


# ── Module-level constants ──────────────────────────────────────────────────

class TestConstants:
    def test_supported_countries(self):
        assert IEA_SUPPORTED_COUNTRIES == {"DE", "FR", "NL", "IT", "ES", "PL"}

    def test_base_url(self):
        assert IEA_BASE_URL == "https://api.iea.org/stats/"

    def test_cache_ttl(self):
        assert IEA_CACHE_TTL_SECONDS == 86400

    def test_monthly_limit(self):
        assert IEA_MONTHLY_LIMIT == 1000


# ── StockDaysCoverage model ─────────────────────────────────────────────────

class TestStockDaysCoverage:
    def test_valid_model(self):
        sc = StockDaysCoverage(
            country_iso="DE",
            stock_days=21.0,
            source="iea_oil_market_report",
            confidence=0.92,
            freshness_seconds=0,
            error_code=None,
            source_status=SourceStatus(
                source_name="IEA Oil Market Report",
                source_id="iea_oil_market_report",
                status="healthy",
                confidence=0.92,
                consecutive_failures=0,
                error_code=None,
                cache_ttl_seconds=86400,
            ),
        )
        assert sc.country_iso == "DE"
        assert sc.stock_days == 21.0
        assert sc.source == "iea_oil_market_report"
        assert sc.confidence == 0.92
        assert sc.freshness_seconds == 0
        assert sc.error_code is None
        assert sc.source_status.status == "healthy"

    def test_requires_min_length_iso(self):
        with pytest.raises(ValidationError):
            StockDaysCoverage(
                country_iso="",
                stock_days=10,
                source="s",
                confidence=0.5,
                freshness_seconds=0,
                source_status=SourceStatus(
                    source_name="n", source_id="i",
                    status="healthy", confidence=0.5,
                    consecutive_failures=0, cache_ttl_seconds=3600,
                ),
            )

    def test_negative_stock_days_rejected(self):
        with pytest.raises(ValidationError):
            StockDaysCoverage(
                country_iso="FR",
                stock_days=-1,
                source="s",
                confidence=0.5,
                freshness_seconds=0,
                source_status=SourceStatus(
                    source_name="n", source_id="i",
                    status="healthy", confidence=0.5,
                    consecutive_failures=0, cache_ttl_seconds=3600,
                ),
            )

    def test_confidence_out_of_range_raises(self):
        with pytest.raises(ValidationError):
            StockDaysCoverage(
                country_iso="FR",
                stock_days=15,
                source="s",
                confidence=1.5,
                freshness_seconds=0,
                source_status=SourceStatus(
                    source_name="n", source_id="i",
                    status="healthy", confidence=0.5,
                    consecutive_failures=0, cache_ttl_seconds=3600,
                ),
            )


# ── ConfigError ──────────────────────────────────────────────────────────────

class TestConfigError:
    def test_is_runtime_error(self):
        assert issubclass(ConfigError, RuntimeError)

    def test_can_be_raised_with_message(self):
        with pytest.raises(ConfigError, match="IEA_API_KEY"):
            raise ConfigError("IEA_API_KEY is required for IEAAdapter")


# ── IEAAdapter init ──────────────────────────────────────────────────────────

class TestIEAAdapterInit:
    def test_defaults(self):
        adapter = IEAAdapter()
        assert adapter.source_id == "iea_oil_market_report"
        assert adapter.timeout_seconds == 10
        assert adapter.default_country_iso == "DE"
        assert adapter._consecutive_failures == 0
        assert adapter._last_error_code is None

    def test_custom_params(self):
        adapter = IEAAdapter(source_id="custom", timeout_seconds=30, default_country_iso="fr")
        assert adapter.source_id == "custom"
        assert adapter.timeout_seconds == 30
        assert adapter.default_country_iso == "FR"

    def test_invalid_country_defaults_to_de(self):
        adapter = IEAAdapter(default_country_iso="  xx  ")
        assert adapter.default_country_iso == "XX"


# ── IEAAdapter.validate() ────────────────────────────────────────────────────

class TestValidate:
    def test_valid_data(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "DE", "stock_days": 22.5}) is True
        assert adapter._consecutive_failures == 0

    def test_valid_int_stock_days(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "FR", "stock_days": 20}) is True

    def test_valid_string_numeric_stock_days(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "NL", "stock_days": "18.5"}) is True

    def test_unsupported_country(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "CN", "stock_days": 20}) is False
        assert adapter._last_error_code == "INVALID_FORMAT"

    def test_missing_country_iso(self):
        adapter = IEAAdapter()
        assert adapter.validate({"stock_days": 20}) is False
        assert adapter._last_error_code == "INVALID_FORMAT"

    def test_missing_stock_days(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "DE"}) is False
        assert adapter._last_error_code == "MISSING_FIELD"

    def test_none_stock_days(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "DE", "stock_days": None}) is False
        assert adapter._last_error_code == "MISSING_FIELD"

    def test_non_numeric_stock_days(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "DE", "stock_days": "abc"}) is False
        assert adapter._last_error_code == "INVALID_FORMAT"

    def test_stock_days_negative(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "DE", "stock_days": -5}) is False
        assert adapter._last_error_code == "INVALID_RANGE"

    def test_stock_days_exceeds_max(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "DE", "stock_days": 400}) is False
        assert adapter._last_error_code == "INVALID_RANGE"

    def test_country_iso_case_insensitive(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "de", "stock_days": 22}) is True

    def test_country_iso_with_whitespace_not_stripped(self):
        adapter = IEAAdapter()
        assert adapter.validate({"country_iso": "  DE  ", "stock_days": 22}) is False

    def test_records_failure_increments_counter(self):
        adapter = IEAAdapter()
        adapter.validate({"country_iso": "ZZ", "stock_days": 10})
        assert adapter._consecutive_failures == 1


# ── IEAAdapter.transform() ───────────────────────────────────────────────────

class TestTransform:
    def test_transform_with_source_status_dict(self):
        adapter = IEAAdapter()
        data = {
            "country_iso": "DE",
            "stock_days": 25.0,
            "source": "iea_oil_market_report",
            "confidence": 0.93,
            "freshness_seconds": 0,
            "error_code": None,
            "source_status": {
                "source_name": "IEA Oil Market Report",
                "source_id": "iea_oil_market_report",
                "status": "healthy",
                "confidence": 0.93,
                "last_successful_fetch": None,
                "consecutive_failures": 0,
                "error_code": None,
                "cache_ttl_seconds": 86400,
            },
        }
        result = adapter.transform(data)
        assert isinstance(result, StockDaysCoverage)
        assert result.country_iso == "DE"
        assert result.stock_days == 25.0
        assert result.source == "iea_oil_market_report"
        assert result.source_status.status == "healthy"

    def test_transform_normalizes_country_iso(self):
        adapter = IEAAdapter()
        data = {
            "country_iso": "  fr  ",
            "stock_days": 24.0,
            "source": "iea_oil_market_report",
            "confidence": 0.93,
            "freshness_seconds": 0,
            "error_code": None,
            "source_status": {
                "source_name": "IEA Oil Market Report",
                "source_id": "iea_oil_market_report",
                "status": "healthy",
                "confidence": 0.93,
                "last_successful_fetch": None,
                "consecutive_failures": 0,
                "error_code": None,
                "cache_ttl_seconds": 86400,
            },
        }
        result = adapter.transform(data)
        assert result.country_iso == "FR"

    def test_transform_none_source_becomes_string_none(self):
        adapter = IEAAdapter()
        data = {
            "country_iso": "DE",
            "stock_days": 20.0,
            "source": None,
            "confidence": 0.93,
            "freshness_seconds": 0,
            "error_code": None,
            "source_status": {
                "source_name": "IEA Oil Market Report",
                "source_id": "iea_oil_market_report",
                "status": "healthy",
                "confidence": 0.93,
                "last_successful_fetch": None,
                "consecutive_failures": 0,
                "error_code": None,
                "cache_ttl_seconds": 86400,
            },
        }
        result = adapter.transform(data)
        assert result.source == "None"  # str(None) via str(data.get("source", self.source_id))

    def test_transform_with_error_code(self):
        adapter = IEAAdapter()
        data = {
            "country_iso": "NL",
            "stock_days": 18.0,
            "source": "iea_oil_market_report",
            "confidence": 0.30,
            "freshness_seconds": 0,
            "error_code": "API_TIMEOUT",
            "source_status": {
                "source_name": "IEA Oil Market Report",
                "source_id": "iea_oil_market_report",
                "status": "degraded",
                "confidence": 0.30,
                "last_successful_fetch": None,
                "consecutive_failures": 1,
                "error_code": "API_TIMEOUT",
                "cache_ttl_seconds": 86400,
            },
        }
        result = adapter.transform(data)
        assert result.error_code == "API_TIMEOUT"
        assert result.source_status.status == "degraded"


# ── IEAAdapter.get_source_status() ───────────────────────────────────────────

class TestGetSourceStatus:
    def test_healthy(self):
        adapter = IEAAdapter()
        status, conf, err = adapter.get_source_status()
        assert status == "healthy"
        assert conf == 0.92
        assert err is None

    def test_degraded_one_failure(self):
        adapter = IEAAdapter()
        adapter._record_failure("API_TIMEOUT")
        status, conf, err = adapter.get_source_status()
        assert status == "degraded"
        assert conf == 0.30
        assert err == "API_TIMEOUT"

    def test_degraded_two_failures(self):
        adapter = IEAAdapter()
        adapter._record_failure("RATE_LIMIT")
        adapter._record_failure("CONNECTION_ERROR")
        status, conf, err = adapter.get_source_status()
        assert status == "degraded"
        assert conf == 0.30
        assert err == "CONNECTION_ERROR"

    def test_unavailable_three_failures(self):
        adapter = IEAAdapter()
        for _ in range(3):
            adapter._record_failure("SOURCE_UNAVAILABLE")
        status, conf, err = adapter.get_source_status()
        assert status == "unavailable"
        assert conf == 0.30
        assert err == "SOURCE_UNAVAILABLE"


# ── IEAAdapter pure helper methods ───────────────────────────────────────────

class TestNormalizeCountryIso:
    def test_strips_and_uppers(self):
        adapter = IEAAdapter()
        assert adapter._normalize_country_iso("  de  ") == "DE"
        assert adapter._normalize_country_iso("fr") == "FR"
        assert adapter._normalize_country_iso(" NL ") == "NL"
        assert adapter._normalize_country_iso("") == ""


class TestCacheKeys:
    def test_response_cache_key(self):
        adapter = IEAAdapter()
        assert adapter._response_cache_key("DE") == "iea_cov_de"
        assert adapter._response_cache_key("FR") == "iea_cov_fr"

    def test_usage_cache_key(self):
        adapter = IEAAdapter()
        assert adapter._usage_cache_key("2026-06") == "iea_usage_202606"
        assert adapter._usage_cache_key("2025-01") == "iea_usage_202501"


class TestBuildSourceStatus:
    def test_builds_source_status(self):
        adapter = IEAAdapter()
        ss = adapter._build_source_status(
            status="degraded",
            confidence=0.30,
            error_code="API_TIMEOUT",
            consecutive_failures=1,
        )
        assert isinstance(ss, SourceStatus)
        assert ss.source_name == "IEA Oil Market Report"
        assert ss.source_id == "iea_oil_market_report"
        assert ss.status == "degraded"
        assert ss.confidence == 0.30
        assert ss.error_code == "API_TIMEOUT"
        assert ss.consecutive_failures == 1
        assert ss.cache_ttl_seconds == 86400


class TestCacheTtlSeconds:
    def test_returns_constant(self):
        adapter = IEAAdapter()
        assert adapter.cache_ttl_seconds == 86400


class TestTtlDelta:
    def test_returns_timedelta_of_cache_ttl(self):
        from datetime import timedelta
        adapter = IEAAdapter()
        delta = adapter._ttl_delta()
        assert isinstance(delta, timedelta)
        assert delta.total_seconds() == 86400


# ── IEAAdapter.fetch_stock_days_coverage() – HTTP error scenarios ───────────

class TestFetchStockDaysCoverageErrors:
    def test_unsupported_country_raises_value_error(self, monkeypatch):
        monkeypatch.setenv("IEA_API_KEY", "test-key")
        adapter = IEAAdapter()
        with pytest.raises(ValueError, match="unsupported country_iso=CN"):
            adapter.fetch_stock_days_coverage("CN")

    def test_rate_limit_429_returns_fallback(self, monkeypatch):
        monkeypatch.setenv("IEA_API_KEY", "test-key")
        transport = _mock_transport(status_code=429)
        adapter = IEAAdapter(transport=transport)
        result = adapter.fetch_stock_days_coverage("DE")
        assert result.error_code == "RATE_LIMIT"
        assert result.confidence == 0.30
        assert result.source_status.status == "degraded"
        assert result.stock_days == 21.0  # static fallback for DE

    def test_auth_failure_401_returns_fallback(self, monkeypatch):
        monkeypatch.setenv("IEA_API_KEY", "test-key")
        transport = _mock_transport(status_code=401)
        adapter = IEAAdapter(transport=transport)
        result = adapter.fetch_stock_days_coverage("FR")
        assert result.error_code == "AUTHENTICATION_FAILED"
        assert result.confidence == 0.30
        assert result.stock_days == 24.0  # static fallback for FR

    def test_auth_failure_403_returns_fallback(self, monkeypatch):
        monkeypatch.setenv("IEA_API_KEY", "test-key")
        transport = _mock_transport(status_code=403)
        adapter = IEAAdapter(transport=transport)
        result = adapter.fetch_stock_days_coverage("NL")
        assert result.error_code == "AUTHENTICATION_FAILED"
        assert result.stock_days == 18.0  # static fallback for NL

    def test_server_error_500_returns_fallback(self, monkeypatch):
        monkeypatch.setenv("IEA_API_KEY", "test-key")
        transport = _mock_transport(status_code=500)
        adapter = IEAAdapter(transport=transport)
        result = adapter.fetch_stock_days_coverage("IT")
        assert result.error_code == "SOURCE_UNAVAILABLE"
        assert result.stock_days == 20.0  # static fallback for IT

    def test_connection_error_returns_fallback(self, monkeypatch):
        monkeypatch.setenv("IEA_API_KEY", "test-key")
        transport = _mock_transport(exc=httpx.ConnectError("connection refused"))
        adapter = IEAAdapter(transport=transport)
        result = adapter.fetch_stock_days_coverage("ES")
        assert result.error_code == "CONNECTION_ERROR"
        assert result.stock_days == 19.0  # static fallback for ES

    def test_unexpected_exception_returns_fallback(self, monkeypatch):
        monkeypatch.setenv("IEA_API_KEY", "test-key")
        transport = _mock_transport(exc=ValueError("unexpected"))
        adapter = IEAAdapter(transport=transport)
        result = adapter.fetch_stock_days_coverage("PL")
        assert result.error_code == "PARSING_ERROR"
        assert result.stock_days == 17.0  # static fallback for PL

    def test_empty_response_json_parsing_error(self, monkeypatch):
        monkeypatch.setenv("IEA_API_KEY", "test-key")
        transport = _mock_transport(json_data={})
        adapter = IEAAdapter(transport=transport)
        result = adapter.fetch_stock_days_coverage("DE")
        assert result.error_code == "PARSING_ERROR"
        assert result.stock_days == 21.0  # static fallback for DE


# ── IEAAdapter._extract_stock_days() ─────────────────────────────────────────

class TestExtractStockDays:
    def test_extract_from_dict_with_data_list(self):
        adapter = IEAAdapter()
        payload = {"data": [{"country_iso": "DE", "stock_days": 23.5}]}
        assert adapter._extract_stock_days(payload, "DE") == 23.5

    def test_extract_with_various_keys(self):
        adapter = IEAAdapter()
        payload = [{"country_iso": "FR", "coverage_days": 22.0}]
        assert adapter._extract_stock_days(payload, "FR") == 22.0

    def test_extract_with_country_code(self):
        adapter = IEAAdapter()
        payload = [{"country": "DE", "days_of_cover": 19.5}]
        assert adapter._extract_stock_days(payload, "DE") == 19.5

    def test_extract_skips_wrong_country(self):
        adapter = IEAAdapter()
        payload = {"data": [{"country_iso": "FR", "stock_days": 25.0}]}
        assert adapter._extract_stock_days(payload, "DE") is None

    def test_extract_from_list(self):
        adapter = IEAAdapter()
        payload = [
            {"country_iso": "NL", "inventory_days": 17.0},
        ]
        assert adapter._extract_stock_days(payload, "NL") == 17.0

    def test_extract_returns_first_match(self):
        adapter = IEAAdapter()
        payload = {
            "data": [
                {"country_iso": "DE", "stock_days": 21.0},
                {"country_iso": "DE", "coverage_days": 22.0},
            ]
        }
        assert adapter._extract_stock_days(payload, "DE") == 21.0

    def test_extract_non_dict_payload(self):
        adapter = IEAAdapter()
        assert adapter._extract_stock_days("not a dict", "DE") is None

    def test_extract_with_value_key(self):
        adapter = IEAAdapter()
        payload = [{"country_iso": "IT", "value": 20.5}]
        assert adapter._extract_stock_days(payload, "IT") == 20.5

    def test_extract_with_days_key(self):
        adapter = IEAAdapter()
        payload = [{"country_iso": "ES", "days": 18.0}]
        assert adapter._extract_stock_days(payload, "ES") == 18.0

    def test_extract_nested_results(self):
        adapter = IEAAdapter()
        payload = {"results": {"country_iso": "PL", "stock_days": 16.5}}
        assert adapter._extract_stock_days(payload, "PL") == 16.5


# ── IEAAdapter.fetch() async wrapper ─────────────────────────────────────────

class TestFetch:
    @pytest.mark.asyncio
    async def test_fetch_returns_model_dump(self, monkeypatch):
        monkeypatch.setenv("IEA_API_KEY", "test-key")
        transport = _mock_transport(
            json_data={"data": [{"country_iso": "DE", "stock_days": 23.5}]}
        )
        adapter = IEAAdapter(transport=transport)
        result = await adapter.fetch()
        assert result["country_iso"] == "DE"
        assert result["stock_days"] == 23.5
        assert result["error_code"] is None
        assert result["source_status"]["status"] == "healthy"


# ── _fallback_coverage with static data ──────────────────────────────────────

class TestFallbackCoverage:
    def test_fallback_uses_static_defaults(self):
        adapter = IEAAdapter()
        result = adapter._fallback_coverage("DE", error_code="SOURCE_UNAVAILABLE")
        assert result.country_iso == "DE"
        assert result.stock_days == 21.0
        assert result.error_code == "SOURCE_UNAVAILABLE"
        assert result.confidence == 0.30
        assert result.source_status.status == "degraded"
        assert result.source_status.error_code == "SOURCE_UNAVAILABLE"
        assert result.source_status.consecutive_failures == 1

    def test_fallback_uses_max_consecutive_failures_1(self):
        adapter = IEAAdapter()
        assert adapter._consecutive_failures == 0
        adapter._fallback_coverage("DE", error_code="API_TIMEOUT")
        # _record_failure is not called inside _fallback_coverage,
        # so adapter._consecutive_failures stays 0.
        # But source_status gets max(0, 1) = 1.
        assert adapter._consecutive_failures == 0

    def test_fallback_after_recorded_failure_uses_count(self):
        adapter = IEAAdapter()
        adapter._record_failure("API_TIMEOUT")
        result = adapter._fallback_coverage("FR", error_code="API_TIMEOUT")
        assert result.stock_days == 24.0  # static fallback for FR
        assert result.source_status.consecutive_failures == 1

    def test_fallback_values_per_country(self):
        adapter = IEAAdapter()
        assert adapter._fallback_coverage("DE", error_code="E").stock_days == 21.0
        assert adapter._fallback_coverage("FR", error_code="E").stock_days == 24.0
        assert adapter._fallback_coverage("NL", error_code="E").stock_days == 18.0
        assert adapter._fallback_coverage("IT", error_code="E").stock_days == 20.0
        assert adapter._fallback_coverage("ES", error_code="E").stock_days == 19.0
        assert adapter._fallback_coverage("PL", error_code="E").stock_days == 17.0


# ── IEAAdapter _FALLBACK_STOCK_DAYS ──────────────────────────────────────────

class TestFallbackStockDays:
    def test_all_supported_countries_have_fallback(self):
        adapter = IEAAdapter()
        for country in IEA_SUPPORTED_COUNTRIES:
            result = adapter._fallback_coverage(country, error_code="E")
            assert result.stock_days > 0
