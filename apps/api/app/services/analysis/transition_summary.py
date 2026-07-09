"""Cross-domain transition summary.

Reuses the grid and heat cost models to answer one question across domains: at
what EU ETS / ETS2 carbon price does each clean option beat its fossil reference?
This is the unifying view behind "one carbon price drives multiple decarbonization
frontiers".
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.analysis.grid_costs import (
    DEFAULT_CARBON_PRICE_EUR_PER_T as GRID_REFERENCE_CARBON_EUR_PER_T,
    DEFAULT_GAS_FUEL_EUR_PER_MWH_TH,
    RENEWABLE_TECHS,
    get_fossil_plant,
)
from app.services.analysis.heat_costs import (
    DEFAULT_CARBON_PRICE_EUR_PER_T as HEAT_REFERENCE_CARBON_EUR_PER_T,
    DEFAULT_ELEC_PRICE_EUR_PER_MWH_EL,
    DEFAULT_GAS_PRICE_EUR_PER_MWH_TH,
    HEAT_PUMP_TECHS,
    hp_heat_cost,
)
from app.services.analysis.heat_sensitivity import breakeven_carbon_price_eur_per_t as heat_breakeven

TRANSITION_DISCLAIMER = (
    "Personal portfolio project. Breakeven carbon prices reuse the grid and heat "
    "cost models on illustrative public ranges; not investment-grade assessments."
)


@dataclass(frozen=True, slots=True)
class TransitionTechResult:
    tech_key: str
    name: str
    breakeven_carbon_price_eur_per_t: float
    competitive_at_reference: bool


@dataclass(frozen=True, slots=True)
class TransitionDomainResult:
    domain_key: str
    domain_name: str
    carbon_driver: str
    reference_carbon_price_eur_per_t: float
    techs: list[TransitionTechResult]


def grid_breakeven_carbon_price(
    lcoe_eur_per_mwh: float,
    *,
    fuel_cost_eur_per_mwh_th: float = DEFAULT_GAS_FUEL_EUR_PER_MWH_TH,
    fossil_plant_key: str = "gas_ccgt",
) -> float:
    plant = get_fossil_plant(fossil_plant_key)
    raw = (
        lcoe_eur_per_mwh
        - fuel_cost_eur_per_mwh_th / plant.efficiency
        - plant.var_o_m_eur_per_mwh
    ) / plant.emission_intensity_t_per_mwh
    return max(0.0, raw)


def _grid_domain() -> TransitionDomainResult:
    techs: list[TransitionTechResult] = []
    for tech in RENEWABLE_TECHS.values():
        breakeven = grid_breakeven_carbon_price(tech.lcoe_mid_eur_per_mwh)
        techs.append(
            TransitionTechResult(
                tech_key=tech.tech_key,
                name=tech.name,
                breakeven_carbon_price_eur_per_t=breakeven,
                competitive_at_reference=breakeven <= GRID_REFERENCE_CARBON_EUR_PER_T,
            )
        )
    return TransitionDomainResult(
        domain_key="grid",
        domain_name="电网新能源",
        carbon_driver="EU ETS",
        reference_carbon_price_eur_per_t=GRID_REFERENCE_CARBON_EUR_PER_T,
        techs=techs,
    )


def _heat_domain() -> TransitionDomainResult:
    techs: list[TransitionTechResult] = []
    for tech_key, tech in HEAT_PUMP_TECHS.items():
        hp_cost = hp_heat_cost(cop=tech.cop, elec_price_eur_per_mwh_el=DEFAULT_ELEC_PRICE_EUR_PER_MWH_EL)
        breakeven = heat_breakeven(
            hp_cost=hp_cost,
            gas_price_eur_per_mwh_th=DEFAULT_GAS_PRICE_EUR_PER_MWH_TH,
        )
        techs.append(
            TransitionTechResult(
                tech_key=tech_key,
                name=tech.name,
                breakeven_carbon_price_eur_per_t=breakeven,
                competitive_at_reference=breakeven <= HEAT_REFERENCE_CARBON_EUR_PER_T,
            )
        )
    return TransitionDomainResult(
        domain_key="heat",
        domain_name="居民供暖",
        carbon_driver="EU ETS2",
        reference_carbon_price_eur_per_t=HEAT_REFERENCE_CARBON_EUR_PER_T,
        techs=techs,
    )


def compute_transition_summary() -> list[TransitionDomainResult]:
    return [_grid_domain(), _heat_domain()]
