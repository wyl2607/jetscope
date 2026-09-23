from datetime import date, datetime

from pydantic import BaseModel


class FuelPumpPrice(BaseModel):
    with_tax_eur_per_l: float
    ex_tax_eur_per_l: float
    tax_share_pct: float
    change_4w_pct: float | None
    change_52w_pct: float | None


class PumpPrices(BaseModel):
    week: date
    fetched_at: datetime
    source_name: str
    source_url: str
    euro95: FuelPumpPrice
    diesel: FuelPumpPrice


class CpiPassThrough(BaseModel):
    period: str
    published_at: date
    cpi_yoy_pct: float
    energy_yoy_pct: float
    motor_fuels_yoy_pct: float
    heating_oil_yoy_pct: float
    cpi_ex_heating_oil_and_motor_fuels_yoy_pct: float
    motor_fuels_weight_per_mille: float
    # weight x YoY: a static first-order share of headline CPI, not a Destatis figure.
    motor_fuels_contribution_pp: float
    source_name: str
    source_url: str


class RoadFuelsGermanyResponse(BaseModel):
    generated_at: datetime
    pump: PumpPrices | None
    inflation: CpiPassThrough | None
