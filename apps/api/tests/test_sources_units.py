from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.market import MarketSnapshotResponse, MarketSourceDetail, SourceStatus
from app.services import sources


def _snapshot(source_details: dict[str, MarketSourceDetail]) -> MarketSnapshotResponse:
    return MarketSnapshotResponse(
        generated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        source_status=SourceStatus(overall="healthy"),
        values={},
        source_details=source_details,
    )


def test_classify_source_type_rules_cover_official_public_and_fallback():
    assert sources._classify_source_type("eia", False) == "official"
    assert sources._classify_source_type("fred", False) == "public_proxy"
    assert sources._classify_source_type("custom feed", True) == "derived"


def test_build_source_coverage_response_backfills_missing_metrics(monkeypatch):
    details = {
        "brent": MarketSourceDetail(
            source="eia",
            status="ok",
            region="global",
            market_scope="physical_spot_benchmark",
            confidence_score=0.88,
            fallback_used=False,
            lag_minutes=1440,
            note="daily feed",
        )
    }

    monkeypatch.setattr(
        sources,
        "build_market_snapshot_response",
        lambda _db: _snapshot(details),
    )

    response = sources.build_source_coverage_response(db=object())

    by_key = {metric.metric_key: metric for metric in response.metrics}

    assert response.completeness == 1 / 7
    assert response.degraded is True
    assert by_key["brent_usd_per_bbl"].source_name == "eia"
    assert by_key["brent_usd_per_bbl"].source_type == "official"
    assert by_key["jet_usd_per_l"].status == "seed"
    assert by_key["jet_usd_per_l"].fallback_used is True


def test_build_source_coverage_response_is_not_degraded_for_full_non_fallback_coverage(monkeypatch):
    details = {
        "brent": MarketSourceDetail(
            source="eia",
            status="ok",
            region="global",
            market_scope="physical_spot_benchmark",
            confidence_score=0.9,
            fallback_used=False,
        ),
        "jet": MarketSourceDetail(
            source="fred",
            status="ok",
            region="us",
            market_scope="statistical_series",
            confidence_score=0.8,
            fallback_used=False,
        ),
        "carbon": MarketSourceDetail(
            source="cbam+ecb",
            status="ok",
            region="eu",
            market_scope="regulatory_proxy",
            confidence_score=0.7,
            fallback_used=False,
        ),
        "jet_eu_proxy": MarketSourceDetail(
            source="brent-derived",
            status="ok",
            region="eu",
            market_scope="derived_proxy",
            confidence_score=0.65,
            fallback_used=False,
        ),
        "rotterdam_jet_fuel": MarketSourceDetail(
            source="rotterdam-jet-direct",
            status="ok",
            region="eu",
            market_scope="physical_spot_rotterdam",
            confidence_score=0.82,
            fallback_used=False,
        ),
        "eu_ets": MarketSourceDetail(
            source="eex-eu-ets",
            status="ok",
            region="eu",
            market_scope="carbon_ets_settlement",
            confidence_score=0.9,
            fallback_used=False,
        ),
        "germany_premium": MarketSourceDetail(
            source="manual-regional",
            status="ok",
            region="de",
            market_scope="regional_tax_premium",
            confidence_score=0.75,
            fallback_used=False,
        ),
    }

    monkeypatch.setattr(
        sources,
        "build_market_snapshot_response",
        lambda _db: _snapshot(details),
    )

    response = sources.build_source_coverage_response(db=object())
    by_key = {metric.metric_key: metric for metric in response.metrics}

    assert response.completeness == 1.0
    assert response.degraded is False
    assert len(response.metrics) == 7
    assert by_key["germany_premium_pct"].source_type == "market_primary"
