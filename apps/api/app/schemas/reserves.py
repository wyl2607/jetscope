from datetime import datetime

from pydantic import BaseModel, Field


class ReserveStressResponse(BaseModel):
    region: str
    coverage_days: int = Field(ge=0)
    stress_level: str
    # None when no verified estimate is available (do not invent a gap %).
    supply_gap_pct: float | None = Field(default=None, ge=0, le=100)
    source_type: str
    confidence: float = Field(ge=0, le=1)
    source_name: str = "JetScope curated / env override (not IATA/EUROCONTROL live feed)"
    coverage_source: str = "curated_default"
    supply_gap_source: str = "unset_no_estimate"
    stress_source: str = "derived_from_coverage_days"
    supply_status_note: str | None = None
    supply_status_as_of: str | None = None


class ReserveSignalResponse(BaseModel):
    generated_at: datetime
    region: str
    coverage_days: int = Field(ge=0)
    coverage_weeks: float = Field(ge=0)
    stress_level: str
    # None when unknown — clients must not treat missing as zero without checking.
    estimated_supply_gap_pct: float | None = Field(default=None, ge=0, le=100)
    source_type: str
    source_name: str
    confidence_score: float = Field(ge=0, le=1)
    coverage_source: str | None = None
    supply_gap_source: str | None = None
    stress_source: str | None = None
    supply_status_note: str | None = None
    supply_status_as_of: str | None = None
