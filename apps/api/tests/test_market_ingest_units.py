from __future__ import annotations

import pytest

from app.services import market as market_service


def test_parse_fred_csv_ignores_invalid_and_missing_rows() -> None:
    csv_payload = """DATE,VALUE
2026-05-01,.
2026-05-02,not-a-number
2026-05-03,80.25
2026-05-04,81.75
"""

    as_of, value = market_service._parse_fred_csv(csv_payload)

    assert as_of == "2026-05-04"
    assert value == 81.75


def test_ingest_brent_falls_back_to_fred_when_eia_parse_fails(monkeypatch) -> None:
    details: dict[str, object] = {"sources": {}}

    payloads = {
        market_service.MARKET_SOURCE_URLS["brent_eia"]: "<html><body>no brent row here</body></html>",
        market_service.MARKET_SOURCE_URLS["brent_fred"]: "DATE,VALUE\n2026-05-01,90.5\n",
    }

    def fake_fetch_text(url: str, timeout_s: float = 12.0) -> str:  # pragma: no cover - exercised via ingest
        return payloads[url]

    monkeypatch.setattr(market_service, "_fetch_text", fake_fetch_text)

    brent_value = market_service._ingest_brent_market_value(details)

    assert brent_value == 90.5
    assert details["sources"]["brent"]["source"] == "fred"
    assert details["sources"]["brent"]["status"] == "ok"


def test_ingest_jet_eu_uses_brent_derived_fallback_when_ara_unavailable(monkeypatch) -> None:
    details: dict[str, object] = {"sources": {}}
    seed_by_key = {item["metric_key"]: item["value"] for item in market_service.DEFAULT_MARKET_METRICS}

    def fail_fetch_text(url: str, timeout_s: float = 12.0) -> str:  # pragma: no cover - exercised via ingest
        raise RuntimeError("network down")

    monkeypatch.setattr(market_service, "_fetch_text", fail_fetch_text)

    brent_value = 120.0
    result = market_service._ingest_jet_eu_market_value(
        details,
        brent_value=brent_value,
        seed_by_key=seed_by_key,
    )

    expected = round(
        market_service._to_usd_per_l_from_usd_per_bbl(brent_value)
        * market_service.EU_JET_PROXY_BRENT_PREMIUM_MULTIPLIER,
        3,
    )
    source_detail = details["sources"]["jet_eu_proxy"]

    assert result == expected
    assert source_detail["status"] == "estimated"
    assert source_detail["source"] == "brent-derived"
    assert source_detail["fallback_used"] is True
    assert source_detail["method"]
    assert "1.20" in str(source_detail["method"])
    assert source_detail["confidence_score"] == pytest.approx(0.65)
    assert 0.50 <= source_detail["confidence_score"] <= 0.69
    assert "primary_error" in source_detail


def test_ingest_jet_eu_is_missing_when_public_and_brent_unavailable(monkeypatch) -> None:
    """A failed public quote must not be replaced with the seeded baseline."""
    details: dict[str, object] = {"sources": {}}
    seed_by_key = {item["metric_key"]: item["value"] for item in market_service.DEFAULT_MARKET_METRICS}

    def fail_fetch_text(url: str, timeout_s: float = 12.0) -> str:
        raise RuntimeError("network down")

    monkeypatch.setattr(market_service, "_fetch_text", fail_fetch_text)

    result = market_service._ingest_jet_eu_market_value(
        details,
        brent_value=None,
        seed_by_key=seed_by_key,
    )

    source_detail = details["sources"]["jet_eu_proxy"]

    assert result is None
    assert source_detail["status"] == "missing"
    assert source_detail.get("value") is None
    assert source_detail["value"] != seed_by_key["jet_eu_proxy_usd_per_l"] if "value" in source_detail else True
    assert float(seed_by_key["jet_eu_proxy_usd_per_l"]) != source_detail.get("value")
