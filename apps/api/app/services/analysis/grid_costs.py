"""European grid-parity cost model.

Renewable LCOE bands and fossil plant parameters are illustrative public
ranges for Germany/EU (~2024). Provenance and the historical gap series live
in ``apps/api/data/grid/eu_grid_baseline.json``. Sources:
- Fraunhofer ISE, "Stromgestehungskosten Erneuerbare Energien" (2024)
- IRENA, "Renewable Power Generation Costs" (2023)
- Ember, European electricity & EU ETS carbon price series
"""

from __future__ import annotations

from dataclasses import dataclass

from app.schemas.grid import FossilReference, RenewableTechBand


@dataclass(frozen=True, slots=True)
class RenewableTech:
    tech_key: str
    name: str
    lcoe_low_eur_per_mwh: float
    lcoe_mid_eur_per_mwh: float
    lcoe_high_eur_per_mwh: float
    maturity_level: str


@dataclass(frozen=True, slots=True)
class FossilPlant:
    plant_key: str
    name: str
    efficiency: float
    var_o_m_eur_per_mwh: float
    emission_intensity_t_per_mwh: float


RENEWABLE_TECHS: dict[str, RenewableTech] = {
    "solar_pv": RenewableTech("solar_pv", "Solar PV (utility)", 41.0, 55.0, 69.0, "commercial"),
    "onshore_wind": RenewableTech("onshore_wind", "Onshore Wind", 43.0, 60.0, 92.0, "commercial"),
    "offshore_wind": RenewableTech("offshore_wind", "Offshore Wind", 49.0, 80.0, 113.0, "scaling"),
}

FOSSIL_PLANTS: dict[str, FossilPlant] = {
    "gas_ccgt": FossilPlant("gas_ccgt", "Gas CCGT", 0.55, 4.0, 0.35),
    "hard_coal": FossilPlant("hard_coal", "Hard Coal", 0.40, 6.0, 0.90),
}

DEFAULT_FOSSIL_REFERENCE_KEY = "gas_ccgt"
DEFAULT_GAS_FUEL_EUR_PER_MWH_TH = 30.0
DEFAULT_COAL_FUEL_EUR_PER_MWH_TH = 12.0
DEFAULT_CARBON_PRICE_EUR_PER_T = 65.0


def list_renewable_techs() -> list[RenewableTech]:
    return list(RENEWABLE_TECHS.values())


def get_renewable_tech(tech_key: str) -> RenewableTech:
    normalized = tech_key.strip().lower()
    if normalized not in RENEWABLE_TECHS:
        raise KeyError(tech_key)
    return RENEWABLE_TECHS[normalized]


def get_fossil_plant(plant_key: str) -> FossilPlant:
    normalized = plant_key.strip().lower()
    if normalized not in FOSSIL_PLANTS:
        raise KeyError(plant_key)
    return FOSSIL_PLANTS[normalized]


def fuel_cost_for_plant(
    plant_key: str,
    *,
    gas_fuel_eur_per_mwh_th: float,
    coal_fuel_eur_per_mwh_th: float,
) -> float:
    if get_fossil_plant(plant_key).plant_key == "hard_coal":
        return coal_fuel_eur_per_mwh_th
    return gas_fuel_eur_per_mwh_th


def fossil_marginal_cost(
    plant_key: str,
    *,
    fuel_cost_eur_per_mwh_th: float,
    carbon_price_eur_per_t: float,
) -> float:
    plant = get_fossil_plant(plant_key)
    fuel_per_mwh_el = fuel_cost_eur_per_mwh_th / plant.efficiency
    carbon_per_mwh_el = carbon_price_eur_per_t * plant.emission_intensity_t_per_mwh
    return fuel_per_mwh_el + plant.var_o_m_eur_per_mwh + carbon_per_mwh_el


def renewable_band_schema(tech: RenewableTech) -> RenewableTechBand:
    return RenewableTechBand(
        tech_key=tech.tech_key,
        name=tech.name,
        lcoe_low_eur_per_mwh=tech.lcoe_low_eur_per_mwh,
        lcoe_mid_eur_per_mwh=tech.lcoe_mid_eur_per_mwh,
        lcoe_high_eur_per_mwh=tech.lcoe_high_eur_per_mwh,
        maturity_level=tech.maturity_level,
    )


def fossil_reference_schema(
    plant_key: str,
    *,
    fuel_cost_eur_per_mwh_th: float,
    carbon_price_eur_per_t: float,
) -> FossilReference:
    plant = get_fossil_plant(plant_key)
    marginal = fossil_marginal_cost(
        plant_key,
        fuel_cost_eur_per_mwh_th=fuel_cost_eur_per_mwh_th,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
    )
    return FossilReference(
        plant_key=plant.plant_key,
        name=plant.name,
        efficiency=plant.efficiency,
        fuel_cost_eur_per_mwh_th=fuel_cost_eur_per_mwh_th,
        var_o_m_eur_per_mwh=plant.var_o_m_eur_per_mwh,
        emission_intensity_t_per_mwh=plant.emission_intensity_t_per_mwh,
        marginal_cost_eur_per_mwh=marginal,
    )
