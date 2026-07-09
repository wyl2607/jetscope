"""Bottom-up renewable LCOE sensitivity model for grid-parity analysis."""

from __future__ import annotations

from dataclasses import dataclass

from app.services.analysis.grid_costs import FossilPlant, get_fossil_plant


@dataclass(frozen=True, slots=True)
class RenewableLcoeCostInput:
    tech_key: str
    name: str
    capex_eur_per_kw: float
    fixed_om_eur_per_kw_yr: float
    lifetime_years: int
    baseline_full_load_hours: int


@dataclass(frozen=True, slots=True)
class LcoeSensitivityPoint:
    discount_rate: float
    full_load_hours: int
    lcoe_eur_per_mwh: float
    breakeven_carbon_price_eur_per_t: float


LCOE_SENSITIVITY_TECHS: dict[str, RenewableLcoeCostInput] = {
    "solar_pv": RenewableLcoeCostInput(
        tech_key="solar_pv",
        name="Solar PV (utility)",
        capex_eur_per_kw=700.0,
        fixed_om_eur_per_kw_yr=12.0,
        lifetime_years=30,
        baseline_full_load_hours=1000,
    ),
    "onshore_wind": RenewableLcoeCostInput(
        tech_key="onshore_wind",
        name="Onshore Wind",
        capex_eur_per_kw=1400.0,
        fixed_om_eur_per_kw_yr=35.0,
        lifetime_years=30,
        baseline_full_load_hours=2100,
    ),
    "offshore_wind": RenewableLcoeCostInput(
        tech_key="offshore_wind",
        name="Offshore Wind",
        capex_eur_per_kw=3300.0,
        fixed_om_eur_per_kw_yr=80.0,
        lifetime_years=30,
        baseline_full_load_hours=3700,
    ),
}

DEFAULT_LCOE_SENSITIVITY_DISCOUNT_RATES: tuple[float, ...] = (0.03, 0.05, 0.07, 0.09)
LCOE_SENSITIVITY_DISCLAIMER = (
    "Personal portfolio project. Bottom-up LCOE sensitivity values are illustrative "
    "public ranges calibrated against Fraunhofer ISE 2024 / IRENA 2023 references, "
    "not investment-grade assessments."
)


def get_lcoe_sensitivity_tech(tech_key: str) -> RenewableLcoeCostInput:
    normalized = tech_key.strip().lower()
    if normalized not in LCOE_SENSITIVITY_TECHS:
        raise KeyError(tech_key)
    return LCOE_SENSITIVITY_TECHS[normalized]


def full_load_hour_scan(tech: RenewableLcoeCostInput) -> tuple[int, int, int]:
    baseline = tech.baseline_full_load_hours
    return (int(round(baseline * 0.8)), baseline, int(round(baseline * 1.2)))


def capital_recovery_factor(discount_rate: float, lifetime_years: int) -> float:
    if lifetime_years <= 0:
        raise ValueError("lifetime_years must be > 0")
    if discount_rate < 0:
        raise ValueError("discount_rate must be >= 0")
    if discount_rate == 0:
        return 1 / lifetime_years

    compound = (1 + discount_rate) ** lifetime_years
    return discount_rate * compound / (compound - 1)


def renewable_lcoe_eur_per_mwh(
    *,
    capex_eur_per_kw: float,
    fixed_om_eur_per_kw_yr: float,
    discount_rate: float,
    lifetime_years: int,
    full_load_hours: int,
) -> float:
    if full_load_hours <= 0:
        raise ValueError("full_load_hours must be > 0")

    crf = capital_recovery_factor(discount_rate, lifetime_years)
    annualized_capex_eur_per_mw_yr = crf * capex_eur_per_kw * 1000
    fixed_om_eur_per_mw_yr = fixed_om_eur_per_kw_yr * 1000
    return (annualized_capex_eur_per_mw_yr + fixed_om_eur_per_mw_yr) / full_load_hours


def breakeven_carbon_price_eur_per_t(
    *,
    lcoe_eur_per_mwh: float,
    fossil_plant: FossilPlant,
    fuel_cost_eur_per_mwh_th: float,
) -> float | None:
    if fossil_plant.emission_intensity_t_per_mwh <= 0:
        return None

    fuel_per_mwh_el = fuel_cost_eur_per_mwh_th / fossil_plant.efficiency
    breakeven = (
        lcoe_eur_per_mwh - fuel_per_mwh_el - fossil_plant.var_o_m_eur_per_mwh
    ) / fossil_plant.emission_intensity_t_per_mwh
    return max(0.0, breakeven)


def compute_lcoe_sensitivity(
    *,
    tech_key: str,
    fossil_plant_key: str,
    fuel_cost_eur_per_mwh_th: float,
) -> list[LcoeSensitivityPoint]:
    tech = get_lcoe_sensitivity_tech(tech_key)
    fossil_plant = get_fossil_plant(fossil_plant_key)
    points: list[LcoeSensitivityPoint] = []

    for full_load_hours in full_load_hour_scan(tech):
        for discount_rate in DEFAULT_LCOE_SENSITIVITY_DISCOUNT_RATES:
            lcoe = renewable_lcoe_eur_per_mwh(
                capex_eur_per_kw=tech.capex_eur_per_kw,
                fixed_om_eur_per_kw_yr=tech.fixed_om_eur_per_kw_yr,
                discount_rate=discount_rate,
                lifetime_years=tech.lifetime_years,
                full_load_hours=full_load_hours,
            )
            carbon_price = breakeven_carbon_price_eur_per_t(
                lcoe_eur_per_mwh=lcoe,
                fossil_plant=fossil_plant,
                fuel_cost_eur_per_mwh_th=fuel_cost_eur_per_mwh_th,
            )
            if carbon_price is None:
                continue
            points.append(
                LcoeSensitivityPoint(
                    discount_rate=discount_rate,
                    full_load_hours=full_load_hours,
                    lcoe_eur_per_mwh=lcoe,
                    breakeven_carbon_price_eur_per_t=carbon_price,
                )
            )

    return points
