"""EU jet reserve stress signal.

Coverage days are env-overridable curated input. They are NOT an official
IATA/EUROCONTROL feed. Supply-gap is only emitted when explicitly set.
"""

from __future__ import annotations

import os
from datetime import date

from app.schemas.reserves import ReserveStressResponse

# Curated product baseline used when SAFVSOIL_RESERVE_WEEKS is unset.
# Not an official inventory statistic; label source honestly.
DEFAULT_COVERAGE_DAYS = 21
DEFAULT_STRESS_LEVEL = "elevated"
# LH CEO (article 2026-08-04): fuel supply situation normalized in recent weeks.
# This does NOT provide a new official days figure; it only updates narrative.
SUPPLY_STATUS_NOTE = (
    "Lufthansa CEO (Stand 2026-08-04): aviation-fuel supply situation has "
    "normalized in recent weeks; refinery capacity raised; new supply chains "
    "(e.g. Nigeria) established. Article does not publish EU reserve days."
)
SUPPLY_STATUS_AS_OF = date(2026, 8, 4)


def _parse_positive_float(raw: str | None) -> float | None:
    if raw is None:
        return None
    text = raw.strip()
    if not text:
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    if value < 0:
        return None
    return value


def get_eu_reserve_stress() -> ReserveStressResponse:
    raw_weeks = os.getenv("SAFVSOIL_RESERVE_WEEKS")
    weeks = _parse_positive_float(raw_weeks)
    if weeks is not None:
        coverage_days = int(round(weeks * 7))
        coverage_source = "env:SAFVSOIL_RESERVE_WEEKS"
    else:
        coverage_days = DEFAULT_COVERAGE_DAYS
        coverage_source = "curated_default_21d_unofficial"

    raw_gap = os.getenv("SAFVSOIL_SUPPLY_GAP_PCT")
    gap = _parse_positive_float(raw_gap)
    if gap is not None:
        supply_gap_pct: float | None = min(100.0, gap)
        gap_source = "env:SAFVSOIL_SUPPLY_GAP_PCT"
    else:
        # Do not invent a supply-gap percentage.
        supply_gap_pct = None
        gap_source = "unset_no_estimate"

    raw_stress = (os.getenv("SAFVSOIL_RESERVE_STRESS_LEVEL") or "").strip().lower()
    if raw_stress in {"critical", "elevated", "watch", "normal"}:
        stress_level = raw_stress
        stress_source = "env:SAFVSOIL_RESERVE_STRESS_LEVEL"
    else:
        # Align label with coverage only when env does not override.
        # 21d default => elevated (same band as UI: weeks <= 4).
        weeks_equiv = coverage_days / 7.0
        if weeks_equiv <= 2:
            stress_level = "critical"
        elif weeks_equiv <= 4:
            stress_level = "elevated"
        elif weeks_equiv <= 6:
            stress_level = "watch"
        else:
            stress_level = "normal"
        stress_source = "derived_from_coverage_days"

    # Confidence: lower when gap unknown and coverage is curated default.
    if weeks is not None and gap is not None:
        confidence = 0.7
    elif weeks is not None:
        confidence = 0.55
    else:
        confidence = 0.4

    return ReserveStressResponse(
        region="eu",
        coverage_days=coverage_days,
        stress_level=stress_level,
        supply_gap_pct=supply_gap_pct,
        source_type="manual",
        confidence=confidence,
        source_name="JetScope curated / env override (not IATA/EUROCONTROL live feed)",
        coverage_source=coverage_source,
        supply_gap_source=gap_source,
        stress_source=stress_source,
        supply_status_note=SUPPLY_STATUS_NOTE,
        supply_status_as_of=SUPPLY_STATUS_AS_OF.isoformat(),
    )
