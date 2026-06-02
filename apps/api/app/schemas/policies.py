from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PolicyTarget(BaseModel):
    year: int
    saf_share_pct: float
    synthetic_share_pct: float
    label: str


EuEtsPressureSignal = Literal["low", "moderate", "high", "severe"]


class EuEtsPressureSource(BaseModel):
    source_type: str
    confidence_score: float = Field(ge=0, le=1)
    cadence: str
    updated_at: str
    fallback_used: bool


class EuEtsPressurePoint(BaseModel):
    eu_ets_eur_per_t: float = Field(ge=0)
    carbon_cost_usd_per_l: float = Field(ge=0)
    effective_fossil_jet_usd_per_l: float = Field(gt=0)
    pressure_pct: float | None


class EuEtsPressureInputs(BaseModel):
    fossil_jet_usd_per_l: float = Field(gt=0)
    exempt_blend_pct: float = Field(ge=0, le=100)
    eu_ets_min: float = Field(ge=0)
    eu_ets_max: float = Field(ge=0)
    eu_ets_step: float = Field(gt=0)


class EuEtsPressureResponse(BaseModel):
    generated_at: datetime
    inputs: EuEtsPressureInputs
    points: list[EuEtsPressurePoint]
    source: EuEtsPressureSource
    signal: EuEtsPressureSignal
