"""Residential heating parity cost model.

Illustrative EU household energy price ranges for 2024 are represented in
EUR/MWh and paired with the EU ETS2 design for building/heating fuels from
2027. Electricity upstream carbon is intentionally out of scope for this
direct heat-pump-vs-gas-boiler comparison.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class HeatPumpTech:
    cop: float
    name: str


@dataclass(frozen=True, slots=True)
class GasBoiler:
    efficiency: float
    emission_intensity_t_per_mwh_th: float
    name: str


HEAT_PUMP_TECHS: dict[str, HeatPumpTech] = {
    "air_source": HeatPumpTech(cop=3.0, name="空气源热泵"),
    "ground_source": HeatPumpTech(cop=4.0, name="地源热泵"),
}

GAS_BOILER = GasBoiler(
    efficiency=0.92,
    emission_intensity_t_per_mwh_th=0.20,
    name="燃气冷凝锅炉",
)

DEFAULT_ELEC_PRICE_EUR_PER_MWH_EL = 300.0
DEFAULT_GAS_PRICE_EUR_PER_MWH_TH = 75.0
DEFAULT_CARBON_PRICE_EUR_PER_T = 45.0


def hp_heat_cost(*, cop: float, elec_price_eur_per_mwh_el: float) -> float:
    return elec_price_eur_per_mwh_el / cop


def gas_heat_cost(
    *,
    gas_price_eur_per_mwh_th: float,
    carbon_price_eur_per_t: float,
    boiler: GasBoiler = GAS_BOILER,
) -> float:
    fuel_cost = gas_price_eur_per_mwh_th / boiler.efficiency
    carbon_cost = (
        carbon_price_eur_per_t
        * boiler.emission_intensity_t_per_mwh_th
        / boiler.efficiency
    )
    return fuel_cost + carbon_cost
