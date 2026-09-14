"""Market-linked aviation fuel and compliance cost estimates.

These numbers are scenario estimates, not an airline invoice. They require an
explicit European jet benchmark, FX rate, fuel burn and passenger count.
Airport differentials and taxes are user/assumption inputs, never invented
German market quotes.
"""

from __future__ import annotations

from typing import Any

# Jet A-1 reference density at standard conditions. Not a measured batch density.
JET_FUEL_REFERENCE_DENSITY_KG_PER_L = 0.8
KG_PER_METRIC_TON = 1000.0
LITERS_PER_METRIC_TON_JET = KG_PER_METRIC_TON / JET_FUEL_REFERENCE_DENSITY_KG_PER_L
LITERS_PER_BARREL = 158.987294928
LITERS_PER_US_GALLON = 3.78541
# Typical Jet A-1 combustion factor used for ETS-style estimates. Not a verified
# flight-specific emission report.
JET_CO2_T_PER_T_FUEL = 3.16
MODEL_VERSION = "aviation-cost-v1"


class AviationCostError(ValueError):
    """Raised when a cost scenario is missing a required input."""


def round_money(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def usd_per_l_to_usd_per_t(usd_per_l: float) -> float:
    if usd_per_l <= 0:
        raise AviationCostError("jet price must be positive")
    return round(float(usd_per_l) * LITERS_PER_METRIC_TON_JET, 4)


def usd_per_t_to_usd_per_l(usd_per_t: float) -> float:
    if usd_per_t <= 0:
        raise AviationCostError("jet price must be positive")
    return round(float(usd_per_t) / LITERS_PER_METRIC_TON_JET, 6)


def usd_per_gal_to_usd_per_l(usd_per_gal: float) -> float:
    if usd_per_gal <= 0:
        raise AviationCostError("gallon price must be positive")
    return round(float(usd_per_gal) / LITERS_PER_US_GALLON, 6)


def usd_per_bbl_to_usd_per_l(usd_per_bbl: float) -> float:
    if usd_per_bbl <= 0:
        raise AviationCostError("barrel price must be positive")
    return round(float(usd_per_bbl) / LITERS_PER_BARREL, 6)


def kg_to_metric_tons(kg: float) -> float:
    if kg < 0:
        raise AviationCostError("fuel mass cannot be negative")
    return float(kg) / KG_PER_METRIC_TON


def delivered_eur_per_t(
    *,
    fossil_jet_usd_per_t: float,
    usd_per_eur: float,
    saf_usd_per_t: float | None = None,
    blend_share: float = 0.0,
    airport_diff_eur_per_t: float = 0.0,
    applicable_tax_eur_per_t: float = 0.0,
) -> float:
    if fossil_jet_usd_per_t <= 0:
        raise AviationCostError("fossil jet price must be positive")
    if usd_per_eur <= 0:
        raise AviationCostError("USD per EUR must be positive")
    if not 0.0 <= blend_share <= 1.0:
        raise AviationCostError("blend share must be between 0 and 1")
    saf = fossil_jet_usd_per_t if saf_usd_per_t is None else float(saf_usd_per_t)
    if saf <= 0:
        raise AviationCostError("SAF price must be positive")
    usd_blend = (1.0 - blend_share) * fossil_jet_usd_per_t + blend_share * saf
    return round_money(usd_blend / usd_per_eur + airport_diff_eur_per_t + applicable_tax_eur_per_t, 4)


def carbon_cost_eur(
    *,
    fuel_t: float,
    blend_share: float,
    eua_eur_per_t: float | None,
    ets_coverage: float = 1.0,
    emission_factor_tco2_per_t_fuel: float = JET_CO2_T_PER_T_FUEL,
) -> float | None:
    if eua_eur_per_t is None:
        return None
    if fuel_t < 0:
        raise AviationCostError("fuel burn cannot be negative")
    if not 0.0 <= blend_share <= 1.0:
        raise AviationCostError("blend share must be between 0 and 1")
    if eua_eur_per_t < 0 or ets_coverage < 0:
        raise AviationCostError("carbon inputs cannot be negative")
    fossil_share = 1.0 - blend_share
    return round_money(
        fuel_t * fossil_share * emission_factor_tco2_per_t_fuel * eua_eur_per_t * ets_coverage
    )


def compute_market_linked_flight_cost(
    *,
    fossil_jet_usd_per_l: float,
    usd_per_eur: float,
    fuel_burn_t: float,
    passengers: int,
    saf_usd_per_l: float | None = None,
    blend_share: float = 0.02,
    airport_diff_eur_per_t: float = 0.0,
    applicable_tax_eur_per_t: float = 0.0,
    eua_eur_per_t: float | None = None,
    ets_coverage: float = 1.0,
    airport_quote_available: bool = False,
    quality: str = "derived",
) -> dict[str, Any]:
    if fuel_burn_t <= 0:
        raise AviationCostError("fuel burn must be positive")
    if passengers <= 0:
        raise AviationCostError("passenger count must be positive")

    jet_usd_per_t = usd_per_l_to_usd_per_t(fossil_jet_usd_per_l)
    saf_usd_per_t = usd_per_l_to_usd_per_t(saf_usd_per_l) if saf_usd_per_l is not None else None
    delivered = delivered_eur_per_t(
        fossil_jet_usd_per_t=jet_usd_per_t,
        usd_per_eur=usd_per_eur,
        saf_usd_per_t=saf_usd_per_t,
        blend_share=blend_share,
        airport_diff_eur_per_t=airport_diff_eur_per_t,
        applicable_tax_eur_per_t=applicable_tax_eur_per_t,
    )
    fuel_eur = round_money(fuel_burn_t * delivered)
    carbon_eur = carbon_cost_eur(
        fuel_t=fuel_burn_t,
        blend_share=blend_share,
        eua_eur_per_t=eua_eur_per_t,
        ets_coverage=ets_coverage,
    )
    compliance_eur = round_money(fuel_eur + (carbon_eur or 0.0))
    per_pax = round_money(compliance_eur / passengers)

    fossil_only = delivered_eur_per_t(
        fossil_jet_usd_per_t=jet_usd_per_t,
        usd_per_eur=usd_per_eur,
        blend_share=0.0,
        airport_diff_eur_per_t=airport_diff_eur_per_t,
        applicable_tax_eur_per_t=applicable_tax_eur_per_t,
    )
    fx_at_one = delivered_eur_per_t(
        fossil_jet_usd_per_t=jet_usd_per_t,
        usd_per_eur=1.0,
        saf_usd_per_t=saf_usd_per_t,
        blend_share=blend_share,
        airport_diff_eur_per_t=airport_diff_eur_per_t,
        applicable_tax_eur_per_t=applicable_tax_eur_per_t,
    )
    no_airport = delivered_eur_per_t(
        fossil_jet_usd_per_t=jet_usd_per_t,
        usd_per_eur=usd_per_eur,
        saf_usd_per_t=saf_usd_per_t,
        blend_share=blend_share,
        airport_diff_eur_per_t=0.0,
        applicable_tax_eur_per_t=applicable_tax_eur_per_t,
    )

    return {
        "model_version": MODEL_VERSION,
        "label": "market_linked_cost_estimate",
        "not_an_airline_invoice": True,
        "quality": quality,
        "usable_for_signal": quality in {"observed", "stale", "derived"},
        "airport_quote_available": airport_quote_available,
        "units": {
            "price": "EUR/t",
            "flight": "EUR/flight",
            "passenger": "EUR/pax",
            "density": "0.8 kg/L reference, not measured batch density",
        },
        "inputs": {
            "fossil_jet_usd_per_l": fossil_jet_usd_per_l,
            "fossil_jet_usd_per_t": jet_usd_per_t,
            "usd_per_eur": usd_per_eur,
            "fuel_burn_t": fuel_burn_t,
            "passengers": passengers,
            "blend_share": blend_share,
            "airport_diff_eur_per_t": airport_diff_eur_per_t,
            "applicable_tax_eur_per_t": applicable_tax_eur_per_t,
            "eua_eur_per_t": eua_eur_per_t,
            "ets_coverage": ets_coverage,
        },
        "delivered_eur_per_t": delivered,
        "fuel_cost_eur": fuel_eur,
        "carbon_cost_eur": carbon_eur,
        "fuel_and_compliance_eur": compliance_eur,
        "per_passenger_eur": per_pax,
        "drivers_eur_per_flight": {
            "fuel_price_and_blend": round_money(fuel_burn_t * (delivered - no_airport + (no_airport - fossil_only))),
            "fx": round_money(fuel_burn_t * (delivered - fx_at_one)),
            "airport_differential": round_money(fuel_burn_t * (delivered - no_airport)),
            "saf_blend": round_money(fuel_burn_t * (delivered - fossil_only)),
            "carbon": carbon_eur,
        },
        "limitations": [
            "Estimate covers fuel and named compliance costs only, not total operating cost.",
            "No German airport into-plane quote is implied unless airport_quote_available is true.",
            "Commercial aviation energy-tax exemption (EnergiestG §27) is not applied unless tax input is set.",
            "SAF lifecycle reduction is not treated as an ETS allowance deduction.",
        ],
    }
