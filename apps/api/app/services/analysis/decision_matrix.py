from app.schemas.analysis import AirlineDecisionAssessment, AirlineDecisionProbabilities
from app.services.analysis.pathway_costs import get_pathway_cost


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, round(value, 3)))


def _reserve_signal(reserve_weeks: float) -> str:
    if reserve_weeks <= 2:
        return "critical"
    if reserve_weeks <= 4:
        return "elevated"
    if reserve_weeks <= 6:
        return "watch"
    return "normal"


def compute_airline_decision(
    fossil_jet_usd_per_l: float,
    reserve_weeks: float,
    carbon_price_eur_per_t: float,
    pathway_key: str,
    *,
    fare_pass_through_pct: float | None = None,
    labor_cost_impact_eur_m: float | None = None,
    extra_fuel_cost_eur_m: float | None = None,
) -> AirlineDecisionAssessment:
    """Probability matrix for airline responses under fuel/reserve stress.

    Optional LH-style inputs (pass-through, labor EUR m, extra fuel EUR m)
    are accepted only as documented scenario parameters. They do not invent
    market prices. Probability weights remain unchanged unless pass-through
    is provided, in which case residual fuel exposure is reported and used
    only as an additive residual-margin context field (not a new price).
    """
    pathway = get_pathway_cost(pathway_key)
    scarcity = max(0.0, (6.0 - reserve_weeks) / 6.0)
    fuel_shock = max(0.0, (fossil_jet_usd_per_l - 1.0) / 0.8)
    carbon_pressure = max(0.0, carbon_price_eur_per_t / 200.0)
    pathway_readiness = pathway.carbon_reduction_pct / 100.0
    maturity_bonus = {
        "commercial": 0.12,
        "early_commercial": 0.08,
        "scaling": 0.05,
        "demonstration": -0.02,
        "incumbent": 0.0,
    }.get(pathway.maturity_level, 0.0)

    # Keep legacy probability surface stable when optional params omitted.
    raise_fares = 0.35 + 0.35 * fuel_shock + 0.25 * scarcity
    cut_capacity = 0.18 + 0.32 * scarcity + 0.20 * fuel_shock
    ground_routes = 0.04 + 0.30 * scarcity + 0.12 * fuel_shock

    residual_fuel_cost_exposure = None
    if fare_pass_through_pct is not None:
        if not 0.0 <= fare_pass_through_pct <= 1.0:
            raise ValueError("fare_pass_through_pct must be between 0 and 1")
        # Residual share of fuel shock not recovered via fares (observed LH ~0.60).
        residual_fuel_cost_exposure = round(fuel_shock * (1.0 - fare_pass_through_pct), 4)
        # When pass-through is high, capacity cuts become relatively more likely
        # than pure fare recovery ÔÇö mild adjustment, not a new invented base rate.
        raise_fares = raise_fares * (0.85 + 0.15 * fare_pass_through_pct)
        cut_capacity = cut_capacity * (1.0 + 0.15 * (1.0 - fare_pass_through_pct))

    labor_stress = 0.0
    if labor_cost_impact_eur_m is not None:
        if labor_cost_impact_eur_m < 0:
            raise ValueError("labor_cost_impact_eur_m must be >= 0")
        # Scale: 150 EUR m (LH Q2 article) -> 1.0 reference unit.
        labor_stress = min(1.0, labor_cost_impact_eur_m / 150.0)
        cut_capacity = cut_capacity + 0.08 * labor_stress
        ground_routes = ground_routes + 0.05 * labor_stress

    probabilities = AirlineDecisionProbabilities(
        raise_fares=_clamp(raise_fares),
        cut_capacity=_clamp(cut_capacity),
        buy_spot_saf=_clamp(0.08 + 0.26 * carbon_pressure + 0.18 * scarcity + maturity_bonus),
        sign_long_term_offtake=_clamp(
            0.10 + 0.30 * carbon_pressure + 0.20 * pathway_readiness + maturity_bonus
        ),
        ground_routes=_clamp(ground_routes),
    )

    dominant_response = max(
        probabilities.model_dump().items(),
        key=lambda item: item[1],
    )[0]

    return AirlineDecisionAssessment(
        pathway=pathway,
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        reserve_weeks=reserve_weeks,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        probabilities=probabilities,
        dominant_response=dominant_response,
        reserve_signal=_reserve_signal(reserve_weeks),
        fare_pass_through_pct=fare_pass_through_pct,
        labor_cost_impact_eur_m=labor_cost_impact_eur_m,
        extra_fuel_cost_eur_m=extra_fuel_cost_eur_m,
        residual_fuel_cost_exposure=residual_fuel_cost_exposure,
    )
