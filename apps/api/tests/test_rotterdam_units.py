from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx
import pytest

from adapters import rotterdam as rotterdam_module
from adapters.rotterdam import RotterdamAdapter
from models.market_data import RotterdamEmissions


def test_parse_response_extracts_v3_latest_values_and_keeps_wind_unset():
    adapter = RotterdamAdapter()

    parsed = adapter._parse_response(
        {
            "results": [
                {
                    "datetime": {"utc": "2026-07-29T10:00:00Z"},
                    "value": 14.2,
                    "sensorsId": 101,
                    "locationsId": 9,
                },
                {
                    "datetime": {"utc": "2026-07-29T10:00:00Z"},
                    "value": 31.7,
                    "sensorsId": 102,
                    "locationsId": 9,
                    "units": "ppb",
                },
                {
                    "datetime": {"utc": "2026-07-29T10:00:00Z"},
                    "value": 18.0,
                    "sensorsId": 103,
                    "locationsId": 9,
                },
            ],
            "sensor_parameter_by_id": {
                101: "pm25",
                102: "no2",
                103: "temperature",
            },
        }
    )

    assert parsed["pm25_ugm3"] == 14.2
    assert parsed["no2_ppb"] == 31.7
    assert parsed["wind_speed_ms"] is None
    assert parsed["observed_at"] == "2026-07-29T10:00:00Z"


def test_parse_response_still_accepts_legacy_v2_grouped_measurements():
    adapter = RotterdamAdapter()

    parsed = adapter._parse_response(
        {
            "results": [
                {
                    "measurements": [
                        {"parameter": "pm25", "value": 14.2},
                        {"parameter": "no2", "value": 31.7, "unit": "ppb"},
                        {"parameter": "temperature", "value": 18.0},
                    ]
                },
                {"measurements": [{"parameter": "pm25", "value": None}]},
            ]
        }
    )

    assert parsed["pm25_ugm3"] == 14.2
    assert parsed["no2_ppb"] == 31.7
    assert parsed["wind_speed_ms"] is None


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


def test_fetch_uses_openaq_v3_location_latest_and_parses_results(monkeypatch):
    calls = []

    class FakeResponse:
        def __init__(self, payload, status_code=200):
            self._payload = payload
            self.status_code = status_code

        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError(
                    "error",
                    request=httpx.Request("GET", "https://api.openaq.org/v3"),
                    response=httpx.Response(self.status_code),
                )

        def json(self):
            return self._payload

    class FakeAsyncClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, params=None, headers=None):
            calls.append(
                {
                    "url": url,
                    "params": params or {},
                    "headers": headers or {},
                    "timeout": self.timeout,
                }
            )
            if url.endswith("/locations") and not url.rstrip("/").endswith("/locations/9"):
                return FakeResponse(
                    {
                        "results": [
                            {
                                "id": 9,
                                "isMonitor": True,
                                "distance": 1200,
                                "sensors": [
                                    {
                                        "id": 101,
                                        "name": "pm25",
                                        "parameter": {
                                            "id": 2,
                                            "name": "pm25",
                                            "units": "µg/m³",
                                        },
                                    },
                                    {
                                        "id": 102,
                                        "name": "no2",
                                        "parameter": {
                                            "id": 7,
                                            "name": "no2",
                                            "units": "ppb",
                                        },
                                    },
                                ],
                            }
                        ]
                    }
                )
            if url.endswith("/locations/9/latest"):
                return FakeResponse(
                    {
                        "results": [
                            {
                                "datetime": {"utc": "2026-07-29T11:00:00Z"},
                                "value": 11.1,
                                "sensorsId": 101,
                                "locationsId": 9,
                            },
                            {
                                "datetime": {"utc": "2026-07-29T11:00:00Z"},
                                "value": 42.0,
                                "sensorsId": 102,
                                "locationsId": 9,
                                "units": "ppb",
                            },
                        ]
                    }
                )
            raise AssertionError(f"unexpected url {url}")

    monkeypatch.setattr(rotterdam_module.httpx, "AsyncClient", FakeAsyncClient)
    adapter = RotterdamAdapter(timeout_seconds=3, api_key="test-key")

    result = asyncio.run(adapter.fetch())

    assert result["pm25_ugm3"] == 11.1
    assert result["no2_ppb"] == 42.0
    assert result["wind_speed_ms"] is None
    assert calls[0]["url"] == "https://api.openaq.org/v3/locations"
    assert calls[0]["params"]["coordinates"] == "51.9225,4.4792"
    assert calls[0]["headers"]["X-API-Key"] == "test-key"
    assert calls[1]["url"] == "https://api.openaq.org/v3/locations/9/latest"
    assert adapter._consecutive_failures == 0


def test_fetch_records_auth_failure_when_api_key_missing(monkeypatch):
    monkeypatch.delenv("JETSCOPE_OPENAQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENAQ_API_KEY", raising=False)
    adapter = RotterdamAdapter(api_key="")

    assert asyncio.run(adapter.fetch()) == {}
    assert adapter._consecutive_failures == 1
    assert adapter._last_error_code == "AUTHENTICATION_FAILED"
    assert adapter.get_source_status()[0] == "degraded"


def test_fetch_records_parsing_error_when_response_has_no_results(monkeypatch):
    class FakeResponse:
        status_code = 200

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

        async def get(self, url, params=None, headers=None):
            if url.endswith("/locations"):
                return type(
                    "R",
                    (),
                    {
                        "status_code": 200,
                        "raise_for_status": lambda self: None,
                        "json": lambda self: {
                            "results": [
                                {
                                    "id": 9,
                                    "isMonitor": True,
                                    "sensors": [
                                        {
                                            "id": 101,
                                            "parameter": {"name": "pm25", "units": "µg/m³"},
                                        }
                                    ],
                                }
                            ]
                        },
                    },
                )()
            return FakeResponse()

    monkeypatch.setattr(rotterdam_module.httpx, "AsyncClient", FakeAsyncClient)
    adapter = RotterdamAdapter(api_key="test-key")

    assert asyncio.run(adapter.fetch()) == {}
    assert adapter._consecutive_failures == 1
    assert adapter._last_error_code == "PARSING_ERROR"
