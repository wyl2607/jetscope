from datetime import datetime, timezone

from fastapi import APIRouter

from app.schemas.transition import (
    TransitionDomain,
    TransitionSummaryResponse,
    TransitionTech,
)
from app.services.analysis.transition_summary import (
    TRANSITION_DISCLAIMER,
    compute_transition_summary,
)

router = APIRouter()


@router.get("/transition-summary", response_model=TransitionSummaryResponse)
def get_transition_summary() -> TransitionSummaryResponse:
    domains = compute_transition_summary()
    return TransitionSummaryResponse(
        generated_at=datetime.now(timezone.utc),
        disclaimer=TRANSITION_DISCLAIMER,
        domains=[
            TransitionDomain(
                domain_key=domain.domain_key,
                domain_name=domain.domain_name,
                carbon_driver=domain.carbon_driver,
                reference_carbon_price_eur_per_t=domain.reference_carbon_price_eur_per_t,
                techs=[
                    TransitionTech(
                        tech_key=tech.tech_key,
                        name=tech.name,
                        breakeven_carbon_price_eur_per_t=tech.breakeven_carbon_price_eur_per_t,
                        competitive_at_reference=tech.competitive_at_reference,
                    )
                    for tech in domain.techs
                ],
            )
            for domain in domains
        ],
    )
