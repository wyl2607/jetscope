"""Reserves coverage service: IEA ingest + aggregation for the EU reserve signal."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable, Optional
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.tables import ReservesCoverage
from app.schemas.reserves import ReserveStressResponse

logger = logging.getLogger("jetscope.reserves")

EU_COUNTRIES: tuple[str, ...] = ("DE", "FR", "NL", "IT", "ES", "PL")


def _stress_level(coverage_days: float) -> str:
    if coverage_days < 14:
        return "critical"
    if coverage_days < 21:
        return "elevated"
    if coverage_days < 28:
        return "guarded"
    return "normal"


def _supply_gap_pct(coverage_days: float) -> float:
    # Linear ramp: 50 days → 0%, 10 days → 100%; clamp to [0,100].
    if coverage_days >= 50:
        return 0.0
    if coverage_days <= 10:
        return 100.0
    return round(100.0 * (50.0 - coverage_days) / 40.0, 1)


def latest_coverage_per_country(
    db: Session, countries: Iterable[str] = EU_COUNTRIES
) -> dict[str, ReservesCoverage]:
    """Return the latest ReservesCoverage row per country for the given set."""
    result: dict[str, ReservesCoverage] = {}
    for iso in countries:
        row = db.scalars(
            select(ReservesCoverage)
            .where(ReservesCoverage.country_iso == iso)
            .order_by(ReservesCoverage.timestamp.desc())
            .limit(1)
        ).first()
        if row is not None:
            result[iso] = row
    return result


def get_eu_reserve_stress_from_db(db: Session) -> Optional[ReserveStressResponse]:
    """Aggregate latest per-country coverage into an EU-level stress response.

    Returns None if the table has no usable rows yet (caller should fall back).
    """
    rows = latest_coverage_per_country(db)
    if not rows:
        return None

    coverage_days = sum(r.stock_days for r in rows.values()) / len(rows)
    avg_confidence = sum(r.confidence for r in rows.values()) / len(rows)
    sources = {r.source for r in rows.values()}
    source_type = "official" if any("iea" in s.lower() for s in sources) else "derived"
    observed_at = max(r.timestamp for r in rows.values())
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=timezone.utc)

    return ReserveStressResponse(
        region="eu",
        coverage_days=int(round(coverage_days)),
        stress_level=_stress_level(coverage_days),
        supply_gap_pct=_supply_gap_pct(coverage_days),
        source_type=source_type,
        confidence=round(avg_confidence, 2),
        observed_at=observed_at,
    )


def refresh_reserves_coverage(db: Session, adapter=None) -> int:
    """Fetch IEA stock-days for EU_COUNTRIES and persist rows.

    Returns the number of rows inserted. Silently returns 0 when the IEA
    adapter is unconfigured (no API key), so the refresh loop can keep running.
    """
    # Import locally to keep module import cheap when IEA isn't configured.
    from adapters.iea import ConfigError, IEAAdapter

    if adapter is None:
        try:
            adapter = IEAAdapter()
        except Exception as exc:  # pragma: no cover - constructor is trivial
            logger.warning("reserves_refresh_init_failed err=%s", exc)
            return 0

    inserted = 0
    now = datetime.now(timezone.utc)
    for iso in EU_COUNTRIES:
        try:
            coverage = adapter.fetch_stock_days_coverage(iso)
        except ConfigError:
            logger.info("reserves_refresh_skipped_no_api_key")
            return inserted
        except Exception as exc:
            logger.warning("reserves_refresh_country_failed country=%s err=%s", iso, exc)
            continue

        row = ReservesCoverage(
            id=str(uuid4()),
            country_iso=iso,
            timestamp=coverage.timestamp or now,
            stock_days=float(coverage.stock_days),
            source=coverage.source,
            confidence=float(coverage.confidence),
            fetched_at=now,
        )
        db.add(row)
        inserted += 1

    if inserted:
        db.commit()
        logger.info("reserves_refresh_cycle inserted=%s", inserted)
    return inserted
