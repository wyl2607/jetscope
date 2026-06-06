from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

HeatParityStatus = Literal["uneconomic", "inflection", "marginal_switch", "dominant"]
HeatParitySignal = Literal["clear_leader", "close_race", "no_advantage"]


class HeatPumpReference(BaseModel):
    tech_key: str
    name: str
    cop: float = Field(gt=0)


class GasBoilerReference(BaseModel):
    name: str
    efficiency: float = Field(gt=0, le=1)
    gas_price_eur_per_mwh_th: float = Field(ge=0)
    emission_intensity_t_per_mwh_th: float = Field(ge=0)
    heat_cost_eur_per_mwh: float = Field(ge=0)


class HeatParityInputs(BaseModel):
    carbon_price_eur_per_t: float = Field(ge=0)
    elec_price_eur_per_mwh_el: float = Field(ge=0)
    gas_price_eur_per_mwh_th: float = Field(ge=0)


class HeatParityRow(BaseModel):
    tech_key: str
    name: str
    cop: float = Field(gt=0)
    hp_heat_cost_eur_per_mwh: float = Field(ge=0)
    gas_heat_cost_eur_per_mwh: float = Field(ge=0)
    gap_vs_gas_eur_per_mwh: float
    spread_pct: float
    breakeven_carbon_price_eur_per_t: float = Field(ge=0)
    status: HeatParityStatus


class HeatCarbonSweepEntry(BaseModel):
    tech_key: str
    gap_vs_gas_eur_per_mwh: float
    status: HeatParityStatus


class HeatCarbonSweepPoint(BaseModel):
    carbon_price_eur_per_t: float
    gas_heat_cost_eur_per_mwh: float = Field(ge=0)
    techs: list[HeatCarbonSweepEntry]


class HeatParityResponse(BaseModel):
    generated_at: datetime
    inputs: HeatParityInputs
    gas_boiler_reference: GasBoilerReference
    heat_pump_references: list[HeatPumpReference]
    rows: list[HeatParityRow]
    carbon_sweep: list[HeatCarbonSweepPoint]
    signal: HeatParitySignal
