from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.market import SourceStatus
from app.schemas.reserves import ReserveSignalResponse


BreakevenStatus = Literal["uneconomic", "inflection", "marginal_switch", "dominant"]
TippingPointSignal = Literal["saf_cost_advantaged", "switch_window_opening", "fossil_still_advantaged"]
AirlineDecisionSignal = Literal["switch_window_opening", "capacity_stress_dominant", "incremental_adjustment"]
TippingEventType = Literal["CRITICAL", "ALERT", "CROSSOVER"]
SafCostBasis = Literal["market_reference", "production_cost"]


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
    fare_pass_through_pct: float | None = Field(default=None, ge=0, le=1)
    labor_cost_impact_eur_m: float | None = Field(default=None, ge=0)
    extra_fuel_cost_eur_m: float | None = Field(default=None, ge=0)
    residual_fuel_cost_exposure: float | None = None


class TippingPointInputs(BaseModel):
    fossil_jet_usd_per_l: float = Field(gt=0)
    carbon_price_eur_per_t: float = Field(ge=0)
    subsidy_usd_per_l: float = Field(ge=0)
    blend_rate_pct: float = Field(ge=0, le=100)
    saf_allowance: Literal["none", "statutory", "remote_airport"] = "none"


class PathwayTippingPoint(BaseModel):
    pathway_key: str
    display_name: str
    net_cost_low_usd_per_l: float = Field(gt=0)
    net_cost_high_usd_per_l: float = Field(gt=0)
    spread_low_pct: float
    spread_high_pct: float
    status: Literal["competitive", "inflection", "premium"]
    cost_basis: Literal["production_cost"] = "production_cost"
    # EU ETS SAF allowances applied to the net costs above (0 unless requested).
    allowance_coverage_pct: float = Field(default=0.0, ge=0, le=100)
    allowance_category_assumed: bool = False


class SafMarketCheck(BaseModel):
    """Dated SAF purchase price against fossil jet plus its EU ETS cost."""

    reference_id: str
    kind: str
    region: str
    period: str
    published_at: date
    source_name: str
    source_url: str
    pathway_key: str
    saf_eur_per_t: float = Field(gt=0)
    saf_usd_per_l: float = Field(gt=0)
    fossil_with_ets_usd_per_l: float = Field(gt=0)
    premium_pct: float
    status: Literal["competitive", "inflection", "premium"]
    # premium_pct / status include the requested allowance; statutory_* is always the what-if.
    allowance_coverage_pct: float = Field(default=0.0, ge=0, le=100)
    allowance_support_usd_per_l: float = Field(default=0.0, ge=0)
    statutory_allowance_coverage_pct: float | None = None
    statutory_allowance_premium_pct: float | None = None


class SafAllowanceBasis(BaseModel):
    """Where the allowance rates come from and how far they reach."""

    legal_basis_name: str
    legal_basis_url: str
    period: str
    reserve_allowances: int
    rates_pct: dict[str, float]
    latest_fuel_year: int
    latest_published_at: date
    latest_allowances: int
    latest_value_eur: float
    latest_saf_tonnes: float
    latest_source_name: str
    latest_source_url: str


class TippingPointResponse(BaseModel):
    generated_at: datetime
    inputs: TippingPointInputs
    effective_fossil_jet_usd_per_l: float = Field(gt=0)
    pathways: list[PathwayTippingPoint]
    market_check: SafMarketCheck | None = None
    saf_allowance: SafAllowanceBasis | None = None
    signal: TippingPointSignal
    signal_basis: SafCostBasis


class AirlineDecisionInputs(BaseModel):
    fossil_jet_usd_per_l: float = Field(gt=0)
    reserve_weeks: float = Field(gt=0)
    carbon_price_eur_per_t: float = Field(ge=0)
    pathway_key: str
    fare_pass_through_pct: float | None = Field(default=None, ge=0, le=1)
    labor_cost_impact_eur_m: float | None = Field(default=None, ge=0)
    extra_fuel_cost_eur_m: float | None = Field(default=None, ge=0)


class AirlineDecisionResponse(BaseModel):
    generated_at: datetime
    inputs: AirlineDecisionInputs
    probabilities: AirlineDecisionProbabilities
    signal: AirlineDecisionSignal
    fare_pass_through_pct: float | None = None
    labor_cost_impact_eur_m: float | None = None
    extra_fuel_cost_eur_m: float | None = None
    residual_fuel_cost_exposure: float | None = None


class TippingEventResponse(BaseModel):
    id: str
    event_type: TippingEventType
    saf_pathway: str
    fossil_price_usd_per_l: float = Field(gt=0)
    saf_effective_cost_usd_per_l: float = Field(gt=0)
    gap_usd_per_l: float
    observed_at: datetime
    metadata: dict = Field(default_factory=dict)


class CrisisBriefResearchPosture(BaseModel):
    status: Literal["disabled", "empty", "signal_backed"]
    signal_count: int = Field(ge=0)
    top_signal_title: str | None = None
    top_signal_confidence: float | None = Field(default=None, ge=0, le=1)
    latest_published_at: datetime | None = None


class CrisisBriefAction(BaseModel):
    id: Literal["review_sources", "open_report", "review_scenarios"]
    label: str
    href: str
    reason: str


class CrisisBriefResponse(BaseModel):
    generated_at: datetime
    market_generated_at: datetime
    fossil_jet_usd_per_l: float | None = Field(default=None, gt=0)
    source_status: SourceStatus
    reserve: ReserveSignalResponse
    tipping_events: list[TippingEventResponse] = Field(default_factory=list)
    research: CrisisBriefResearchPosture
    actions: list[CrisisBriefAction] = Field(default_factory=list)


PathwayComparisonStatus = Literal[
    "below_fossil", "competitive", "inflection", "premium", "not_computable"
]
PathwayComparisonSignal = Literal["clear_leader", "close_race", "no_advantage", "insufficient_data"]


class PathwaySourceMeta(BaseModel):
    source_type: str
    confidence_score: float = Field(ge=0, le=1)
    cadence: str
    updated_at: str
    fallback_used: bool


class PathwayComparisonRow(BaseModel):
    pathway_key: str
    name: str
    min_usd_per_l: float = Field(gt=0)
    max_usd_per_l: float = Field(gt=0)
    midpoint_usd_per_l: float = Field(gt=0)
    carbon_reduction_pct: float = Field(ge=0, le=100)
    maturity_level: str
    effective_saf_cost_usd_per_l: float
    gap_vs_fossil_usd_per_l: float
    spread_pct: float | None
    status: PathwayComparisonStatus
    source: PathwaySourceMeta


class PathwayCarbonSweepEntry(BaseModel):
    pathway_key: str
    effective_saf_cost_usd_per_l: float


class PathwayCarbonSweepPoint(BaseModel):
    carbon_price_eur_per_t: float
    pathways: list[PathwayCarbonSweepEntry]


class PathwayComparisonInputs(BaseModel):
    fossil_jet_usd_per_l: float = Field(gt=0)
    carbon_price_eur_per_t: float = Field(ge=0)
    subsidy_usd_per_l: float = Field(ge=0)
    blend_rate_pct: float = Field(ge=0, le=100)


class PathwayComparisonResponse(BaseModel):
    generated_at: datetime
    inputs: PathwayComparisonInputs
    fossil_jet_usd_per_l: float = Field(gt=0)
    rows: list[PathwayComparisonRow]
    carbon_sweep: list[PathwayCarbonSweepPoint]
    signal: PathwayComparisonSignal
