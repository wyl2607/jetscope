"""Heating parity analysis: heat pumps vs gas boiler + EU ETS2 carbon.

A negative spread means the heat pump is already cheaper per MWh of useful
heat than the carbon-adjusted gas condensing boiler reference.
"""

from __future__ import annotations

from app.schemas.heat import (
    HeatCarbonSweepEntry,
    HeatCarbonSweepPoint,
    HeatParityRow,
    HeatParitySignal,
)
from app.services.analysis.crossover import SpreadThresholds, compute_crossover
from app.services.analysis.heat_costs import (
    GAS_BOILER,
    HEAT_PUMP_TECHS,
    GasBoiler,
    gas_heat_cost,
    hp_heat_cost,
)

HEAT_SPREAD_THRESHOLDS = SpreadThresholds(high=25.0, mid=5.0, low=-10.0)
HEAT_STATUS_LABELS: tuple[str, str, str, str] = (
    "uneconomic",
    "inflection",
    "marginal_switch",
    "dominant",
)


def _breakeven_carbon_price(
    *,
    hp_cost: float,
    gas_price_eur_per_mwh_th: float,
    boiler: GasBoiler,
) -> float:
    raw = (
        (hp_cost - gas_price_eur_per_mwh_th / boiler.efficiency)
        * boiler.efficiency
        / boiler.emission_intensity_t_per_mwh_th
    )
    return max(0.0, raw)


def compute_heat_parity_rows(
    *,
    carbon_price_eur_per_t: float,
    elec_price_eur_per_mwh_el: float,
    gas_price_eur_per_mwh_th: float,
) -> list[HeatParityRow]:
    reference = gas_heat_cost(
        gas_price_eur_per_mwh_th=gas_price_eur_per_mwh_th,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
    )
    if reference <= 0:
        raise ValueError("gas heat cost must be > 0")

    rows: list[HeatParityRow] = []
    for tech_key, tech in HEAT_PUMP_TECHS.items():
        clean = hp_heat_cost(cop=tech.cop, elec_price_eur_per_mwh_el=elec_price_eur_per_mwh_el)
        crossover = compute_crossover(
            clean_cost=clean,
            reference_cost=reference,
            thresholds=HEAT_SPREAD_THRESHOLDS,
            labels=HEAT_STATUS_LABELS,
        )
        rows.append(
            HeatParityRow(
                tech_key=tech_key,
                name=tech.name,
                cop=tech.cop,
                hp_heat_cost_eur_per_mwh=clean,
                gas_heat_cost_eur_per_mwh=reference,
                gap_vs_gas_eur_per_mwh=crossover.gap,
                spread_pct=crossover.spread_pct,
                breakeven_carbon_price_eur_per_t=_breakeven_carbon_price(
                    hp_cost=clean,
                    gas_price_eur_per_mwh_th=gas_price_eur_per_mwh_th,
                    boiler=GAS_BOILER,
                ),
                status=crossover.status,  # type: ignore[arg-type]
            )
        )
    return rows


def heat_carbon_price_sweep(
    *,
    elec_price_eur_per_mwh_el: float,
    gas_price_eur_per_mwh_th: float,
    carbon_min: float,
    carbon_max: float,
    step: float,
) -> list[HeatCarbonSweepPoint]:
    if step <= 0:
        raise ValueError("step must be > 0")
    if carbon_max < carbon_min:
        raise ValueError("carbon_max must be >= carbon_min")

    points: list[HeatCarbonSweepPoint] = []
    carbon_price = carbon_min
    while carbon_price <= carbon_max:
        reference = gas_heat_cost(
            gas_price_eur_per_mwh_th=gas_price_eur_per_mwh_th,
            carbon_price_eur_per_t=carbon_price,
        )
        if reference <= 0:
            raise ValueError("gas heat cost must be > 0")

        entries: list[HeatCarbonSweepEntry] = []
        for tech_key, tech in HEAT_PUMP_TECHS.items():
            clean = hp_heat_cost(
                cop=tech.cop, elec_price_eur_per_mwh_el=elec_price_eur_per_mwh_el
            )
            crossover = compute_crossover(
                clean_cost=clean,
                reference_cost=reference,
                thresholds=HEAT_SPREAD_THRESHOLDS,
                labels=HEAT_STATUS_LABELS,
            )
            entries.append(
                HeatCarbonSweepEntry(
                    tech_key=tech_key,
                    gap_vs_gas_eur_per_mwh=crossover.gap,
                    status=crossover.status,  # type: ignore[arg-type]
                )
            )
        points.append(
            HeatCarbonSweepPoint(
                carbon_price_eur_per_t=carbon_price,
                gas_heat_cost_eur_per_mwh=reference,
                techs=entries,
            )
        )
        carbon_price += step
    return points


def heat_parity_signal(rows: list[HeatParityRow]) -> HeatParitySignal:
    dominant = [row for row in rows if row.status == "dominant"]
    if dominant:
        return "clear_leader"
    if any(row.status in ("marginal_switch", "inflection") for row in rows):
        return "close_race"
    return "no_advantage"
