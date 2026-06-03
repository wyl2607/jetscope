"""Unit tests for app.services.sources — no DB, no network, deterministic."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pytest import MonkeyPatch

from app.schemas.market import MarketSnapshotResponse, MarketSourceDetail, SourceStatus
from app.schemas.sources import SourceCoverageResponse
from app.services.sources import (
    SOURCE_DETAIL_KEY_TO_METRIC_KEY,
    _EXPECTED_METRIC_KEYS,
    _classify_source_type,
    build_source_coverage_response,
    build_market_snapshot_response,
)


class TestClassifySourceType:
    def test_fallback_used_always_returns_derived(self):
        assert _classify_source_type("eia", fallback_used=True) == "derived"
        assert _classify_source_type("ANYTHING", fallback_used=True) == "derived"

    def test_official_sources(self):
        assert _classify_source_type("eia", fallback_used=False) == "official"
        assert _classify_source_type("ecb", fallback_used=False) == "official"
        assert _classify_source_type("eu_ets_eex", fallback_used=False) == "official"
        assert _classify_source_type("eex-eu-ets", fallback_used=False) == "official"

    def test_public_proxy_sources(self):
        assert _classify_source_type("fred", fallback_used=False) == "public_proxy"
        assert _classify_source_type("ara-rotterdam-public", fallback_used=False) == "public_proxy"
        assert _classify_source_type("rotterdam-jet-direct", fallback_used=False) == "public_proxy"

    def test_cbam_plus_ecb_returns_derived(self):
        assert _classify_source_type("cbam+ecb", fallback_used=False) == "derived"

    def test_derived_or_proxy_in_name_returns_derived(self):
        assert _classify_source_type("Derived from Brent", fallback_used=False) == "derived"
        assert _classify_source_type("Some Proxy Source", fallback_used=False) == "derived"

    def test_unknown_source_returns_market_primary(self):
        assert _classify_source_type("my_custom_feed", fallback_used=False) == "market_primary"
        assert _classify_source_type("some_other", fallback_used=False) == "market_primary"


def _fake_snapshot(
    *,
    details: dict[str, MarketSourceDetail] | None = None,
    generated_at: datetime | None = None,
) -> MarketSnapshotResponse:
    if generated_at is None:
        generated_at = datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc)
    return MarketSnapshotResponse(
        generated_at=generated_at,
        source_status=SourceStatus(overall="ok"),
        values={},
        source_details=details or {},
    )


def _detail(
    source: str = "eia",
    status: str = "ok",
    region: str = "global",
    market_scope: str = "benchmark",
    confidence_score: float = 0.95,
    fallback_used: bool = False,
    lag_minutes: int | None = 30,
) -> MarketSourceDetail:
    return MarketSourceDetail(
        source=source,
        status=status,
        region=region,
        market_scope=market_scope,
        confidence_score=confidence_score,
        fallback_used=fallback_used,
        lag_minutes=lag_minutes,
    )


class TestBuildSourceCoverageResponse:
    def test_full_coverage_all_expected_keys_present(self, monkeypatch: MonkeyPatch):
        details = {}
        for detail_key, metric_key in SOURCE_DETAIL_KEY_TO_METRIC_KEY.items():
            details[detail_key] = _detail(source=metric_key.replace("_", "-"))
        snapshot = _fake_snapshot(details=details)
        monkeypatch.setattr(
            "app.services.sources.build_market_snapshot_response",
            lambda _db: snapshot,
        )

        result: SourceCoverageResponse = build_source_coverage_response(db=None)  # type: ignore[arg-type]

        assert len(result.metrics) == len(_EXPECTED_METRIC_KEYS)
        present_keys = {m.metric_key for m in result.metrics}
        assert present_keys == _EXPECTED_METRIC_KEYS
        assert result.completeness == pytest.approx(1.0)

    def test_partial_coverage_backfills_seed_metrics(self, monkeypatch: MonkeyPatch):
        details = {
            "brent": _detail(source="eia"),
            "jet": _detail(source="fred"),
        }
        snapshot = _fake_snapshot(details=details)
        monkeypatch.setattr(
            "app.services.sources.build_market_snapshot_response",
            lambda _db: snapshot,
        )

        result: SourceCoverageResponse = build_source_coverage_response(db=None)  # type: ignore[arg-type]

        assert len(result.metrics) == len(_EXPECTED_METRIC_KEYS)
        present_keys = {m.metric_key for m in result.metrics if m.status != "seed"}
        assert present_keys == {"brent_usd_per_bbl", "jet_usd_per_l"}
        assert result.completeness == pytest.approx(2 / 7)
        seed_metrics = [m for m in result.metrics if m.status == "seed"]
        assert len(seed_metrics) == 5
        assert all(m.fallback_used for m in seed_metrics)

    def test_total_loss_fallback_when_no_source_details(self, monkeypatch: MonkeyPatch):
        snapshot = _fake_snapshot(details={})
        monkeypatch.setattr(
            "app.services.sources.build_market_snapshot_response",
            lambda _db: snapshot,
        )

        result: SourceCoverageResponse = build_source_coverage_response(db=None)  # type: ignore[arg-type]

        assert len(result.metrics) > 0
        assert result.completeness == pytest.approx(0.0)
        assert result.degraded is True
        all_seed = all(m.status == "seed" for m in result.metrics)
        assert all_seed

    def test_degraded_flag_with_fallback_metrics(self, monkeypatch: MonkeyPatch):
        details = {
            "brent": _detail(source="eia"),
            "carbon": _detail(source="cbam+ecb", fallback_used=True, confidence_score=0.7),
        }
        snapshot = _fake_snapshot(details=details)
        monkeypatch.setattr(
            "app.services.sources.build_market_snapshot_response",
            lambda _db: snapshot,
        )

        result: SourceCoverageResponse = build_source_coverage_response(db=None)  # type: ignore[arg-type]

        assert result.degraded is True
        assert result.completeness == pytest.approx(2 / 7)

    def test_unknown_detail_key_passes_through_but_not_counted_in_completeness(
        self, monkeypatch: MonkeyPatch
    ):
        details = {
            "brent": _detail(source="eia"),
            "some_unknown_detail_key": _detail(source="custom", region="xx", market_scope="custom"),
        }
        snapshot = _fake_snapshot(details=details)
        monkeypatch.setattr(
            "app.services.sources.build_market_snapshot_response",
            lambda _db: snapshot,
        )

        result: SourceCoverageResponse = build_source_coverage_response(db=None)  # type: ignore[arg-type]

        metric_keys = {m.metric_key for m in result.metrics}
        assert "some_unknown_detail_key" in metric_keys
        non_seed = [m for m in result.metrics if m.status != "seed"]
        assert len(non_seed) == 2
        assert result.completeness == pytest.approx(1 / 7)
