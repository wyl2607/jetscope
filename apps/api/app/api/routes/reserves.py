from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.reserves import ReserveSignalResponse
from app.services.analysis.dashboard_contracts import build_eu_reserve_signal_response

router = APIRouter()


@router.get("/eu", response_model=ReserveSignalResponse)
def get_eu_reserve_signal(db: Session = Depends(get_db)) -> ReserveSignalResponse:
    return build_eu_reserve_signal_response(db=db)
