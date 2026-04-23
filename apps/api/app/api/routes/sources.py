from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.schemas.sources import SourceCoverageResponse
from app.db.session import get_db
from app.services.sources import build_source_coverage_response

router = APIRouter()


@router.get("/coverage", response_model=SourceCoverageResponse)
def get_source_coverage(db: Session = Depends(get_db)) -> SourceCoverageResponse:
    return build_source_coverage_response(db)
