from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

GridParityStatus = Literal["uneconomic", "inflection", "marginal_switch", "dominant"]
GridParitySignal = Literal["clear_leader", "close_race", "no_advantage"]


class RenewableTechBand(BaseModel):
    tech_key: str
    name: str
    lcoe_low_eur_per_mwh: float = Field(gt=0)
    lcoe_mid_eur_per_mwh: float = Field(gt=0)
    lcoe_high_eur_per_mwh: float = Field(gt=0)
    maturity_level: str


class FossilReference(BaseModel):
    plant_key: str
    name: str
    efficiency: float = Field(gt=0, le=1)
    fuel_cost_eur_per_mwh_th: float = Field(ge=0)
    var_o_m_eur_per_mwh: float = Field(ge=0)
    emission_intensity_t_per_mwh: float = Field(ge=0)
    marginal_cost_eur_per_mwh: float = Field(gt=0)


class GridParityInputs(BaseModel):
    carbon_price_eur_per_t: float = Field(ge=0)
    gas_fuel_eur_per_mwh_th: float = Field(ge=0)
    coal_fuel_eur_per_mwh_th: float = Field(ge=0)
    fossil_reference_key: str


class GridParityRow(BaseModel):
    tech_key: str
    name: str
    lcoe_mid_eur_per_mwh: float = Field(gt=0)
    maturity_level: str
    gap_vs_fossil_eur_per_mwh: float
    spread_pct: float
    status: GridParityStatus


class GridCarbonSweepEntry(BaseModel):
    tech_key: str
    gap_vs_fossil_eur_per_mwh: float
    status: GridParityStatus


class GridCarbonSweepPoint(BaseModel):
    carbon_price_eur_per_t: float
    fossil_marginal_cost_eur_per_mwh: float
    techs: list[GridCarbonSweepEntry]


class GridParityResponse(BaseModel):
    generated_at: datetime
    inputs: GridParityInputs
    fossil_reference: FossilReference
    rows: list[GridParityRow]
    carbon_sweep: list[GridCarbonSweepPoint]
    signal: GridParitySignal


class GridHistoryPoint(BaseModel):
    year: int
    carbon_price_eur_per_t: float = Field(ge=0)
    fossil_marginal_cost_eur_per_mwh: float = Field(gt=0)
    solar_lcoe_eur_per_mwh: float = Field(gt=0)
    solar_gap_eur_per_mwh: float
    status: GridParityStatus
    source: str
    confidence: float = Field(ge=0, le=1)
    fallback: bool


class GridHistoryResponse(BaseModel):
    generated_at: datetime
    region: str
    disclaimer: str
    points: list[GridHistoryPoint]
