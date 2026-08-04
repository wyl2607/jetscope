from typing import Optional

from sqlalchemy.orm import Session

from app.schemas.reserves import ReserveStressResponse
from app.services.reserves import get_eu_reserve_stress_from_db


_MANUAL_FALLBACK = ReserveStressResponse(
    region="eu",
    coverage_days=20,
    stress_level="elevated",
    supply_gap_pct=25.0,
    source_type="manual",
    confidence=0.62,
)


def get_eu_reserve_stress(db: Optional[Session] = None) -> ReserveStressResponse:
    """Return EU reserve stress.

    When a DB session is provided and `reserves_coverage` has rows, aggregate
    live data; otherwise return the curated manual fallback so the dashboard
    still renders during bootstrap / missing credentials.
    """
    if db is not None:
        live = get_eu_reserve_stress_from_db(db)
        if live is not None:
            return live
    return _MANUAL_FALLBACK.model_copy()
