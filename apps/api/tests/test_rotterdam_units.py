"""Focused unit tests for RotterdamAdapter.

Covers parsing, validation edge cases, transform, status reporting,
and mocked async fetch — complementing the broader test_adapters.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from adapters.rotterdam import (
    OPENAQ_BASE_URL,
    PM25_MAX,
    NO2_MAX,
    ROTTERDAM_CACHE_TTL,
    WIND_SPEED_MAX,
    RotterdamAdapter,
)
from models.market_data import RotterdamEmissions


# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

class TestRotterdamConstants:
    """Module-level constants should be stable."""

    def test_openaq_base_url(self) -> None:
        assert OPENAQ_BASE_URL == "https://api.openaq.org/v2"

    def test_range_limits(self) -> None:
        assert PM25_MAX == 500.0
        assert NO2_MAX == 1000.0
        assert WIND_SPEED_MAX == 50.0

    def test_cache_ttl(self) -> None:
        assert ROTTERDAM_CACHE_TTL == 600


# ---------------------------------------------------------------------------
# _parse_response
# ---------------------------------------------------------------------------

class TestRotterdamParseResponse:
    """_parse_response extracts values from OpenAQ JSON shapes."""

    def test_full(self) -> None:
        adapter = RotterdamAdapter()
        response = {
            "results": [
                {
                    "measurements": [
                        {"parameter": "pm25", "value": 15.3},
                        {"parameter": "no2", "value": 42.1},
                    ]
                }
            ]
        }
        result = adapter._parse_response(response)
        assert result == {
            "pm25_ugm3": 15.3,
            "no2_ppb": 42.1,
            "wind_speed_ms": None,
        }

    def test_pm25_only(self) -> None:
        adapter = RotterdamAdapter()
        response = {
            "results": [
                {"measurements": [{"parameter": "pm25", "value": 10.0}]}
            ]
        }
        result = adapter._parse_response(response)
        assert result["pm25_ugm3"] == 10.0
        assert result["no2_ppb"] is None

    def test_no2_only(self) -> None:
        adapter = RotterdamAdapter()
        response = {
            "results": [
                {"measurements": [{"parameter": "no2", "value": 30.5}]}
            ]
        }
        result = adapter._parse_response(response)
        assert result["no2_ppb"] == 30.5
        assert result["pm25_ugm3"] is None

    def test_empty_results_list(self) -> None:
        adapter = RotterdamAdapter()
        result = adapter._parse_response({"results": []})
        assert result == {"pm25_ugm3": None, "no2_ppb": None, "wind_speed_ms": None}

    def test_no_measurements_key(self) -> None:
        adapter = RotterdamAdapter()
        result = adapter._parse_response({"results": [{"location": "Rotterdam"}]})
        assert result["pm25_ugm3"] is None
        assert result["no2_ppb"] is None

    def test_skips_none_value(self) -> None:
        """Measurement with value=None should not overwrite the key."""
        adapter = RotterdamAdapter()
        response = {
            "results": [
                {
                    "measurements": [
                        {"parameter": "pm25", "value": None},
                        {"parameter": "no2", "value": 20.0},
                    ]
                }
            ]
        }
        result = adapter._parse_response(response)
        assert result["pm25_ugm3"] is None
        assert result["no2_ppb"] == 20.0


# ---------------------------------------------------------------------------
# validate — edge cases not covered in test_adapters.py
# ---------------------------------------------------------------------------

class TestRotterdamValidateEdgeCases:
    """Boundary / negative / all-None validation."""

    def test_negative_pm25_fails(self) -> None:
        adapter = RotterdamAdapter()
        assert adapter.validate({"pm25_ugm3": -1.0}) is False
        assert adapter._last_error_code == "INVALID_RANGE"

    def test_negative_no2_fails(self) -> None:
        adapter = RotterdamAdapter()
        assert adapter.validate({"no2_ppb": -5.0}) is False
        assert adapter._last_error_code == "INVALID_RANGE"

    def test_negative_wind_fails(self) -> None:
        adapter = RotterdamAdapter()
        assert adapter.validate({"wind_speed_ms": -0.1}) is False
        assert adapter._last_error_code == "INVALID_RANGE"

    def test_pm25_at_max_boundary(self) -> None:
        adapter = RotterdamAdapter()
        assert adapter.validate({"pm25_ugm3": PM25_MAX}) is True

    def test_pm25_over_max_fails(self) -> None:
        adapter = RotterdamAdapter()
        assert adapter.validate({"pm25_ugm3": PM25_MAX + 0.1}) is False
        assert adapter._last_error_code == "INVALID_RANGE"

    def test_no2_over_max_fails(self) -> None:
        adapter = RotterdamAdapter()
        assert adapter.validate({"no2_ppb": NO2_MAX + 1}) is False
        assert adapter._last_error_code == "INVALID_RANGE"

    def test_wind_over_max_fails(self) -> None:
        adapter = RotterdamAdapter()
        assert adapter.validate({"wind_speed_ms": WIND_SPEED_MAX + 1}) is False
        assert adapter._last_error_code == "INVALID_RANGE"

    def test_all_none_values_fails(self) -> None:
        adapter = RotterdamAdapter()
        data = {"pm25_ugm3": None, "no2_ppb": None, "wind_speed_ms": None}
        assert adapter.validate(data) is False
        assert adapter._last_error_code == "MISSING_FIELD"

    def test_missing_keys_allows_partial(self) -> None:
        """Only one field populated is acceptable."""
        adapter = RotterdamAdapter()
        assert adapter.validate({"pm25_ugm3": 10.0}) is True


# ---------------------------------------------------------------------------
# transform
# ---------------------------------------------------------------------------

class TestRotterdamTransform:
    """Confidence calculation, source passthrough, freshness edge."""

    def test_all_three_metrics_caps_at_0_98(self) -> None:
        adapter = RotterdamAdapter()
        adapter._last_fetch_time = datetime.now(timezone.utc)
        data = {"pm25_ugm3": 12.5, "no2_ppb": 30.0, "wind_speed_ms": 5.0}
        result = adapter.transform(data)
        # 0.85 + 3×0.05 = 1.0 → capped at 0.98
        assert result.confidence == 0.98

    def test_no_metrics_min_confidence(self) -> None:
        adapter = RotterdamAdapter()
        data = {"pm25_ugm3": None, "no2_ppb": None, "wind_speed_ms": None}
        result = adapter.transform(data)
        assert result.confidence == 0.85

    def test_one_metric(self) -> None:
        adapter = RotterdamAdapter()
        data = {"pm25_ugm3": 10.0, "no2_ppb": None, "wind_speed_ms": None}
        result = adapter.transform(data)
        assert result.pm25_ugm3 == 10.0
        assert result.no2_ppb is None
        assert result.wind_speed_ms is None
        assert result.confidence == 0.90  # 0.85 + 0.05

    def test_two_metrics(self) -> None:
        adapter = RotterdamAdapter()
        data = {"pm25_ugm3": 8.0, "no2_ppb": 20.0, "wind_speed_ms": None}
        result = adapter.transform(data)
        assert result.confidence == 0.95  # 0.85 + 2×0.05

    def test_source_and_error_code(self) -> None:
        adapter = RotterdamAdapter(source_id="custom_id")
        data = {"pm25_ugm3": 5.0, "no2_ppb": None, "wind_speed_ms": None}
        result = adapter.transform(data)
        assert result.source == "custom_id"
        assert result.error_code is None

    def test_freshness_clamped_non_negative(self) -> None:
        """When _last_fetch_time is None, freshness is -1 → clamp to 0."""
        adapter = RotterdamAdapter()
        data = {"pm25_ugm3": 5.0, "no2_ppb": None, "wind_speed_ms": None}
        result = adapter.transform(data)
        assert result.freshness_seconds == 0


# ---------------------------------------------------------------------------
# get_source_status
# ---------------------------------------------------------------------------

class TestRotterdamGetSourceStatus:
    """All three status tiers."""

    def test_healthy(self) -> None:
        adapter = RotterdamAdapter()
        status, conf, error = adapter.get_source_status()
        assert status == "healthy"
        assert conf == 0.96
        assert error is None

    def test_degraded_one_failure(self) -> None:
        adapter = RotterdamAdapter()
        adapter._consecutive_failures = 1
        adapter._last_error_code = "API_TIMEOUT"
        status, conf, error = adapter.get_source_status()
        assert status == "degraded"
        assert conf == 0.70
        assert error == "API_TIMEOUT"

    def test_degraded_two_failures(self) -> None:
        adapter = RotterdamAdapter()
        adapter._consecutive_failures = 2
        status, conf, error = adapter.get_source_status()
        assert status == "degraded"

    def test_unavailable_three_failures(self) -> None:
        adapter = RotterdamAdapter()
        adapter._consecutive_failures = 3
        adapter._last_error_code = "CONNECTION_ERROR"
        status, conf, error = adapter.get_source_status()
        assert status == "unavailable"
        assert conf == 0.30
        assert error == "CONNECTION_ERROR"

    def test_unavailable_many_failures(self) -> None:
        adapter = RotterdamAdapter()
        adapter._consecutive_failures = 10
        status, conf, error = adapter.get_source_status()
        assert status == "unavailable"


# ---------------------------------------------------------------------------
# cache_ttl_seconds
# ---------------------------------------------------------------------------

class TestRotterdamCacheTTL:
    """Property returns the module constant."""

    def test_matches_constant(self) -> None:
        adapter = RotterdamAdapter()
        assert adapter.cache_ttl_seconds == ROTTERDAM_CACHE_TTL
        assert adapter.cache_ttl_seconds == 600


# ---------------------------------------------------------------------------
# fetch — mocked httpx
# ---------------------------------------------------------------------------

class TestRotterdamFetch:
    """Async fetch with various httpx responses."""

    @pytest.mark.asyncio
    async def test_success(self) -> None:
        adapter = RotterdamAdapter()
        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.json.return_value = {
            "results": [
                {
                    "measurements": [
                        {"parameter": "pm25", "value": 12.3},
                        {"parameter": "no2", "value": 35.0},
                    ]
                }
            ]
        }

        client = AsyncMock(spec=httpx.AsyncClient)
        client.__aenter__.return_value = client
        client.get.return_value = mock_resp

        with patch("adapters.rotterdam.httpx.AsyncClient", return_value=client):
            result = await adapter.fetch()

        assert result["pm25_ugm3"] == 12.3
        assert result["no2_ppb"] == 35.0
        assert result["wind_speed_ms"] is None

    @pytest.mark.asyncio
    async def test_no_results_returns_empty(self) -> None:
        adapter = RotterdamAdapter()
        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.json.return_value = {"results": []}

        client = AsyncMock(spec=httpx.AsyncClient)
        client.__aenter__.return_value = client
        client.get.return_value = mock_resp

        with patch("adapters.rotterdam.httpx.AsyncClient", return_value=client):
            result = await adapter.fetch()

        assert result == {}
        assert adapter._consecutive_failures == 1
        assert adapter._last_error_code == "PARSING_ERROR"

    @pytest.mark.asyncio
    async def test_timeout_returns_empty(self) -> None:
        adapter = RotterdamAdapter()
        client = AsyncMock(spec=httpx.AsyncClient)
        client.__aenter__.return_value = client
        client.get.side_effect = httpx.TimeoutException("timed out")

        with patch("adapters.rotterdam.httpx.AsyncClient", return_value=client):
            result = await adapter.fetch()

        assert result == {}
        assert adapter._consecutive_failures == 1
        assert adapter._last_error_code == "API_TIMEOUT"

    @pytest.mark.asyncio
    async def test_http_error_returns_empty(self) -> None:
        adapter = RotterdamAdapter()
        client = AsyncMock(spec=httpx.AsyncClient)
        client.__aenter__.return_value = client
        client.get.side_effect = httpx.HTTPError("500 server error")

        with patch("adapters.rotterdam.httpx.AsyncClient", return_value=client):
            result = await adapter.fetch()

        assert result == {}
        assert adapter._consecutive_failures == 1
        assert adapter._last_error_code == "CONNECTION_ERROR"

    @pytest.mark.asyncio
    async def test_unexpected_exception_returns_empty(self) -> None:
        adapter = RotterdamAdapter()
        client = AsyncMock(spec=httpx.AsyncClient)
        client.__aenter__.return_value = client
        client.get.side_effect = ValueError("weird error")

        with patch("adapters.rotterdam.httpx.AsyncClient", return_value=client):
            result = await adapter.fetch()

        assert result == {}
        assert adapter._consecutive_failures == 1
        assert adapter._last_error_code == "PARSING_ERROR"
