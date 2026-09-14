from __future__ import annotations

from datetime import datetime, timezone

from app.services.market_quality import (
    isoformat_z,
    quality_from_detail,
    same_quality_class,
    select_fossil_jet_benchmark,
    should_persist_snapshot,
)


def test_select_jet_prefers_derived_eu_proxy_over_seed_rotterdam() -> None:
    values = {
        "rotterdam_jet_fuel_usd_per_l": 0.657,
        "jet_eu_proxy_usd_per_l": 0.913,
        "jet_usd_per_l": 0.64,
    }
    details = {
        "rotterdam_jet_fuel": {
            "source": "rotterdam-jet-direct",
            "status": "fallback",
            "fallback_used": True,
            "quality": "seed",
        },
        "jet_eu_proxy": {
            "source": "brent-derived",
            "status": "fallback",
            "fallback_used": True,
            "quality": "derived",
        },
        "jet": {
            "source": "fred",
            "status": "error",
            "fallback_used": True,
            "quality": "seed",
        },
    }

    selected = select_fossil_jet_benchmark(values, details)

    assert selected["metric_key"] == "jet_eu_proxy_usd_per_l"
    assert selected["value"] == 0.913
    assert selected["quality"] == "derived"
    assert selected["usable_for_signal"] is True


def test_select_jet_prefers_observed_rotterdam_over_derived_proxy() -> None:
    values = {
        "rotterdam_jet_fuel_usd_per_l": 0.88,
        "jet_eu_proxy_usd_per_l": 0.913,
    }
    details = {
        "rotterdam_jet_fuel": {"source": "rotterdam-jet-direct", "status": "ok", "fallback_used": False},
        "jet_eu_proxy": {"source": "brent-derived", "status": "fallback", "fallback_used": True, "quality": "derived"},
    }

    selected = select_fossil_jet_benchmark(values, details)

    assert selected["metric_key"] == "rotterdam_jet_fuel_usd_per_l"
    assert selected["quality"] == "observed"


def test_seed_only_jet_is_not_usable_for_signal() -> None:
    values = {"rotterdam_jet_fuel_usd_per_l": 0.657}
    details = {
        "rotterdam_jet_fuel": {
            "source": "seed-baseline",
            "status": "fallback",
            "fallback_used": True,
        }
    }

    selected = select_fossil_jet_benchmark(values, details)

    assert selected["quality"] == "seed"
    assert selected["usable_for_signal"] is False


def test_missing_or_zero_values_are_skipped() -> None:
    values = {"rotterdam_jet_fuel_usd_per_l": 0, "jet_eu_proxy_usd_per_l": None}
    details = {
        "rotterdam_jet_fuel": {"source": "rotterdam-jet-direct", "status": "ok"},
        "jet_eu_proxy": {"source": "brent-derived", "status": "ok"},
    }

    selected = select_fossil_jet_benchmark(values, details)

    assert selected["value"] is None
    assert selected["quality"] == "missing"
    assert selected["usable_for_signal"] is False


def test_seed_does_not_overwrite_prior_observation() -> None:
    assert should_persist_snapshot(quality="seed", value=0.657, has_prior=True) is False
    assert should_persist_snapshot(quality="seed", value=0.657, has_prior=False) is True
    assert should_persist_snapshot(quality="missing", value=None, has_prior=True) is False
    assert should_persist_snapshot(quality="observed", value=120.98, has_prior=True) is True


def test_isoformat_z_normalizes_naive_and_offset_datetimes() -> None:
    naive = datetime(2026, 9, 10, 0, 0, 0)
    offset = datetime(2026, 9, 10, 2, 0, 0, tzinfo=timezone.utc)

    assert isoformat_z(naive) == "2026-09-10T00:00:00Z"
    assert isoformat_z(offset).endswith("Z")


def test_quality_from_detail_treats_germany_gap_as_missing() -> None:
    assert (
        quality_from_detail(
            {
                "source": "airport-differential-pending",
                "status": "missing",
                "value": None,
                "quality": "missing",
            }
        )
        == "missing"
    )


def test_same_quality_class_allows_stale_with_observed() -> None:
    assert same_quality_class("observed", "stale") is True
    assert same_quality_class("observed", "derived") is False
    assert same_quality_class("seed", "derived") is False
