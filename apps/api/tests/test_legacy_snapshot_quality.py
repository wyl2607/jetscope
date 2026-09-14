from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.tables import MarketRefreshRun, MarketSnapshot
from app.services import market as market_service
from app.services.market_quality import (
    SIGNAL_QUALITIES,
    backfill_legacy_market_snapshots,
    recover_quality_from_refresh_run,
    select_fossil_jet_benchmark,
    snapshot_quality,
)


def test_production_shaped_legacy_rows_are_upgraded_without_deleting_history() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    fetched = datetime(2026, 9, 1, 8, 0, tzinfo=UTC)

    with Session(engine) as db:
        run = MarketRefreshRun(
            refreshed_at=fetched,
            source_status="degraded",
            ingest="live-refresh",
            sources={
                "rotterdam_jet_fuel": {
                    "source": "rotterdam-jet-direct",
                    "status": "fallback",
                    "fallback_used": True,
                    "value": 0.657,
                },
                "brent": {
                    "source": "eia",
                    "status": "ok",
                    "fallback_used": False,
                    "value": 87.01,
                    "observed_at": "2026-08-31T00:00:00Z",
                },
            },
        )
        db.add(run)
        db.flush()
        recoverable = MarketSnapshot(
            source_key="rotterdam_jet_fuel",
            metric_key="rotterdam_jet_fuel_usd_per_l",
            value=0.657,
            unit="USD/L",
            as_of=fetched,
            payload={"refresh_run_id": run.id},
        )
        orphan = MarketSnapshot(
            source_key="jet_fred_proxy",
            metric_key="jet_usd_per_l",
            value=0.64,
            unit="USD/L",
            as_of=fetched,
            payload={"refresh_run_id": "missing-run"},
        )
        observed = MarketSnapshot(
            source_key="brent_eia",
            metric_key="brent_usd_per_bbl",
            value=87.01,
            unit="USD/bbl",
            as_of=datetime(2026, 8, 31, tzinfo=UTC),
            payload={"quality": "observed", "observed_at": "2026-08-31T00:00:00Z"},
        )
        db.add_all([recoverable, orphan, observed])
        db.commit()

        changed = backfill_legacy_market_snapshots(db)
        db.commit()

        rows = {row.metric_key: row for row in db.scalars(select(MarketSnapshot)).all()}

    assert changed >= 2
    assert len(rows) == 3
    rotterdam_quality = snapshot_quality(rows["rotterdam_jet_fuel_usd_per_l"].payload)
    orphan_quality = snapshot_quality(rows["jet_usd_per_l"].payload)
    assert rotterdam_quality not in SIGNAL_QUALITIES
    assert rotterdam_quality in {"seed", "unknown", "legacy", "unverified"}
    assert orphan_quality in {"unknown", "legacy", "unverified"}
    assert snapshot_quality(rows["brent_usd_per_bbl"].payload) == "observed"
    assert rows["brent_usd_per_bbl"].payload.get("quality") == "observed"


def test_recover_quality_does_not_promote_ok_status_without_quote_date() -> None:
    recovered = recover_quality_from_refresh_run(
        {"refresh_run_id": "abc"},
        metric_key="rotterdam_jet_fuel_usd_per_l",
        refresh_sources={
            "rotterdam_jet_fuel": {
                "source": "rotterdam-jet-direct",
                "status": "ok",
                "fallback_used": False,
                "value": 0.88,
            }
        },
    )
    assert recovered["quality"] not in SIGNAL_QUALITIES
    assert recovered["quality"] in {"unknown", "legacy", "unverified"}
    assert not recovered.get("observed_at")
    assert recovered.get("legacy") is True


def test_recover_quality_keeps_observed_when_refresh_has_quote_date() -> None:
    recovered = recover_quality_from_refresh_run(
        {"refresh_run_id": "abc"},
        metric_key="brent_usd_per_bbl",
        refresh_sources={
            "brent": {
                "source": "eia",
                "status": "ok",
                "fallback_used": False,
                "value": 87.01,
                "observed_at": "2026-08-31T00:00:00Z",
            }
        },
    )
    assert recovered["quality"] == "observed"
    assert recovered["observed_at"] == "2026-08-31T00:00:00Z"


def test_backfill_then_snapshot_read_does_not_treat_undated_ok_as_observed() -> None:
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(bind=engine)
    fetched = datetime(2026, 9, 1, 8, 0, tzinfo=UTC)
    required = [
        ("brent_eia", "brent_usd_per_bbl", 87.01, "USD/bbl"),
        ("jet_fred_proxy", "jet_usd_per_l", 0.64, "USD/L"),
        ("cbam_proxy", "carbon_proxy_usd_per_t", 91.91, "USD/tCO2"),
        ("jet_ara_rotterdam_public", "jet_eu_proxy_usd_per_l", 0.913, "USD/L"),
        ("rotterdam_jet_fuel", "rotterdam_jet_fuel_usd_per_l", 0.88, "USD/L"),
        ("eu_ets_eex", "eu_ets_price_eur_per_t", 80.0, "EUR/tCO2"),
        ("ecb_eur_usd", "usd_per_eur", 1.25, "USD/EUR"),
    ]

    with Session(engine) as db:
        run = MarketRefreshRun(
            refreshed_at=fetched,
            source_status="ok",
            ingest="live-refresh",
            sources={
                "rotterdam_jet_fuel": {
                    "source": "rotterdam-jet-direct",
                    "status": "ok",
                    "fallback_used": False,
                    "value": 0.88,
                }
            },
        )
        db.add(run)
        db.flush()
        for source_key, metric_key, value, unit in required:
            payload = (
                {"refresh_run_id": run.id}
                if metric_key == "rotterdam_jet_fuel_usd_per_l"
                else {"quality": "unknown", "legacy": True}
            )
            db.add(
                MarketSnapshot(
                    source_key=source_key,
                    metric_key=metric_key,
                    value=value,
                    unit=unit,
                    as_of=fetched,
                    payload=payload,
                )
            )
        db.commit()

        changed = backfill_legacy_market_snapshots(db)
        db.commit()
        snapshot = market_service.build_market_snapshot_response(db)
        rotterdam_row = db.scalar(
            select(MarketSnapshot).where(MarketSnapshot.metric_key == "rotterdam_jet_fuel_usd_per_l")
        )

    assert changed >= 1
    rotterdam_payload = rotterdam_row.payload if rotterdam_row is not None else {}
    assert snapshot_quality(rotterdam_payload) not in SIGNAL_QUALITIES
    assert snapshot_quality(rotterdam_payload) in {"unknown", "legacy", "unverified"}
    assert not rotterdam_payload.get("observed_at")

    rotterdam_detail = snapshot.source_details["rotterdam_jet_fuel"]
    assert rotterdam_detail.quality not in SIGNAL_QUALITIES
    assert rotterdam_detail.quality != "observed"
    assert rotterdam_detail.observed_at is None

    selected = select_fossil_jet_benchmark(snapshot.values, snapshot.source_details)
    assert selected["usable_for_signal"] is False
    assert snapshot.derived.get("usable_for_signal") is False
