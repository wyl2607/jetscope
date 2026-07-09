"""Focused unit tests for the EU ETS adapter."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx

try:
    from adapters.euets import EUETSAdapter
    import adapters.euets as euets_module
except ModuleNotFoundError:  # pragma: no cover - supports repo-root imports.
    from apps.api.adapters.euets import EUETSAdapter
    import apps.api.adapters.euets as euets_module


class _FakeResponse:
    def __init__(self, payload: dict, *, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("GET", "https://example.invalid")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError(
                f"HTTP {self.status_code}", request=request, response=response
            )

    def json(self) -> dict:
        return self._payload


class _FakeAsyncClient:
    def __init__(self, *, timeout: int, payload: dict):
        self.timeout = timeout
        self.payload = payload
        self.calls: list[tuple[str, dict]] = []

    async def __aenter__(self) -> "_FakeAsyncClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def get(self, url: str, params: dict):
        self.calls.append((url, params))
        return _FakeResponse(self.payload)


def test_parse_response_extracts_from_results_when_data_missing():
    adapter = EUETSAdapter()

    parsed = adapter._parse_response(
        {
            "results": [
                {
                    "price": 92.4,
                    "volume": 230_000,
                    "date": "2026-05-31",
                }
            ]
        }
    )

    assert parsed["price_eur"] == 92.4
    assert parsed["volume_tons"] == 230_000
    assert parsed["date"] == "2026-05-31"


def test_validate_rejects_invalid_ranges_and_records_code():
    adapter = EUETSAdapter()

    ok = adapter.validate({"price_eur": 50.0, "volume_tons": 1_000_000})
    bad_price = adapter.validate({"price_eur": 999.0, "volume_tons": 10})
    bad_volume = adapter.validate({"price_eur": 10.0, "volume_tons": 99_000_000})

    assert ok is True
    assert bad_price is False
    assert bad_volume is False
    assert adapter._last_error_code == "INVALID_RANGE"


def test_transform_sets_confidence_and_non_negative_freshness():
    adapter = EUETSAdapter()

    # No successful fetch yet -> freshness would be -1, but transform clamps to 0.
    model_without_volume = adapter.transform({"price_eur": 85.0, "volume_tons": None})
    adapter._last_fetch_time = datetime.now(timezone.utc)
    model_with_volume = adapter.transform({"price_eur": 86.0, "volume_tons": 1234})

    assert model_without_volume.confidence == 0.88
    assert model_without_volume.freshness_seconds == 0
    assert model_with_volume.confidence == 0.96
    assert model_with_volume.volume_tons == 1234


def test_fetch_returns_parsed_payload_and_uses_expected_request_params(monkeypatch):
    payload = {
        "data": [
            {
                "price": 91.2,
                "volume": 111_222,
                "date": "2026-05-31",
            }
        ]
    }
    holder: dict[str, _FakeAsyncClient] = {}

    def _client_factory(*, timeout: int):
        client = _FakeAsyncClient(timeout=timeout, payload=payload)
        holder["client"] = client
        return client

    monkeypatch.setattr(euets_module.httpx, "AsyncClient", _client_factory)
    adapter = EUETSAdapter(timeout_seconds=7)

    result = asyncio.run(adapter.fetch())

    assert result == {
        "price_eur": 91.2,
        "volume_tons": 111_222,
        "date": "2026-05-31",
    }
    call_url, call_params = holder["client"].calls[0]
    assert call_url.endswith("/v1/ets/allowance/daily-prices")
    assert call_params["limit"] == 1
    assert "date_from" in call_params


def test_fetch_records_rate_limit_on_http_429(monkeypatch):
    class _RateLimitClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url: str, params: dict):
            request = httpx.Request("GET", url)
            response = httpx.Response(429, request=request)
            raise httpx.HTTPStatusError("rate limited", request=request, response=response)

    monkeypatch.setattr(euets_module.httpx, "AsyncClient", lambda *, timeout: _RateLimitClient())
    adapter = EUETSAdapter()

    result = asyncio.run(adapter.fetch())

    assert result == {}
    assert adapter._consecutive_failures == 1
    assert adapter._last_error_code == "RATE_LIMIT"
