from datetime import datetime

from pydantic import BaseModel, Field


class ReserveStressResponse(BaseModel):
    region: str
    coverage_days: int = Field(ge=0)
    stress_level: str
    supply_gap_pct: float = Field(ge=0, le=100)
    source_type: str
    confidence: float = Field(ge=0, le=1)
    observed_at: datetime | None = None


class ReserveSignalResponse(BaseModel):
    generated_at: datetime
    region: str
    coverage_days: int = Field(ge=0)
    coverage_weeks: float = Field(ge=0)
    stress_level: str
    estimated_supply_gap_pct: float = Field(ge=0, le=100)
    source_type: str
    source_name: str
    confidence_score: float = Field(ge=0, le=1)
