from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from adapters import rotterdam as rotterdam_module
from adapters.rotterdam import RotterdamAdapter
from models.market_data import RotterdamEmissions


def test_parse_response_extracts_air_quality_values_and_keeps_wind_unset():
    adapter = RotterdamAdapter()

    parsed = adapter._parse_response(
        {
            "results": [
                {
                    "measurements": [
                        {"parameter": "pm25", "value": 14.2},
                        {"parameter": "no2", "value": 31.7},
                        {"parameter": "temperature", "value": 18.0},
                    ]
                },
                {"measurements": [{"parameter": "pm25", "value": None}]},
            ]
        }
    )

    assert parsed == {
        "pm25_ugm3": 14.2,
        "no2_ppb": 31.7,
        "wind_speed_ms": None,
    }


@pytest.mark.parametrize(
    ("data", "expected_error"),
    [
        ({}, "MISSING_FIELD"),
        ({"pm25_ugm3": None, "no2_ppb": None, "wind_speed_ms": None}, "MISSING_FIELD"),
        ({"pm25_ugm3": -0.1, "no2_ppb": None, "wind_speed_ms": None}, "INVALID_RANGE"),
        ({"pm25_ugm3": None, "no2_ppb": 1000.1, "wind_speed_ms": None}, "INVALID_RANGE"),
        ({"pm25_ugm3": None, "no2_ppb": None, "wind_speed_ms": 50.1}, "INVALID_RANGE"),
    ],
)
def test_validate_rejects_missing_and_out_of_range_values(data, expected_error):
    adapter = RotterdamAdapter()

    assert adapter.validate(data) is False
    assert adapter._consecutive_failures == 1
    assert adapter._last_error_code == expected_error


def test_validate_accepts_boundary_values_without_recording_failure():
    adapter = RotterdamAdapter()

    assert adapter.validate(
        {"pm25_ugm3": 500.0, "no2_ppb": 1000.0, "wind_speed_ms": 50.0}
    ) is True
    assert adapter._consecutive_failures == 0
    assert adapter._last_error_code is None


def test_transform_returns_rotterdam_emissions_with_metric_based_confidence():
    adapter = RotterdamAdapter(source_id="unit-test-source")
    adapter._last_fetch_time = datetime.now(timezone.utc)

    result = adapter.transform(
        {"pm25_ugm3": 8.5, "no2_ppb": 22.0, "wind_speed_ms": None}
    )

    assert isinstance(result, RotterdamEmissions)
    assert result.pm25_ugm3 == 8.5
    assert result.no2_ppb == 22.0
    assert result.wind_speed_ms is None
    assert result.source == "unit-test-source"
    assert result.confidence == 0.95
    assert result.freshness_seconds >= 0
    assert result.error_code is None


def test_status_becomes_unavailable_after_three_failures():
    adapter = RotterdamAdapter()
    adapter._record_failure("API_TIMEOUT")
    adapter._record_failure("CONNECTION_ERROR")
    adapter._record_failure("PARSING_ERROR")

    assert adapter.get_source_status() == ("unavailable", 0.30, "PARSING_ERROR")
    assert adapter.cache_ttl_seconds == 600


def test_fetch_uses_openaq_latest_endpoint_and_parses_results(monkeypatch):
    calls = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "results": [
                    {
                        "measurements": [
                            {"parameter": "pm25", "value": 11.1},
                            {"parameter": "no2", "value": 42.0},
                        ]
                    }
                ]
            }

    class FakeAsyncClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, params):
            calls.append({"url": url, "params": params, "timeout": self.timeout})
            return FakeResponse()

    monkeypatch.setattr(rotterdam_module.httpx, "AsyncClient", FakeAsyncClient)
    adapter = RotterdamAdapter(timeout_seconds=3)

    result = asyncio.run(adapter.fetch())

    assert result == {"pm25_ugm3": 11.1, "no2_ppb": 42.0, "wind_speed_ms": None}
    assert calls == [
        {
            "url": "https://api.openaq.org/v2/latest",
            "params": {"city": "Rotterdam", "parameter": ["pm25", "no2"], "limit": 10},
            "timeout": 3,
        }
    ]
    assert adapter._consecutive_failures == 0


def test_fetch_records_parsing_error_when_response_has_no_results(monkeypatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"results": []}

    class FakeAsyncClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, params):
            return FakeResponse()

    monkeypatch.setattr(rotterdam_module.httpx, "AsyncClient", FakeAsyncClient)
    adapter = RotterdamAdapter()

    assert asyncio.run(adapter.fetch()) == {}
    assert adapter._consecutive_failures == 1
    assert adapter._last_error_code == "PARSING_ERROR"
