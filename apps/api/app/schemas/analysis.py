from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


BreakevenStatus = Literal["uneconomic", "inflection", "marginal_switch", "dominant"]
TippingPointSignal = Literal["saf_cost_advantaged", "switch_window_opening", "fossil_still_advantaged"]
AirlineDecisionSignal = Literal["switch_window_opening", "capacity_stress_dominant", "incremental_adjustment"]


class PathwayCostBand(BaseModel):
    pathway_key: str
    name: str
    min_usd_per_l: float = Field(gt=0)
    max_usd_per_l: float = Field(gt=0)
    midpoint_usd_per_l: float = Field(gt=0)
    carbon_reduction_pct: float = Field(ge=0, le=100)
    maturity_level: str


class TippingPointAssessment(BaseModel):
    pathway: PathwayCostBand
    fossil_jet_usd_per_l: float = Field(gt=0)
    carbon_price_eur_per_t: float = Field(ge=0)
    subsidy_usd_per_l: float = Field(ge=0)
    blend_rate_pct: float = Field(ge=0, le=100)
    carbon_credit_usd_per_l: float = Field(ge=0)
    effective_support_usd_per_l: float
    net_saf_cost_usd_per_l: float
    net_cost_spread_usd_per_l: float
    spread_pct: float
    status: BreakevenStatus


class AirlineDecisionProbabilities(BaseModel):
    raise_fares: float = Field(ge=0, le=1)
    cut_capacity: float = Field(ge=0, le=1)
    buy_spot_saf: float = Field(ge=0, le=1)
    sign_long_term_offtake: float = Field(ge=0, le=1)
    ground_routes: float = Field(ge=0, le=1)


class AirlineDecisionAssessment(BaseModel):
    pathway: PathwayCostBand
    fossil_jet_usd_per_l: float = Field(gt=0)
    reserve_weeks: float = Field(gt=0)
    carbon_price_eur_per_t: float = Field(ge=0)
    probabilities: AirlineDecisionProbabilities
    dominant_response: str
    reserve_signal: str


class TippingPointInputs(BaseModel):
    fossil_jet_usd_per_l: float = Field(gt=0)
    carbon_price_eur_per_t: float = Field(ge=0)
    subsidy_usd_per_l: float = Field(ge=0)
    blend_rate_pct: float = Field(ge=0, le=100)


class PathwayTippingPoint(BaseModel):
    pathway_key: str
    display_name: str
    net_cost_low_usd_per_l: float = Field(gt=0)
    net_cost_high_usd_per_l: float = Field(gt=0)
    spread_low_pct: float
    spread_high_pct: float
    status: Literal["competitive", "inflection", "premium"]


class TippingPointResponse(BaseModel):
    generated_at: datetime
    inputs: TippingPointInputs
    effective_fossil_jet_usd_per_l: float = Field(gt=0)
    pathways: list[PathwayTippingPoint]
    signal: TippingPointSignal


class AirlineDecisionInputs(BaseModel):
    fossil_jet_usd_per_l: float = Field(gt=0)
    reserve_weeks: float = Field(gt=0)
    carbon_price_eur_per_t: float = Field(ge=0)
    pathway_key: str


class AirlineDecisionResponse(BaseModel):
    generated_at: datetime
    inputs: AirlineDecisionInputs
    probabilities: AirlineDecisionProbabilities
    signal: AirlineDecisionSignal
