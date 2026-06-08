from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.services import market


def test_fetch_text_uses_configured_market_source_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        text = "ok"

        def raise_for_status(self) -> None:
            return None

    def fake_get(url: str, *, timeout: float, headers: dict[str, str], follow_redirects: bool) -> FakeResponse:
        captured.update(
            {
                "url": url,
                "timeout": timeout,
                "headers": headers,
                "follow_redirects": follow_redirects,
            }
        )
        return FakeResponse()

    monkeypatch.setenv("JETSCOPE_MARKET_SOURCE_TIMEOUT_SECONDS", "0.25")
    monkeypatch.delenv("SAFVSOIL_MARKET_REFRESH_TIMEOUT_MS", raising=False)
    monkeypatch.setattr(market.httpx, "get", fake_get)

    assert market._fetch_text("https://example.test/source") == "ok"
    assert captured["timeout"] == 0.25


def test_fetch_json_supports_legacy_market_refresh_timeout_ms(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict[str, object]:
            return {"ok": True}

    def fake_get(url: str, *, timeout: float, headers: dict[str, str], follow_redirects: bool) -> FakeResponse:
        captured.update({"url": url, "timeout": timeout, "headers": headers, "follow_redirects": follow_redirects})
        return FakeResponse()

    monkeypatch.delenv("JETSCOPE_MARKET_SOURCE_TIMEOUT_SECONDS", raising=False)
    monkeypatch.setenv("SAFVSOIL_MARKET_REFRESH_TIMEOUT_MS", "250")
    monkeypatch.setattr(market.httpx, "get", fake_get)

    assert market._fetch_json("https://example.test/source") == {"ok": True}
    assert captured["timeout"] == 0.25


def test_parse_fred_csv_uses_last_valid_row_and_skips_missing_values() -> None:
    csv_payload = """DATE,VALUE
2026-01-01,.
2026-01-02,100.5
2026-01-03,
2026-01-04,101.75
"""

    as_of, value = market._parse_fred_csv(csv_payload)

    assert as_of == "2026-01-04"
    assert value == 101.75


def test_parse_fred_csv_raises_when_no_usable_rows() -> None:
    csv_payload = """DATE,VALUE
2026-01-01,.
2026-01-02,
"""

    with pytest.raises(ValueError, match="No usable rows"):
        market._parse_fred_csv(csv_payload)


def test_fetch_yahoo_chart_history_filters_cutoff_and_none_values(monkeypatch: pytest.MonkeyPatch) -> None:
    fixed_now = datetime(2026, 1, 15, tzinfo=UTC)

    monkeypatch.setattr(market, "utcnow", lambda: fixed_now)
    monkeypatch.setattr(
        market,
        "_fetch_json",
        lambda _url: {
            "chart": {
                "result": [
                    {
                        "timestamp": [
                            int(datetime(2025, 12, 1, tzinfo=UTC).timestamp()),
                            int(datetime(2026, 1, 10, tzinfo=UTC).timestamp()),
                            int(datetime(2026, 1, 12, tzinfo=UTC).timestamp()),
                        ],
                        "indicators": {"quote": [{"close": [10.0, None, 12.5]}]},
                    }
                ],
                "error": None,
            }
        },
    )

    rows = market._fetch_yahoo_chart_history("BZ=F", days=30)

    assert rows == [(datetime(2026, 1, 12, tzinfo=UTC), 12.5)]


def test_ingest_jet_eu_market_value_falls_back_to_brent_when_public_quote_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(market, "_fetch_text", lambda _url: (_ for _ in ()).throw(RuntimeError("source down")))

    details: dict[str, object] = {"sources": {}}
    seed_by_key = {item["metric_key"]: float(item["value"]) for item in market.DEFAULT_MARKET_METRICS}

    result = market._ingest_jet_eu_market_value(
        details,
        brent_value=120.0,
        seed_by_key=seed_by_key,
    )

    expected = round((120.0 / market.LITERS_PER_BARREL) * market.EU_JET_PROXY_BRENT_PREMIUM_MULTIPLIER, 3)
    source_detail = details["sources"]["jet_eu_proxy"]

    assert result == expected
    assert source_detail["status"] == "fallback"
    assert source_detail["source"] == "brent-derived"
    assert source_detail["primary_error"] == "source down"
