from typing import Annotated

from fastapi import APIRouter, Query

from app.schemas.road_fuels import (
    ConsumptionAssumptions,
    CostPer100km,
    CpiPassThrough,
    ElectricityPrice,
    PumpPrices,
    RoadFuelsGermanyResponse,
)
from app.services import road_fuels
from app.services.bootstrap import utcnow

router = APIRouter()


@router.get("/germany", response_model=RoadFuelsGermanyResponse)
def get_germany_road_fuels(
    diesel_l_per_100km: Annotated[float, Query(gt=0, le=30)] = road_fuels.DEFAULT_DIESEL_L_PER_100KM,
    petrol_l_per_100km: Annotated[float, Query(gt=0, le=30)] = road_fuels.DEFAULT_PETROL_L_PER_100KM,
    ev_kwh_per_100km: Annotated[float, Query(gt=0, le=60)] = road_fuels.DEFAULT_EV_KWH_PER_100KM,
) -> RoadFuelsGermanyResponse:
    summary, fetched_at = road_fuels.latest_pump_prices()
    pump = None
    if summary is not None and fetched_at is not None:
        pump = PumpPrices(
            week=summary["week"],
            fetched_at=fetched_at,
            source_name=road_fuels.WOB_SOURCE_NAME,
            source_url=road_fuels.WOB_HISTORY_URL,
            **summary["fuels"],
        )
    release = road_fuels.latest_cpi_release()
    inflation = None
    if release is not None:
        fields = {key: value for key, value in release.items() if key in CpiPassThrough.model_fields}
        inflation = CpiPassThrough(
            **fields,
            motor_fuels_contribution_pp=round(
                release["motor_fuels_weight_per_mille"] / 1000 * release["motor_fuels_yoy_pct"], 2
            ),
        )
    electricity = road_fuels.household_electricity_prices()
    costs = CostPer100km(
        assumptions=ConsumptionAssumptions(
            diesel_l_per_100km=diesel_l_per_100km,
            petrol_l_per_100km=petrol_l_per_100km,
            ev_kwh_per_100km=ev_kwh_per_100km,
        ),
        electricity=ElectricityPrice(**electricity["primary"]) if electricity else None,
        electricity_reference=ElectricityPrice(**electricity["reference"]) if electricity else None,
        **road_fuels.cost_per_100km(
            summary["fuels"] if summary is not None else None,
            electricity,
            diesel_l_per_100km,
            petrol_l_per_100km,
            ev_kwh_per_100km,
        ),
    )
    return RoadFuelsGermanyResponse(generated_at=utcnow(), pump=pump, inflation=inflation, cost_per_100km=costs)
