from fastapi import APIRouter

from app.schemas.road_fuels import CpiPassThrough, PumpPrices, RoadFuelsGermanyResponse
from app.services import road_fuels
from app.services.bootstrap import utcnow

router = APIRouter()


@router.get("/germany", response_model=RoadFuelsGermanyResponse)
def get_germany_road_fuels() -> RoadFuelsGermanyResponse:
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
    return RoadFuelsGermanyResponse(generated_at=utcnow(), pump=pump, inflation=inflation)
