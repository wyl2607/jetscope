from __future__ import annotations

import httpx
import pytest

from adapters.iea import ConfigError, IEAAdapter


def _mock_transport(status_code: int = 200, json_data: dict | list | None = None, exc: Exception | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if exc is not None:
            raise exc
        return httpx.Response(
            status_code=status_code,
            json=json_data if json_data is not None else {},
            request=request,
        )

    return httpx.MockTransport(handler)


def test_iea_fetch_stock_days_coverage_success(monkeypatch):
    monkeypatch.setenv("IEA_API_KEY", "test-key")
    transport = _mock_transport(
        json_data={
            "data": [
                {
                    "country_iso": "DE",
                    "stock_days": 23.5,
                }
            ]
        }
    )

    adapter = IEAAdapter(transport=transport)
    result = adapter.fetch_stock_days_coverage("DE")

    assert result.country_iso == "DE"
    assert result.stock_days == 23.5
    assert result.source == "iea_oil_market_report"
    assert result.error_code is None
    assert result.source_status.status == "healthy"
    assert result.source_status.confidence >= 0.9


def test_iea_missing_api_key_raises_config_error(monkeypatch):
    monkeypatch.delenv("IEA_API_KEY", raising=False)
    adapter = IEAAdapter()

    with pytest.raises(ConfigError):
        adapter.fetch_stock_days_coverage("FR")


def test_iea_timeout_degrades_to_fallback(monkeypatch):
    monkeypatch.setenv("IEA_API_KEY", "test-key")
    transport = _mock_transport(exc=httpx.TimeoutException("timed out"))

    adapter = IEAAdapter(transport=transport)
    result = adapter.fetch_stock_days_coverage("NL")

    assert result.country_iso == "NL"
    assert result.error_code == "API_TIMEOUT"
    assert result.confidence == 0.30
    assert result.source_status.status == "degraded"
    assert result.source_status.error_code == "API_TIMEOUT"
    assert adapter.get_source_status() == ("degraded", 0.30, "API_TIMEOUT")
