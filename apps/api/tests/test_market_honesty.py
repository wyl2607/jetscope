from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.tables import MarketRefreshRun, MarketSnapshot
from app.services import market as market_service
from app.services.market_quality import select_fossil_jet_benchmark


def test_germany_premium_is_missing_not_clamped_tax_ratio() -> None:
    details: dict[str, object] = {"sources": {}}
    seed_by_key = {item["metric_key"]: float(item["value"]) for item in market_service.DEFAULT_MARKET_METRICS}

    result = market_service._ingest_germany_premium(
        details,
        seed_by_key=seed_by_key,
        jet_eu_proxy_usd_per_l=0.913,
    )

    source = details["sources"]["germany_premium"]
    assert result is None
    assert source["status"] == "missing"
    assert source["quality"] == "missing"
    assert source.get("value") is None
    assert source["fallback_used"] is False
    assert "§27" in str(source["note"]) or "27" in str(source["note"])
    assert float(source.get("confidence_score", 1)) <= 0.3


def test_failed_seed_refresh_does_not_advance_observed_at() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    observed_at = datetime(2026, 9, 10, tzinfo=UTC)
    fetched_later = datetime(2026, 9, 14, 9, 45, tzinfo=UTC)

    with Session(engine) as db:
        db.add(
            MarketSnapshot(
                source_key="rotterdam_jet_fuel",
                metric_key="rotterdam_jet_fuel_usd_per_l",
                value=0.88,
                unit="USD/L",
                as_of=observed_at,
                payload={"quality": "observed", "observed_at": observed_at.isoformat()},
            )
        )
        db.commit()
        persisted = market_service._persist_market_snapshot_set(
            db,
            {"rotterdam_jet_fuel_usd_per_l": 0.657},
            as_of=fetched_later,
            source_status="degraded",
            sources={
                "rotterdam_jet_fuel": {
                    "source": "rotterdam-jet-direct",
                    "status": "fallback",
                    "fallback_used": True,
                    "quality": "seed",
                    "value": 0.657,
                }
            },
            ingest="live-refresh",
            metric_meta={
                "rotterdam_jet_fuel_usd_per_l": {
                    "quality": "seed",
                    "observed_at": None,
                }
            },
        )
        rows = list(
            db.scalars(
                select(MarketSnapshot)
                .where(MarketSnapshot.metric_key == "rotterdam_jet_fuel_usd_per_l")
                .order_by(MarketSnapshot.as_of.asc())
            )
        )

    assert persisted == fetched_later
    assert len(rows) == 1
    assert rows[0].value == 0.88
    assert rows[0].as_of.replace(tzinfo=UTC) == observed_at


def test_snapshot_derived_uses_quality_aware_jet_not_seed_rotterdam() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    now = datetime(2026, 9, 14, 9, 45, tzinfo=UTC)

    with SessionLocal() as db:
        for item in market_service.DEFAULT_MARKET_METRICS:
            value = {
                "brent_usd_per_bbl": 120.98,
                "jet_usd_per_l": 0.64,
                "jet_eu_proxy_usd_per_l": 0.913,
                "rotterdam_jet_fuel_usd_per_l": 0.657,
                "carbon_proxy_usd_per_t": 91.91,
                "eu_ets_price_eur_per_t": 80.38,
                "germany_premium_pct": 8.0,
                "usd_per_eur": 1.1592,
            }.get(item["metric_key"], item["value"])
            db.add(
                MarketSnapshot(
                    source_key=item["source_key"],
                    metric_key=item["metric_key"],
                    value=float(value),
                    unit=item["unit"],
                    as_of=now if item["metric_key"] != "brent_usd_per_bbl" else datetime(2026, 9, 10, tzinfo=UTC),
                    payload={"quality": "seed" if "rotterdam" in item["metric_key"] or item["metric_key"] == "jet_usd_per_l" else "derived"},
                )
            )
        db.add(
            MarketRefreshRun(
                refreshed_at=now,
                source_status="degraded",
                ingest="live-refresh",
                sources={
                    "brent": {
                        "source": "eia",
                        "status": "ok",
                        "fallback_used": False,
                        "quality": "observed",
                        "value": 120.98,
                        "observed_at": datetime.now(UTC).isoformat(),
                    },
                    "jet": {"source": "fred", "status": "error", "fallback_used": True, "quality": "seed", "value": 0.64},
                    "jet_eu_proxy": {
                        "source": "brent-derived",
                        "status": "fallback",
                        "fallback_used": True,
                        "quality": "derived",
                        "value": 0.913,
                    },
                    "rotterdam_jet_fuel": {
                        "source": "rotterdam-jet-direct",
                        "status": "fallback",
                        "fallback_used": True,
                        "quality": "seed",
                        "value": 0.657,
                    },
                    "carbon": {"source": "cbam+ecb", "status": "fallback", "fallback_used": True, "quality": "seed"},
                    "eu_ets": {"source": "eex-eu-ets", "status": "fallback", "fallback_used": True, "quality": "seed"},
                    "germany_premium": {
                        "source": "airport-differential-pending",
                        "status": "missing",
                        "quality": "missing",
                        "value": None,
                    },
                    "ecb": {
                        "source": "ecb",
                        "status": "ok",
                        "fallback_used": False,
                        "quality": "observed",
                        "value": 1.1592,
                        "observed_at": datetime.now(UTC).isoformat(),
                    },
                },
            )
        )
        db.commit()
        snapshot = market_service.build_market_snapshot_response(db)

    selected = select_fossil_jet_benchmark(snapshot.values, snapshot.source_details)
    # Seed jet/Rotterdam numbers are not quotes. Brent is live, so Rotterdam is the
    # public Brent×1.20 estimate and outranks the US Gulf seed.
    assert snapshot.values.get("jet_usd_per_l") is None
    assert snapshot.values.get("germany_premium_pct") is None
    assert snapshot.source_details["rotterdam_jet_fuel"].status == "estimated"
    assert selected["metric_key"] == "rotterdam_jet_fuel_usd_per_l"
    assert snapshot.derived.get("jet_source") == "rotterdam_jet_fuel_usd_per_l"
    assert selected["quality"] == "derived"
    assert selected["value"] != 0.657
    generated = snapshot.generated_at
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=UTC)
    assert generated.tzinfo is not None
    brent_detail = snapshot.source_details["brent"]
    assert getattr(brent_detail, "observed_at", None) is not None or "observed_at" in brent_detail.model_dump()


def test_health_separates_task_success_from_quote_coverage() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    now = datetime.now(UTC)

    with SessionLocal() as db:
        for offset in range(3):
            db.add(
                MarketRefreshRun(
                    refreshed_at=now - timedelta(minutes=10 * offset),
                    source_status="degraded",
                    ingest="live-refresh",
                    sources={
                        "brent": {"status": "ok", "fallback_used": False, "quality": "observed"},
                        "jet": {"status": "fallback", "fallback_used": True, "quality": "seed"},
                    },
                )
            )
        db.commit()
        health = market_service.build_market_health_response(db)

    assert health.success_rate == 1.0
    assert getattr(health, "quote_coverage_rate", None) is not None
    assert health.quote_coverage_rate < 1.0
    # Task success is not enough: a seed jet quote is not live or stale.
    assert health.healthy is False
    assert any(reason.startswith("jet_") for reason in health.reasons)


def test_missing_quote_date_is_not_replaced_with_fetch_time() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    fetched_later = datetime(2026, 9, 14, 9, 45, tzinfo=UTC)

    with Session(engine) as db:
        persisted = market_service._persist_market_snapshot_set(
            db,
            {"rotterdam_jet_fuel_usd_per_l": 0.88},
            as_of=fetched_later,
            source_status="ok",
            sources={
                "rotterdam_jet_fuel": {
                    "source": "rotterdam-jet-direct",
                    "status": "ok",
                    "fallback_used": False,
                    "quality": "observed",
                    "value": 0.88,
                    "observed_at": None,
                }
            },
            ingest="live-refresh",
        )
        rows = list(db.scalars(select(MarketSnapshot)).all())

    assert persisted == fetched_later
    assert rows == []


def test_derived_quote_is_not_newer_than_its_inputs() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    quote_day = datetime(2026, 9, 10, tzinfo=UTC)
    fetched_later = datetime(2026, 9, 14, 9, 45, tzinfo=UTC)

    with Session(engine) as db:
        market_service._persist_market_snapshot_set(
            db,
            {"jet_eu_proxy_usd_per_l": 0.913, "brent_usd_per_bbl": 120.98},
            as_of=fetched_later,
            source_status="degraded",
            sources={
                "brent": {
                    "source": "eia",
                    "status": "ok",
                    "quality": "observed",
                    "value": 120.98,
                    "observed_at": quote_day.isoformat(),
                    "published_at": quote_day.isoformat(),
                },
                "jet_eu_proxy": {
                    "source": "brent-derived",
                    "status": "fallback",
                    "fallback_used": True,
                    "quality": "derived",
                    "value": 0.913,
                    "observed_at": quote_day.isoformat(),
                    "published_at": quote_day.isoformat(),
                    "input_observed_at": {"brent": quote_day.isoformat()},
                },
            },
            ingest="live-refresh",
        )
        jet = db.scalar(
            select(MarketSnapshot).where(MarketSnapshot.metric_key == "jet_eu_proxy_usd_per_l")
        )

    assert jet is not None
    as_of = jet.as_of.replace(tzinfo=UTC) if jet.as_of.tzinfo is None else jet.as_of
    assert as_of == quote_day
    assert as_of < fetched_later
    assert "2026-09-10" in str(jet.payload.get("observed_at"))


def test_duplicate_quote_does_not_insert_a_second_observation() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    quote_day = datetime(2026, 9, 10, tzinfo=UTC)

    with Session(engine) as db:
        for _ in range(2):
            market_service._persist_market_snapshot_set(
                db,
                {"rotterdam_jet_fuel_usd_per_l": 0.88},
                as_of=datetime(2026, 9, 14, 9, 45, tzinfo=UTC),
                source_status="ok",
                sources={
                    "rotterdam_jet_fuel": {
                        "source": "rotterdam-jet-direct",
                        "status": "ok",
                        "quality": "observed",
                        "value": 0.88,
                        "observed_at": quote_day.isoformat(),
                        "quote_kind": "futures",
                        "product_id": "ICE Jet CIF NWE Cargoes Future",
                    }
                },
                ingest="live-refresh",
            )
        rows = list(db.scalars(select(MarketSnapshot)).all())

    assert len(rows) == 1


def test_legacy_fetch_timestamp_does_not_outrank_newer_observed_quote() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    with Session(engine) as db:
        db.add(
            MarketSnapshot(
                source_key="rotterdam_jet_fuel",
                metric_key="rotterdam_jet_fuel_usd_per_l",
                value=0.657,
                unit="USD/L",
                as_of=datetime(2026, 9, 14, 9, 45, tzinfo=UTC),
                payload={"refresh_run_id": "old-run"},
            )
        )
        db.add(
            MarketSnapshot(
                source_key="rotterdam_jet_fuel",
                metric_key="rotterdam_jet_fuel_usd_per_l",
                value=0.91,
                unit="USD/L",
                as_of=datetime(2026, 9, 10, tzinfo=UTC),
                payload={
                    "quality": "observed",
                    "observed_at": "2026-09-10T00:00:00Z",
                    "quote_kind": "futures",
                    "product_id": "ICE Jet CIF NWE Cargoes Future",
                },
            )
        )
        db.commit()
        latest = market_service._latest_market_snapshots_by_metric(db)["rotterdam_jet_fuel_usd_per_l"]

    assert latest.value == pytest.approx(0.91)
    assert latest.payload.get("quality") == "observed"


def test_history_does_not_mix_spot_and_futures_returns() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    now = datetime(2026, 9, 14, tzinfo=UTC)
    with Session(engine) as db:
        db.add(
            MarketSnapshot(
                source_key="jet_ara_rotterdam_public",
                metric_key="jet_eu_proxy_usd_per_l",
                value=0.80,
                unit="USD/L",
                as_of=now - timedelta(days=7),
                payload={
                    "quality": "observed",
                    "quote_kind": "spot",
                    "product_id": "physical ARA",
                    "source": "ara-rotterdam-public",
                },
            )
        )
        db.add(
            MarketSnapshot(
                source_key="jet_ara_rotterdam_public",
                metric_key="jet_eu_proxy_usd_per_l",
                value=0.88,
                unit="USD/L",
                as_of=now,
                payload={
                    "quality": "observed",
                    "quote_kind": "futures",
                    "product_id": "ICE Jet CIF NWE Cargoes Future",
                    "source": "ara-rotterdam-public",
                },
            )
        )
        db.commit()
        history = market_service.build_market_history_response(db, window_days=30)

    metric = history.metrics["jet_eu_proxy_usd_per_l"]
    assert metric.change_pct_7d is None


def test_history_window_does_not_leak_latest_outside_range() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    inside = datetime(2026, 8, 1, tzinfo=UTC)
    outside = datetime(2026, 9, 14, tzinfo=UTC)
    with Session(engine) as db:
        db.add(
            MarketSnapshot(
                source_key="brent_eia",
                metric_key="brent_usd_per_bbl",
                value=80.0,
                unit="USD/bbl",
                as_of=inside,
                payload={"quality": "observed", "quote_kind": "spot", "product_id": "EIA Brent"},
            )
        )
        db.add(
            MarketSnapshot(
                source_key="brent_eia",
                metric_key="brent_usd_per_bbl",
                value=120.0,
                unit="USD/bbl",
                as_of=outside,
                payload={"quality": "observed", "quote_kind": "spot", "product_id": "EIA Brent"},
            )
        )
        db.commit()
        history = market_service.build_market_history_response(
            db,
            start=datetime(2026, 7, 1, tzinfo=UTC),
            end=datetime(2026, 8, 31, tzinfo=UTC),
        )

    metric = history.metrics["brent_usd_per_bbl"]
    assert metric.latest_value == pytest.approx(80.0)
    assert metric.latest_as_of.replace(tzinfo=UTC) == inside
    assert all(point.as_of.replace(tzinfo=UTC) <= datetime(2026, 8, 31, tzinfo=UTC) for point in metric.points)


def test_seed_fx_and_eua_are_not_selected_as_live_cost_inputs() -> None:
    from app.services.market_quality import select_qualified_input

    fx = select_qualified_input(
        value=1.1435,
        detail={"quality": "seed", "source": "seed-baseline", "status": "seed"},
    )
    eua = select_qualified_input(
        value=80.38,
        detail={"quality": "seed", "source": "seed-baseline", "status": "seed"},
    )
    assert fx["usable_for_cost"] is False
    assert eua["usable_for_cost"] is False


def test_resolve_fossil_jet_does_not_take_first_positive_after_reject() -> None:
    from app.api.routes.analysis import _resolve_fossil_jet_usd_per_l

    with pytest.raises(ValueError, match="usable"):
        _resolve_fossil_jet_usd_per_l(
            {
                "rotterdam_jet_fuel_usd_per_l": 0.657,
                "jet_eu_proxy_usd_per_l": 0.657,
                "jet_usd_per_l": 0.64,
            },
            {
                "rotterdam_jet_fuel": {"quality": "seed", "source": "seed-baseline", "status": "seed"},
                "jet_eu_proxy": {"quality": "seed", "source": "seed-baseline", "status": "seed"},
                "jet": {"quality": "seed", "source": "seed-baseline", "status": "seed"},
            },
        )
