"""Market-linked aviation fuel and compliance cost estimates.

These numbers are scenario estimates, not an airline invoice. They require an
explicit European jet benchmark, FX rate, fuel burn and passenger count.
Airport differentials and taxes are user/assumption inputs, never invented
German market quotes.
"""

from __future__ import annotations

import math
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
MODEL_VERSION = "aviation-cost-v2"
# EnergiestG kerosene band commonly quoted as 654.50 EUR / 1000 L. Labeled
# user assumption, not a verified currently applicable tax assessment.
PRIVATE_JET_ENERGY_TAX_EUR_PER_L_ASSUMPTION = 0.6545
COST_SIGNAL_QUALITIES = frozenset({"observed", "stale", "derived"})


class AviationCostError(ValueError):
    """Raised when a cost scenario is missing a required input or is illegal."""


def round_money(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def _require_finite(value: object, name: str, *, positive: bool = False, non_negative: bool = False) -> float:
    if isinstance(value, bool) or value is None:
        raise AviationCostError(f"{name} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise AviationCostError(f"{name} must be a finite number") from exc
    if not math.isfinite(number):
        raise AviationCostError(f"{name} must be a finite number")
    if positive and number <= 0:
        raise AviationCostError(f"{name} must be positive")
    if non_negative and number < 0:
        raise AviationCostError(f"{name} cannot be negative")
    return number


def _require_positive_int(value: object, name: str) -> int:
    number = _require_finite(value, name, positive=True)
    if number != int(number):
        raise AviationCostError(f"{name} must be a positive integer")
    return int(number)


def _require_share(value: object, name: str) -> float:
    number = _require_finite(value, name, non_negative=True)
    if number > 1.0:
        raise AviationCostError(f"{name} must be between 0 and 1")
    return number


def usd_per_l_to_usd_per_t(usd_per_l: float) -> float:
    usd_per_l = _require_finite(usd_per_l, "jet price", positive=True)
    return round(float(usd_per_l) * LITERS_PER_METRIC_TON_JET, 4)


def usd_per_t_to_usd_per_l(usd_per_t: float) -> float:
    usd_per_t = _require_finite(usd_per_t, "jet price", positive=True)
    return round(float(usd_per_t) / LITERS_PER_METRIC_TON_JET, 6)


def usd_per_gal_to_usd_per_l(usd_per_gal: float) -> float:
    usd_per_gal = _require_finite(usd_per_gal, "gallon price", positive=True)
    return round(float(usd_per_gal) / LITERS_PER_US_GALLON, 6)


def usd_per_bbl_to_usd_per_l(usd_per_bbl: float) -> float:
    usd_per_bbl = _require_finite(usd_per_bbl, "barrel price", positive=True)
    return round(float(usd_per_bbl) / LITERS_PER_BARREL, 6)


def kg_to_metric_tons(kg: float) -> float:
    kg = _require_finite(kg, "fuel mass", non_negative=True)
    return float(kg) / KG_PER_METRIC_TON


def energy_tax_eur_per_t_from_eur_per_l(
    eur_per_l: float,
    *,
    density_kg_per_l: float = JET_FUEL_REFERENCE_DENSITY_KG_PER_L,
) -> float:
    """Convert a per-litre energy-tax assumption into EUR/t using reference density."""
    eur_per_l = _require_finite(eur_per_l, "energy tax EUR/L", non_negative=True)
    density = _require_finite(density_kg_per_l, "density", positive=True)
    liters_per_t = KG_PER_METRIC_TON / density
    return round(float(eur_per_l) * liters_per_t, 4)


def delivered_eur_per_t(
    *,
    fossil_jet_usd_per_t: float,
    usd_per_eur: float,
    saf_usd_per_t: float | None = None,
    blend_share: float = 0.0,
    airport_diff_eur_per_t: float = 0.0,
    applicable_tax_eur_per_t: float = 0.0,
) -> float:
    fossil_jet_usd_per_t = _require_finite(fossil_jet_usd_per_t, "fossil jet price", positive=True)
    usd_per_eur = _require_finite(usd_per_eur, "USD per EUR", positive=True)
    blend_share = _require_share(blend_share, "blend share")
    # Airport differentials may be discounts (negative). Taxes may be zero.
    airport_diff_eur_per_t = _require_finite(airport_diff_eur_per_t, "airport differential")
    applicable_tax_eur_per_t = _require_finite(applicable_tax_eur_per_t, "applicable tax")
    if blend_share > 0.0 and saf_usd_per_t is None:
        raise AviationCostError("SAF price is required when blend share is greater than zero")
    saf = fossil_jet_usd_per_t if saf_usd_per_t is None else _require_finite(saf_usd_per_t, "SAF price", positive=True)
    usd_blend = (1.0 - blend_share) * fossil_jet_usd_per_t + blend_share * saf
    return round_money(usd_blend / usd_per_eur + airport_diff_eur_per_t + applicable_tax_eur_per_t, 4)


def carbon_cost_eur(
    *,
    fuel_t: float,
    blend_share: float,
    eua_eur_per_t: float | None,
    ets_coverage: float = 1.0,
    emission_factor_tco2_per_t_fuel: float = JET_CO2_T_PER_T_FUEL,
    ets_applicable: bool | None = None,
    saf_ets_eligible_share: float = 0.0,
) -> float | None:
    if ets_applicable is False:
        return 0.0
    if eua_eur_per_t is None:
        return None
    fuel_t = _require_finite(fuel_t, "fuel burn", non_negative=True)
    blend_share = _require_share(blend_share, "blend share")
    eligible = _require_share(saf_ets_eligible_share, "SAF ETS-eligible share")
    eua = _require_finite(eua_eur_per_t, "EUA", non_negative=True)
    ets_coverage = _require_finite(ets_coverage, "ETS coverage", non_negative=True)
    # SAF blend does not automatically qualify for ETS reduction.
    taxable_share = max(0.0, 1.0 - eligible)
    return round_money(fuel_t * taxable_share * emission_factor_tco2_per_t_fuel * eua * ets_coverage)


def _empty_result(*, quality: str, missing: list[str], limitations: list[str], inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "model_version": MODEL_VERSION,
        "label": "market_linked_cost_estimate",
        "not_an_airline_invoice": True,
        "quality": quality,
        "usable_for_signal": False,
        "computable": False,
        "missing_inputs": missing,
        "airport_quote_available": bool(inputs.get("airport_quote_available")),
        "delivered_eur_per_t": None,
        "fuel_cost_eur": None,
        "carbon_cost_eur": None,
        "fuel_and_compliance_eur": None,
        "per_passenger_eur": None,
        "drivers_eur_per_flight": {},
        "inputs": inputs,
        "limitations": limitations,
    }


def compute_market_linked_flight_cost(
    *,
    fossil_jet_usd_per_l: float,
    usd_per_eur: float,
    fuel_burn_t: float,
    passengers: int,
    saf_usd_per_l: float | None = None,
    blend_share: float = 0.0,
    airport_diff_eur_per_t: float = 0.0,
    applicable_tax_eur_per_t: float = 0.0,
    eua_eur_per_t: float | None = None,
    ets_coverage: float = 1.0,
    ets_applicable: bool | None = None,
    saf_ets_eligible_share: float = 0.0,
    airport_quote_available: bool = False,
    quality: str = "derived",
    observation_ids: dict[str, str] | None = None,
) -> dict[str, Any]:
    limitations = [
        "Estimate covers fuel and named compliance costs only, not total operating cost.",
        "No German airport into-plane quote is implied unless airport_quote_available is true.",
        "Commercial aviation energy-tax exemption (EnergiestG §27) is not applied unless tax input is set.",
        "SAF blend percentage is not treated as an automatic ETS allowance deduction.",
    ]
    fuel_burn_t = _require_finite(fuel_burn_t, "fuel burn", positive=True)
    passengers = _require_positive_int(passengers, "passenger count")
    blend_share = _require_share(blend_share, "blend share")
    saf_ets_eligible_share = _require_share(saf_ets_eligible_share, "SAF ETS-eligible share")
    fossil_jet_usd_per_l = _require_finite(fossil_jet_usd_per_l, "fossil jet price", positive=True)
    usd_per_eur = _require_finite(usd_per_eur, "USD per EUR", positive=True)

    ets_is_applicable = True if ets_applicable is None else bool(ets_applicable)
    missing: list[str] = []
    if blend_share > 0.0 and saf_usd_per_l is None:
        missing.append("saf_usd_per_l")
    if ets_is_applicable and eua_eur_per_t is None:
        missing.append("eua_eur_per_t")
    if quality not in COST_SIGNAL_QUALITIES:
        missing.append("usable_market_quote")

    inputs = {
        "fossil_jet_usd_per_l": fossil_jet_usd_per_l,
        "usd_per_eur": usd_per_eur,
        "fuel_burn_t": fuel_burn_t,
        "passengers": passengers,
        "blend_share": blend_share,
        "airport_diff_eur_per_t": airport_diff_eur_per_t,
        "applicable_tax_eur_per_t": applicable_tax_eur_per_t,
        "eua_eur_per_t": eua_eur_per_t,
        "ets_coverage": ets_coverage,
        "ets_applicable": ets_is_applicable,
        "saf_ets_eligible_share": saf_ets_eligible_share,
        "saf_usd_per_l": saf_usd_per_l,
        "airport_quote_available": airport_quote_available,
        "observation_ids": observation_ids or {},
    }

    if "saf_usd_per_l" in missing or "usable_market_quote" in missing:
        return _empty_result(quality=quality, missing=missing, limitations=limitations, inputs=inputs)

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
        ets_applicable=ets_is_applicable,
        saf_ets_eligible_share=saf_ets_eligible_share,
    )
    compliance_eur = None if carbon_eur is None else round_money(fuel_eur + carbon_eur)
    per_pax = None if compliance_eur is None else round_money(compliance_eur / passengers)

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
        "usable_for_signal": quality in COST_SIGNAL_QUALITIES,
        "computable": carbon_eur is not None,
        "missing_inputs": missing,
        "airport_quote_available": airport_quote_available,
        "units": {
            "price": "EUR/t",
            "flight": "EUR/flight",
            "passenger": "EUR/pax",
            "density": "0.8 kg/L reference, not measured batch density",
        },
        "inputs": {
            **inputs,
            "fossil_jet_usd_per_t": jet_usd_per_t,
            "saf_usd_per_t": saf_usd_per_t,
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
        "limitations": limitations,
    }


def compute_cost_change(*, baseline: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    """Attribute fuel-and-compliance change to price drivers with shared burn/pax."""
    fuel_burn_t = _require_finite(current.get("fuel_burn_t", baseline.get("fuel_burn_t")), "fuel burn", positive=True)
    passengers = _require_positive_int(current.get("passengers", baseline.get("passengers")), "passenger count")
    shared = {"fuel_burn_t": fuel_burn_t, "passengers": passengers}

    def _run(source: dict[str, Any], **overrides: Any) -> dict[str, Any]:
        payload = {**source, **shared, **overrides}
        payload.pop("fuel_and_compliance_eur", None)
        return compute_market_linked_flight_cost(**payload)

    base = _run(baseline)
    curr = _run(current)
    if base.get("fuel_cost_eur") is None or curr.get("fuel_cost_eur") is None:
        return {
            "model_version": MODEL_VERSION,
            "computable": False,
            "missing_inputs": sorted(set(base.get("missing_inputs", []) + curr.get("missing_inputs", []))),
            "fuel_and_compliance_delta_eur": None,
            "per_passenger_delta_eur": None,
            "drivers_eur_per_flight": {},
            "same_fuel_burn_and_passengers": True,
            "baseline": base,
            "current": curr,
            "limitations": [
                "Estimate covers fuel and named compliance costs only, not total operating cost.",
                "Baseline and current scenarios could not both be computed from the supplied inputs.",
            ],
        }

    jet_base = usd_per_l_to_usd_per_t(float(baseline["fossil_jet_usd_per_l"]))
    jet_curr = usd_per_l_to_usd_per_t(float(current["fossil_jet_usd_per_l"]))
    fx_base = float(baseline["usd_per_eur"])
    fx_curr = float(current["usd_per_eur"])
    oil = round_money(fuel_burn_t * ((jet_curr - jet_base) / fx_base))
    fx = round_money(fuel_burn_t * (jet_curr / fx_curr - jet_curr / fx_base))

    saf_base = _run(baseline, airport_diff_eur_per_t=0.0, applicable_tax_eur_per_t=0.0, eua_eur_per_t=None, ets_applicable=False)
    saf_curr = _run(current, airport_diff_eur_per_t=0.0, applicable_tax_eur_per_t=0.0, eua_eur_per_t=None, ets_applicable=False)
    fossil_base = _run(
        baseline,
        blend_share=0.0,
        saf_usd_per_l=None,
        airport_diff_eur_per_t=0.0,
        applicable_tax_eur_per_t=0.0,
        eua_eur_per_t=None,
        ets_applicable=False,
    )
    fossil_curr = _run(
        current,
        blend_share=0.0,
        saf_usd_per_l=None,
        airport_diff_eur_per_t=0.0,
        applicable_tax_eur_per_t=0.0,
        eua_eur_per_t=None,
        ets_applicable=False,
    )
    saf = round_money(
        (saf_curr["fuel_cost_eur"] - fossil_curr["fuel_cost_eur"])
        - (saf_base["fuel_cost_eur"] - fossil_base["fuel_cost_eur"])
    )
    airport = round_money(
        fuel_burn_t
        * (
            float(current.get("airport_diff_eur_per_t") or 0.0)
            - float(baseline.get("airport_diff_eur_per_t") or 0.0)
        )
    )
    tax = round_money(
        fuel_burn_t
        * (
            float(current.get("applicable_tax_eur_per_t") or 0.0)
            - float(baseline.get("applicable_tax_eur_per_t") or 0.0)
        )
    )
    carbon = None
    if base.get("carbon_cost_eur") is not None and curr.get("carbon_cost_eur") is not None:
        carbon = round_money(curr["carbon_cost_eur"] - base["carbon_cost_eur"])

    drivers = {
        "jet_price": oil,
        "fx": fx,
        "saf": saf,
        "airport_differential": airport,
        "tax": tax,
        "carbon": carbon,
    }
    driver_sum = round_money(sum(value for value in drivers.values() if isinstance(value, (int, float))))
    total = None
    if base.get("fuel_and_compliance_eur") is not None and curr.get("fuel_and_compliance_eur") is not None:
        total = round_money(curr["fuel_and_compliance_eur"] - base["fuel_and_compliance_eur"])
    residual = None if total is None or carbon is None else round_money(total - driver_sum)
    if residual is not None and abs(residual) <= 0.02:
        residual = 0.0
        driver_sum = total
    if residual:
        drivers["residual"] = residual

    per_pax = None if total is None else round_money(total / passengers)
    return {
        "model_version": MODEL_VERSION,
        "computable": total is not None,
        "fuel_and_compliance_delta_eur": total,
        "per_passenger_delta_eur": per_pax,
        "drivers_eur_per_flight": drivers,
        "same_fuel_burn_and_passengers": True,
        "baseline": base,
        "current": curr,
        "inputs": {
            "baseline": {**baseline, **shared},
            "current": {**current, **shared},
        },
        "limitations": [
            "Estimate covers fuel and named compliance costs only, not total operating cost.",
            "Driver split holds fuel burn and passenger count constant so price effects can be compared.",
            "Historical quotes are never invented; a user baseline is an explicit assumption when no dated observation exists.",
        ],
    }
