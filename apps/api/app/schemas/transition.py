from datetime import datetime

from pydantic import BaseModel, Field


class TransitionTech(BaseModel):
    tech_key: str
    name: str
    breakeven_carbon_price_eur_per_t: float = Field(ge=0)
    competitive_at_reference: bool


class TransitionDomain(BaseModel):
    domain_key: str
    domain_name: str
    carbon_driver: str
    reference_carbon_price_eur_per_t: float = Field(ge=0)
    techs: list[TransitionTech]


class TransitionSummaryResponse(BaseModel):
    generated_at: datetime
    disclaimer: str
    domains: list[TransitionDomain]
