"""Grid-parity analysis: renewable LCOE vs fossil marginal cost + EU ETS carbon.

Reuses the domain-agnostic crossover core shared with the SAF tipping-point
engine. A negative spread means the renewable option is already cheaper than
the carbon-adjusted fossil reference ("dominant").
"""

from __future__ import annotations

from app.schemas.grid import (
    GridCarbonSweepEntry,
    GridCarbonSweepPoint,
    GridParityRow,
    GridParitySignal,
)
from app.services.analysis.crossover import SpreadThresholds, compute_crossover
from app.services.analysis.grid_costs import RENEWABLE_TECHS, fossil_marginal_cost

GRID_SPREAD_THRESHOLDS = SpreadThresholds(high=25.0, mid=5.0, low=-10.0)
GRID_STATUS_LABELS: tuple[str, str, str, str] = (
    "uneconomic",
    "inflection",
    "marginal_switch",
    "dominant",
)


def compute_grid_parity_rows(
    *,
    fossil_plant_key: str,
    fuel_cost_eur_per_mwh_th: float,
    carbon_price_eur_per_t: float,
) -> list[GridParityRow]:
    reference = fossil_marginal_cost(
        fossil_plant_key,
        fuel_cost_eur_per_mwh_th=fuel_cost_eur_per_mwh_th,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
    )
    rows: list[GridParityRow] = []
    for tech in RENEWABLE_TECHS.values():
        crossover = compute_crossover(
            clean_cost=tech.lcoe_mid_eur_per_mwh,
            reference_cost=reference,
            thresholds=GRID_SPREAD_THRESHOLDS,
            labels=GRID_STATUS_LABELS,
        )
        rows.append(
            GridParityRow(
                tech_key=tech.tech_key,
                name=tech.name,
                lcoe_mid_eur_per_mwh=tech.lcoe_mid_eur_per_mwh,
                maturity_level=tech.maturity_level,
                gap_vs_fossil_eur_per_mwh=crossover.gap,
                spread_pct=crossover.spread_pct,
                status=crossover.status,  # type: ignore[arg-type]
            )
        )
    return rows


def grid_carbon_price_sweep(
    *,
    fossil_plant_key: str,
    fuel_cost_eur_per_mwh_th: float,
    carbon_min: float,
    carbon_max: float,
    step: float,
) -> list[GridCarbonSweepPoint]:
    if step <= 0:
        raise ValueError("step must be > 0")
    if carbon_max < carbon_min:
        raise ValueError("carbon_max must be >= carbon_min")

    points: list[GridCarbonSweepPoint] = []
    carbon_price = carbon_min
    while carbon_price <= carbon_max:
        reference = fossil_marginal_cost(
            fossil_plant_key,
            fuel_cost_eur_per_mwh_th=fuel_cost_eur_per_mwh_th,
            carbon_price_eur_per_t=carbon_price,
        )
        entries: list[GridCarbonSweepEntry] = []
        for tech in RENEWABLE_TECHS.values():
            crossover = compute_crossover(
                clean_cost=tech.lcoe_mid_eur_per_mwh,
                reference_cost=reference,
                thresholds=GRID_SPREAD_THRESHOLDS,
                labels=GRID_STATUS_LABELS,
            )
            entries.append(
                GridCarbonSweepEntry(
                    tech_key=tech.tech_key,
                    gap_vs_fossil_eur_per_mwh=crossover.gap,
                    status=crossover.status,  # type: ignore[arg-type]
                )
            )
        points.append(
            GridCarbonSweepPoint(
                carbon_price_eur_per_t=carbon_price,
                fossil_marginal_cost_eur_per_mwh=reference,
                techs=entries,
            )
        )
        carbon_price += step
    return points


def grid_parity_signal(rows: list[GridParityRow]) -> GridParitySignal:
    dominant = [row for row in rows if row.status == "dominant"]
    if dominant:
        return "clear_leader"
    if any(row.status in ("marginal_switch", "inflection") for row in rows):
        return "close_race"
    return "no_advantage"
