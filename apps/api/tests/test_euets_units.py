from __future__ import annotations

from unittest.mock import patch

import pytest

from adapters.euets import EUETSAdapter, EUETS_CACHE_TTL, PRICE_MAX_EUR, VOLUME_MAX


class _MockResponse:
    def __init__(self, json_data: dict, status_code: int = 200) -> None:
        self._json_data = json_data
        self.status_code = status_code

    def json(self) -> dict:
        return self._json_data

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            from httpx import HTTPStatusError

            raise HTTPStatusError("error", request=None, response=self)


class _MockAsyncClient:
    def __init__(self, response: _MockResponse | None = None, exc: Exception | None = None) -> None:
        self._response = response
        self._exc = exc

    async def __aenter__(self) -> _MockAsyncClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        pass

    async def get(self, url: str, **kwargs: object) -> _MockResponse:
        if self._exc is not None:
            raise self._exc
        return self._response or _MockResponse({})


def test_parse_response_with_data() -> None:
    adapter = EUETSAdapter()
    raw = {"data": [{"price": 75.3, "volume": 420_000, "date": "2025-01-15"}]}
    parsed = adapter._parse_response(raw)
    assert parsed == {"price_eur": 75.3, "volume_tons": 420_000, "date": "2025-01-15"}


def test_parse_response_falls_back_to_results_key() -> None:
    adapter = EUETSAdapter()
    raw = {"results": [{"price": 80.0, "volume": 100_000, "date": "2025-01-16"}]}
    parsed = adapter._parse_response(raw)
    assert parsed["price_eur"] == 80.0


def test_parse_response_empty_returns_none_fields() -> None:
    adapter = EUETSAdapter()
    parsed = adapter._parse_response({})
    assert parsed == {"price_eur": None, "volume_tons": None, "date": None}


def test_validate_valid_data_returns_true() -> None:
    adapter = EUETSAdapter()
    data = {"price_eur": 75.3, "volume_tons": 420_000, "date": "2025-01-15"}
    assert adapter.validate(data) is True


def test_validate_empty_dict_returns_false() -> None:
    adapter = EUETSAdapter()
    assert adapter.validate({}) is False
    assert adapter._last_error_code == "MISSING_FIELD"


def test_validate_missing_price_returns_false() -> None:
    adapter = EUETSAdapter()
    data = {"volume_tons": 100_000, "date": "2025-01-15"}
    assert adapter.validate(data) is False
    assert adapter._last_error_code == "MISSING_FIELD"


def test_validate_price_negative_returns_false() -> None:
    adapter = EUETSAdapter()
    data = {"price_eur": -1, "volume_tons": 100_000}
    assert adapter.validate(data) is False
    assert adapter._last_error_code == "INVALID_RANGE"


def test_validate_price_at_boundary_zero_passes() -> None:
    adapter = EUETSAdapter()
    data = {"price_eur": 0, "volume_tons": 100_000}
    assert adapter.validate(data) is True


def test_validate_price_at_boundary_max_passes() -> None:
    adapter = EUETSAdapter()
    data = {"price_eur": PRICE_MAX_EUR, "volume_tons": 100_000}
    assert adapter.validate(data) is True


def test_validate_price_exceeds_max_returns_false() -> None:
    adapter = EUETSAdapter()
    data = {"price_eur": PRICE_MAX_EUR + 0.01, "volume_tons": 100_000}
    assert adapter.validate(data) is False
    assert adapter._last_error_code == "INVALID_RANGE"


def test_validate_volume_exceeds_max_returns_false() -> None:
    adapter = EUETSAdapter()
    data = {"price_eur": 75.0, "volume_tons": VOLUME_MAX + 1}
    assert adapter.validate(data) is False
    assert adapter._last_error_code == "INVALID_RANGE"


def test_validate_volume_none_is_valid() -> None:
    adapter = EUETSAdapter()
    data = {"price_eur": 75.0}
    assert adapter.validate(data) is True


def test_transform_with_volume_high_confidence() -> None:
    adapter = EUETSAdapter()
    data = {"price_eur": 75.3, "volume_tons": 420_000, "date": "2025-01-15"}
    model = adapter.transform(data)
    assert model.price_eur == 75.3
    assert model.volume_tons == 420_000
    assert model.confidence == 0.96
    assert model.source == "euets_registry"
    assert model.error_code is None
    assert model.freshness_seconds >= 0


def test_transform_without_volume_lower_confidence() -> None:
    adapter = EUETSAdapter()
    data = {"price_eur": 75.3, "date": "2025-01-15"}
    model = adapter.transform(data)
    assert model.price_eur == 75.3
    assert model.volume_tons is None
    assert model.confidence == 0.88


def test_get_source_status_healthy() -> None:
    adapter = EUETSAdapter()
    status, confidence, error = adapter.get_source_status()
    assert status == "healthy"
    assert confidence == 0.95
    assert error is None


def test_get_source_status_degraded_after_one_failure() -> None:
    adapter = EUETSAdapter()
    adapter._consecutive_failures = 1
    adapter._last_error_code = "API_TIMEOUT"
    status, confidence, error = adapter.get_source_status()
    assert status == "degraded"
    assert confidence == 0.72
    assert error == "API_TIMEOUT"


def test_get_source_status_unavailable_after_three_failures() -> None:
    adapter = EUETSAdapter()
    adapter._consecutive_failures = 3
    adapter._last_error_code = "SOURCE_UNAVAILABLE"
    status, confidence, error = adapter.get_source_status()
    assert status == "unavailable"
    assert confidence == 0.25
    assert error == "SOURCE_UNAVAILABLE"


def test_cache_ttl_seconds() -> None:
    adapter = EUETSAdapter()
    assert adapter.cache_ttl_seconds == EUETS_CACHE_TTL


@pytest.mark.asyncio
async def test_fetch_success() -> None:
    adapter = EUETSAdapter()
    response = _MockResponse({"data": [{"price": 75.3, "volume": 420_000, "date": "2025-01-15"}]})
    mock_client = _MockAsyncClient(response=response)

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await adapter.fetch()

    assert result == {"price_eur": 75.3, "volume_tons": 420_000, "date": "2025-01-15"}
    assert adapter._consecutive_failures == 0


@pytest.mark.asyncio
async def test_fetch_timeout_returns_empty_and_records_failure() -> None:
    from httpx import TimeoutException

    adapter = EUETSAdapter()
    mock_client = _MockAsyncClient(exc=TimeoutException("timed out"))

    with patch("httpx.AsyncClient", return_value=mock_client):
        result = await adapter.fetch()

    assert result == {}
    assert adapter._last_error_code == "API_TIMEOUT"
    assert adapter._consecutive_failures == 1
