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
) -> AirlineDecisionAssessment:
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

    probabilities = AirlineDecisionProbabilities(
        raise_fares=_clamp(0.35 + 0.35 * fuel_shock + 0.25 * scarcity),
        cut_capacity=_clamp(0.18 + 0.32 * scarcity + 0.20 * fuel_shock),
        buy_spot_saf=_clamp(0.08 + 0.26 * carbon_pressure + 0.18 * scarcity + maturity_bonus),
        sign_long_term_offtake=_clamp(
            0.10 + 0.30 * carbon_pressure + 0.20 * pathway_readiness + maturity_bonus
        ),
        ground_routes=_clamp(0.04 + 0.30 * scarcity + 0.12 * fuel_shock),
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
    )
