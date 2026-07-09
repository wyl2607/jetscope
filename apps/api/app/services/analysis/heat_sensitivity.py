"""Heating sensitivity: breakeven ETS2 carbon price across COP × electricity price.

Mirrors the grid LCOE sensitivity module. For each (COP, electricity price) cell,
holding the gas price fixed, it reports the heat-pump heat cost and the carbon
price at which the gas boiler reference reaches that cost (the breakeven point).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.analysis.heat_costs import (
    DEFAULT_ELEC_PRICE_EUR_PER_MWH_EL,
    DEFAULT_GAS_PRICE_EUR_PER_MWH_TH,
    GAS_BOILER,
    GasBoiler,
    hp_heat_cost,
)

COP_VALUES: tuple[float, ...] = (2.5, 3.0, 3.5, 4.0)

HEAT_SENSITIVITY_DISCLAIMER = (
    "Personal portfolio project. Illustrative EU household energy ranges (2024) paired "
    "with the EU ETS2 design for heating fuels; not investment-grade assessments."
)


@dataclass(frozen=True, slots=True)
class HeatSensitivityPoint:
    cop: float
    elec_price_eur_per_mwh_el: float
    hp_heat_cost_eur_per_mwh: float
    breakeven_carbon_price_eur_per_t: float


def elec_price_scan(
    baseline: float = DEFAULT_ELEC_PRICE_EUR_PER_MWH_EL,
) -> tuple[float, float, float]:
    return (float(round(baseline * 0.8)), float(baseline), float(round(baseline * 1.2)))


def breakeven_carbon_price_eur_per_t(
    *,
    hp_cost: float,
    gas_price_eur_per_mwh_th: float,
    boiler: GasBoiler = GAS_BOILER,
) -> float:
    raw = (
        (hp_cost - gas_price_eur_per_mwh_th / boiler.efficiency)
        * boiler.efficiency
        / boiler.emission_intensity_t_per_mwh_th
    )
    return max(0.0, raw)


def compute_heat_sensitivity(
    *,
    gas_price_eur_per_mwh_th: float = DEFAULT_GAS_PRICE_EUR_PER_MWH_TH,
) -> list[HeatSensitivityPoint]:
    points: list[HeatSensitivityPoint] = []
    for elec_price in elec_price_scan():
        for cop in COP_VALUES:
            hp_cost = hp_heat_cost(cop=cop, elec_price_eur_per_mwh_el=elec_price)
            points.append(
                HeatSensitivityPoint(
                    cop=cop,
                    elec_price_eur_per_mwh_el=elec_price,
                    hp_heat_cost_eur_per_mwh=hp_cost,
                    breakeven_carbon_price_eur_per_t=breakeven_carbon_price_eur_per_t(
                        hp_cost=hp_cost,
                        gas_price_eur_per_mwh_th=gas_price_eur_per_mwh_th,
                    ),
                )
            )
    return points
