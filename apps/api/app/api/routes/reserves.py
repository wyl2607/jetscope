from fastapi import APIRouter

from app.schemas.reserves import ReserveSignalResponse
from app.services.analysis.dashboard_contracts import build_eu_reserve_signal_response

router = APIRouter()


@router.get("/eu", response_model=ReserveSignalResponse)
def get_eu_reserve_signal() -> ReserveSignalResponse:
    return build_eu_reserve_signal_response()
