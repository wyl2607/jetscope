from __future__ import annotations

from datetime import UTC, datetime, timedelta

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
                    "brent": {"source": "eia", "status": "ok", "fallback_used": False, "quality": "observed", "value": 120.98},
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
                    "ecb": {"source": "ecb", "status": "ok", "fallback_used": False, "quality": "observed", "value": 1.1592},
                },
            )
        )
        db.commit()
        snapshot = market_service.build_market_snapshot_response(db)

    selected = select_fossil_jet_benchmark(snapshot.values, snapshot.source_details)
    assert selected["metric_key"] == "jet_eu_proxy_usd_per_l"
    assert snapshot.derived.get("jet_source") == "jet_eu_proxy_usd_per_l"
    assert snapshot.values.get("germany_premium_pct") is None
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

    assert health.healthy is True
    assert health.success_rate == 1.0
    assert getattr(health, "quote_coverage_rate", None) is not None
    assert health.quote_coverage_rate < 1.0
