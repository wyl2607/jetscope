"""L3: market snapshots tell the truth. Seeds stay in assumptions, never in values."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.tables import MarketSnapshot
from app.services import market as market_service


def _session() -> Session:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()


def _fail_network(monkeypatch) -> None:
    def fail_text(url: str, timeout_s: float | None = None) -> str:
        raise RuntimeError(f"down {url}")

    def fail_bytes(url: str, timeout_s: float | None = None) -> bytes:
        raise RuntimeError(f"down {url}")

    monkeypatch.setattr(market_service, "_fetch_text", fail_text)
    monkeypatch.setattr(market_service, "_fetch_bytes", fail_bytes)


def _default_numbers() -> list[float]:
    return [
        float(market_service.DEFAULT_BRENT_USD_PER_BBL),
        float(market_service.DEFAULT_JET_USD_PER_L),
        float(market_service.DEFAULT_EU_ETS_EUR_PER_T),
        float(market_service.DEFAULT_EUR_USD),
        float(market_service.DEFAULT_CARBON_PROXY_USD_PER_T),
        float(market_service.DEFAULT_JET_EU_PROXY_USD_PER_L),
    ]


def _stub_live_sources(monkeypatch, sources: dict[str, dict[str, object]]) -> None:
    def stub_ingest() -> tuple[dict[str, float | None], str, dict[str, object]]:
        return {}, "degraded", {"sources": sources, "overall": "degraded"}

    monkeypatch.setattr(market_service, "_ingest_live_market_values", stub_ingest)


def test_all_sources_down_marks_every_metric_missing_without_seeds(monkeypatch) -> None:
    _fail_network(monkeypatch)
    db = _session()
    market_service.refresh_market_snapshot_set(db)
    snapshot = market_service.build_market_snapshot_response(db)

    assert snapshot.values
    assert all(value is None for value in snapshot.values.values())
    forbidden = _default_numbers()
    for detail in snapshot.source_details.values():
        assert detail.status == "missing"
        assert detail.value is None
        assert detail.value not in forbidden
    for number in forbidden:
        assert number not in snapshot.values.values()
    assert snapshot.source_status.status_counts["missing"] == len(snapshot.values)
    assert snapshot.source_status.fallback_rate == 100.0
    assert snapshot.source_status.is_fallback is True
    for assumption in snapshot.assumptions.values():
        assert assumption.kind == "assumption"
        assert assumption.as_of == market_service.DEFAULT_MARKET_SEED_AS_OF


def test_jet_stale_within_limit_and_missing_after_limit(monkeypatch) -> None:
    _fail_network(monkeypatch)
    db = _session()
    now = datetime.now(UTC)
    fresh_as_of = now - timedelta(days=5)
    db.add(
        MarketSnapshot(
            source_key="jet_fred_proxy",
            metric_key="jet_usd_per_l",
            value=0.551,
            unit="USD/L",
            as_of=fresh_as_of,
            payload={
                "quality": "observed",
                "source": "fred",
                "observed_at": fresh_as_of.isoformat(),
            },
        )
    )
    db.commit()

    market_service.refresh_market_snapshot_set(db)
    fresh = market_service.build_market_snapshot_response(db)
    jet = fresh.source_details["jet"]
    assert jet.status == "stale"
    assert jet.value == 0.551
    assert jet.as_of is not None
    assert jet.as_of.date() == fresh_as_of.date()
    assert fresh.values["jet_usd_per_l"] == 0.551

    db.add(
        MarketSnapshot(
            source_key="jet_fred_proxy",
            metric_key="jet_usd_per_l",
            value=0.551,
            unit="USD/L",
            as_of=now - timedelta(days=20),
            payload={
                "quality": "observed",
                "source": "fred",
                "observed_at": (now - timedelta(days=20)).isoformat(),
            },
        )
    )
    # The 5-day row is still the newest real observation, so replace the book
    # by deleting it before the aged case.
    from sqlalchemy import delete

    db.execute(delete(MarketSnapshot).where(MarketSnapshot.metric_key == "jet_usd_per_l"))
    aged_as_of = now - timedelta(days=20)
    db.add(
        MarketSnapshot(
            source_key="jet_fred_proxy",
            metric_key="jet_usd_per_l",
            value=0.551,
            unit="USD/L",
            as_of=aged_as_of,
            payload={
                "quality": "observed",
                "source": "fred",
                "observed_at": aged_as_of.isoformat(),
            },
        )
    )
    db.commit()
    market_service.refresh_market_snapshot_set(db)
    aged = market_service.build_market_snapshot_response(db)
    assert aged.source_details["jet"].status == "missing"
    assert aged.source_details["jet"].value is None
    assert aged.values["jet_usd_per_l"] is None


def test_rotterdam_estimate_follows_brent_and_is_missing_without_it() -> None:
    db = _session()
    now = datetime.now(UTC)
    live_sources = {
        "brent": {
            "source": "eia",
            "status": "ok",
            "quality": "observed",
            "value": 80.0,
            "observed_at": now.isoformat(),
        },
        "rotterdam_jet_fuel": {"source": "rotterdam-jet-direct", "status": "error", "quality": "missing"},
    }
    _values, published = market_service._apply_public_quote_policy(db, live_sources, now=now)
    rotterdam = published["rotterdam_jet_fuel"]
    expected = round(
        (80.0 / market_service.LITERS_PER_BARREL) * market_service.EU_JET_PROXY_BRENT_PREMIUM_MULTIPLIER,
        3,
    )
    assert rotterdam["status"] == "estimated"
    assert rotterdam["value"] == expected
    assert rotterdam["method"]
    assert "1.20" in str(rotterdam["method"])

    missing_sources = {
        "brent": {"source": "eia", "status": "error", "quality": "missing"},
        "rotterdam_jet_fuel": {"source": "rotterdam-jet-direct", "status": "error", "quality": "missing"},
    }
    _values, published = market_service._apply_public_quote_policy(db, missing_sources, now=now)
    assert published["rotterdam_jet_fuel"]["status"] == "missing"
    assert published["rotterdam_jet_fuel"]["value"] is None
    assert published["brent"]["status"] == "missing"


def test_health_is_false_when_jet_and_brent_are_missing(monkeypatch) -> None:
    _fail_network(monkeypatch)
    db = _session()
    market_service.refresh_market_snapshot_set(db)
    health = market_service.build_market_health_response(db)
    assert health.healthy is False
    assert "jet_missing" in health.reasons
    assert "brent_missing" in health.reasons


def test_partial_refresh_keeps_seed_only_metrics_missing(monkeypatch) -> None:
    db = _session()
    market_service.seed_market_snapshot_set(db)
    now = datetime.now(UTC)
    _stub_live_sources(
        monkeypatch,
        {
            "brent": {
                "source": "eia",
                "status": "ok",
                "quality": "observed",
                "value": 81.5,
                "observed_at": now.isoformat(),
                "fetched_at": now.isoformat(),
            }
        },
    )

    market_service.refresh_market_snapshot_set(db)
    snapshot = market_service.build_market_snapshot_response(db)

    brent = snapshot.source_details["brent"]
    assert brent.status == "live"
    assert brent.value == 81.5
    assert snapshot.values["brent_usd_per_bbl"] == 81.5

    for metric_key in (
        "jet_usd_per_l",
        "carbon_proxy_usd_per_t",
        "eu_ets_price_eur_per_t",
        "usd_per_eur",
        "germany_premium_pct",
    ):
        assert snapshot.values[metric_key] is None

    jet = snapshot.source_details["jet"]
    assert jet.status == "missing"
    assert jet.value is None
    for number in _default_numbers():
        assert number not in snapshot.values.values()

    persisted_seed_values = db.scalars(
        select(MarketSnapshot.value).where(MarketSnapshot.metric_key == "jet_usd_per_l")
    ).all()
    assert market_service.DEFAULT_JET_USD_PER_L in persisted_seed_values


def test_fresh_fetch_with_stale_observation_stays_stale(monkeypatch) -> None:
    db = _session()
    now = datetime.now(UTC)
    observed_at = now - timedelta(days=12)
    _stub_live_sources(
        monkeypatch,
        {
            "brent": {
                "source": "eia",
                "status": "ok",
                "quality": "observed",
                "value": 79.25,
                "observed_at": observed_at.isoformat(),
                "fetched_at": now.isoformat(),
            }
        },
    )

    market_service.refresh_market_snapshot_set(db)
    snapshot = market_service.build_market_snapshot_response(db)

    brent = snapshot.source_details["brent"]
    assert brent.status == "stale"
    assert brent.value == 79.25
    assert brent.as_of is not None
    assert brent.as_of.date() == observed_at.date()
    assert brent.observed_at == observed_at
    assert brent.fetched_at is not None
    assert brent.fetched_at > brent.observed_at
    assert brent.fetched_at.date() == now.date()
    assert snapshot.values["brent_usd_per_bbl"] == 79.25


def test_fresh_fetch_with_expired_observation_is_missing_even_with_seeds(monkeypatch) -> None:
    db = _session()
    market_service.seed_market_snapshot_set(db)
    now = datetime.now(UTC)
    observed_at = now - timedelta(days=20)
    _stub_live_sources(
        monkeypatch,
        {
            "brent": {
                "source": "eia",
                "status": "ok",
                "quality": "observed",
                "value": 82.0,
                "observed_at": observed_at.isoformat(),
                "fetched_at": now.isoformat(),
            }
        },
    )

    market_service.refresh_market_snapshot_set(db)
    snapshot = market_service.build_market_snapshot_response(db)

    brent = snapshot.source_details["brent"]
    assert brent.status == "missing"
    assert brent.value is None
    assert brent.as_of is None
    assert snapshot.values["brent_usd_per_bbl"] is None
    for number in _default_numbers():
        assert number not in snapshot.values.values()
