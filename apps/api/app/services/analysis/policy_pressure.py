"""EU ETS carbon-pressure projection over a caller-supplied price range.

Assumption-light by design: the EU ETS price path is provided by the caller as
a min/max/step sweep rather than baked in, so the projection stays explicit and
reproducible (see issue #78). Reuses the fossil-jet emissions factor and the
EUR->USD rate from the pathway cost engine.
"""

import math

from app.services.analysis.pathway_costs import EUR_TO_USD, FOSSIL_JET_EMISSIONS_KG_PER_L

EU_ETS_SOURCE_UPDATED_AT = "2026-04-23"
EU_ETS_SOURCE_CADENCE = "quarterly"


def _ensure_finite(value: float, *, label: str) -> None:
    if not math.isfinite(value):
        raise ValueError(f"{label} must be finite")


def eu_ets_pressure_curve(
    *,
    fossil_jet_usd_per_l: float,
    exempt_blend_pct: float = 0.0,
    eu_ets_min: float = 0.0,
    eu_ets_max: float = 200.0,
    eu_ets_step: float = 10.0,
) -> list[dict]:
    if eu_ets_step <= 0:
        raise ValueError("eu_ets_step must be > 0")
    if eu_ets_max < eu_ets_min:
        raise ValueError("eu_ets_max must be >= eu_ets_min")

    fossil_share = 1.0 - (exempt_blend_pct / 100.0)
    points: list[dict] = []
    ets = eu_ets_min
    while ets <= eu_ets_max + 1e-9:
        carbon_cost = ets * EUR_TO_USD * (FOSSIL_JET_EMISSIONS_KG_PER_L / 1000.0) * fossil_share
        effective = fossil_jet_usd_per_l + carbon_cost
        _ensure_finite(carbon_cost, label="carbon_cost_usd_per_l")
        _ensure_finite(effective, label="effective_fossil_jet_usd_per_l")

        if fossil_jet_usd_per_l > 0:
            pressure_pct: float | None = (carbon_cost / fossil_jet_usd_per_l) * 100.0
            _ensure_finite(pressure_pct, label="pressure_pct")
        else:
            pressure_pct = None

        points.append(
            {
                "eu_ets_eur_per_t": round(ets, 4),
                "carbon_cost_usd_per_l": carbon_cost,
                "effective_fossil_jet_usd_per_l": effective,
                "pressure_pct": pressure_pct,
            }
        )
        ets += eu_ets_step

    return points


def pressure_signal(points: list[dict]) -> str:
    pressures = [p["pressure_pct"] for p in points if p["pressure_pct"] is not None]
    if not pressures:
        return "low"
    peak = max(pressures)
    if peak <= 10:
        return "low"
    if peak <= 25:
        return "moderate"
    if peak <= 50:
        return "high"
    return "severe"


def eu_ets_pressure_source() -> dict:
    return {
        "source_type": "derived",
        "confidence_score": 0.7,
        "cadence": EU_ETS_SOURCE_CADENCE,
        "updated_at": EU_ETS_SOURCE_UPDATED_AT,
        "fallback_used": False,
    }
