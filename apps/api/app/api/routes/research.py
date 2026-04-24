from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.research import ResearchSignalResponse
from app.services.ai_research.signals import SignalRepository

router = APIRouter()
repository = SignalRepository()

SignalTypeParam = Literal[
    "SUPPLY_DISRUPTION",
    "POLICY_CHANGE",
    "PRICE_SHOCK",
    "CAPACITY_ANNOUNCEMENT",
    "OTHER",
]


@router.get("/signals", response_model=list[ResearchSignalResponse])
def list_research_signals(
    since: datetime = Query(..., description="Filter records created at or after this ISO8601 timestamp"),
    limit: int = Query(default=50, ge=1, le=200),
    signal_type: SignalTypeParam | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[ResearchSignalResponse]:
    rows = repository.list_recent(db=db, since=since, limit=limit, signal_type=signal_type)
    return [
        ResearchSignalResponse(
            id=row.id,
            created_at=row.created_at,
            source_url=row.source_url,
            signal_type=row.signal_type,
            entities=list(row.entities or []),
            impact_direction=row.impact_direction,
            confidence=float(row.confidence),
            summary_en=row.summary_en,
            summary_cn=row.summary_cn,
            raw_title=row.raw_title,
            raw_excerpt=row.raw_excerpt,
            published_at=row.published_at,
            claude_model=row.claude_model,
            prompt_cache_hit=bool(row.prompt_cache_hit),
        )
        for row in rows
    ]
