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
            "observed_at": "2026-09-14T00:00:00Z",
            "lag_minutes": 1440,
        },
        "jet": {
            "source": "fred",
            "status": "error",
            "fallback_used": True,
            "quality": "seed",
        },
    }

    selected = select_fossil_jet_benchmark(
        values,
        details,
        now=datetime(2026, 9, 14, tzinfo=timezone.utc),
    )

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
    observed_at = datetime(2026, 9, 10, tzinfo=timezone.utc)
    assert should_persist_snapshot(quality="seed", value=0.657, has_prior=True) is False
    assert should_persist_snapshot(quality="seed", value=0.657, has_prior=False) is True
    assert should_persist_snapshot(quality="missing", value=None, has_prior=True) is False
    assert should_persist_snapshot(quality="observed", value=120.98, has_prior=True) is False
    assert (
        should_persist_snapshot(
            quality="observed",
            value=120.98,
            has_prior=True,
            observed_at=observed_at,
        )
        is True
    )


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


def test_missing_quality_is_unknown_not_observed() -> None:
    assert quality_from_detail({"source": "rotterdam-jet-direct", "status": "ok"}) in {
        "observed",
        "unknown",
    }
    from app.services.market_quality import snapshot_quality

    assert snapshot_quality({"refresh_run_id": "abc"}) in {"unknown", "legacy", "unverified"}
    assert snapshot_quality({}) != "observed"
    assert snapshot_quality(None) != "observed"


def test_comparable_series_requires_product_and_quote_kind() -> None:
    from app.services.market_quality import same_comparable_series

    spot = {"quality": "observed", "quote_kind": "spot", "product_id": "EIA Brent", "unit": "USD/bbl", "source": "eia"}
    futures = {
        "quality": "observed",
        "quote_kind": "futures",
        "product_id": "ICE Jet CIF NWE",
        "unit": "USD/L",
        "source": "rotterdam-jet-direct",
    }
    assert same_comparable_series(spot, {**spot, "quality": "stale"}) is True
    assert same_comparable_series(spot, futures) is False


def test_stale_uses_observation_age_not_fetch_time() -> None:
    from datetime import datetime, timedelta, timezone

    from app.services.market_quality import classify_quote_freshness

    now = datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc)
    observed = now - timedelta(days=3)
    fetched = now
    quality = classify_quote_freshness(
        quality="observed",
        observed_at=observed,
        fetched_at=fetched,
        lag_minutes=1440,
        now=now,
    )
    assert quality == "stale"
    expired = classify_quote_freshness(
        quality="observed",
        observed_at=now - timedelta(days=40),
        fetched_at=fetched,
        lag_minutes=1440,
        now=now,
    )
    assert expired not in {"observed", "stale"} or expired == "missing"


def test_derived_quote_from_2020_stays_derived_but_is_not_usable() -> None:
    now = datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc)
    from app.services.market_quality import classify_quote_freshness

    quality = classify_quote_freshness(
        quality="derived",
        observed_at=datetime(2020, 1, 2, tzinfo=timezone.utc),
        fetched_at=now,
        lag_minutes=1440,
        now=now,
    )
    selected = select_fossil_jet_benchmark(
        {"jet_eu_proxy_usd_per_l": 0.913},
        {
            "jet_eu_proxy": {
                "source": "brent-derived",
                "status": "fallback",
                "fallback_used": True,
                "quality": "derived",
                "observed_at": "2020-01-02T00:00:00Z",
                "input_observed_at": {"brent": "2020-01-02T00:00:00Z"},
                "lag_minutes": 1440,
            }
        },
        now=now,
    )
    assert quality == "derived"
    assert selected["quality"] == "derived"
    assert selected["freshness"] == "expired"
    assert selected["usable_for_signal"] is False


def test_derived_without_verifiable_date_is_not_usable() -> None:
    now = datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc)
    selected = select_fossil_jet_benchmark(
        {"jet_eu_proxy_usd_per_l": 0.913},
        {
            "jet_eu_proxy": {
                "source": "brent-derived",
                "status": "fallback",
                "fallback_used": True,
                "quality": "derived",
            }
        },
        now=now,
    )
    assert selected["quality"] == "derived"
    assert selected["freshness"] == "unverifiable"
    assert selected["usable_for_signal"] is False


def test_expired_rotterdam_does_not_block_fresh_eu_proxy() -> None:
    now = datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc)
    selected = select_fossil_jet_benchmark(
        {
            "rotterdam_jet_fuel_usd_per_l": 0.657,
            "jet_eu_proxy_usd_per_l": 0.913,
        },
        {
            "rotterdam_jet_fuel": {
                "source": "rotterdam-jet-direct",
                "status": "ok",
                "quality": "derived",
                "observed_at": "2020-01-02T00:00:00Z",
                "lag_minutes": 1440,
            },
            "jet_eu_proxy": {
                "source": "brent-derived",
                "status": "fallback",
                "fallback_used": True,
                "quality": "derived",
                "observed_at": "2026-09-14T00:00:00Z",
                "lag_minutes": 1440,
            },
        },
        now=now,
    )
    assert selected["metric_key"] == "jet_eu_proxy_usd_per_l"
    assert selected["value"] == 0.913
    assert selected["usable_for_signal"] is True


def test_only_expired_quotes_reports_unusable() -> None:
    now = datetime(2026, 9, 14, 12, 0, tzinfo=timezone.utc)
    selected = select_fossil_jet_benchmark(
        {
            "rotterdam_jet_fuel_usd_per_l": 0.657,
            "jet_eu_proxy_usd_per_l": 0.913,
        },
        {
            "rotterdam_jet_fuel": {
                "source": "rotterdam-jet-direct",
                "status": "ok",
                "quality": "derived",
                "observed_at": "2020-01-02T00:00:00Z",
                "lag_minutes": 1440,
            },
            "jet_eu_proxy": {
                "source": "brent-derived",
                "status": "fallback",
                "fallback_used": True,
                "quality": "derived",
                "observed_at": "2020-01-03T00:00:00Z",
                "lag_minutes": 1440,
            },
        },
        now=now,
    )
    assert selected["usable_for_signal"] is False
    assert selected["freshness"] == "expired"
