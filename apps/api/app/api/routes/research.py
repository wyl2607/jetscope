from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.research import ResearchRefreshResponse, ResearchSignalResponse
from app.security import require_admin_token
from app.services.ai_research import run_daily_pipeline
from app.services.ai_research.signals import SignalRepository

router = APIRouter()
repository = SignalRepository()

SignalTypeParam = Literal[
    "SUPPLY_DISRUPTION",
    "POLICY_CHANGE",
    "PRICE_SHOCK",
    "CAPACITY_ANNOUNCEMENT",
    "TECHNOLOGY_BREAKTHROUGH",
    "GRID_INFRASTRUCTURE",
    "OTHER",
]


@router.get("/signals", response_model=list[ResearchSignalResponse])
def list_research_signals(
    since: datetime | None = Query(
        default=None,
        description="Filter records created at or after this ISO8601 timestamp. Defaults to the last 30 days.",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    signal_type: SignalTypeParam | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[ResearchSignalResponse]:
    effective_since = since or (datetime.now(timezone.utc) - timedelta(days=30))
    rows = repository.list_recent(db=db, since=effective_since, limit=limit, signal_type=signal_type)
    return [
        ResearchSignalResponse(
            id=row.id,
            created_at=row.created_at,
            updated_at=row.updated_at,
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


@router.post("/refresh", response_model=ResearchRefreshResponse)
def refresh_research_signals(
    _auth: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> ResearchRefreshResponse:
    if not settings.ai_research_enabled:
        raise HTTPException(status_code=409, detail="AI research pipeline is not enabled")
    if not settings.ai_research_mock_mode and not settings.anthropic_api_key.strip():
        raise HTTPException(status_code=409, detail="AI research extractor credentials are not configured")

    result = run_daily_pipeline(db)
    fetched = int(result.get("fetched", 0))
    extracted = int(result.get("extracted", 0))
    persisted = int(result.get("persisted", 0))
    skipped_budget = int(result.get("skipped_budget", 0))
    return ResearchRefreshResponse(
        accepted=True,
        message=(
            "AI research refresh completed: "
            f"fetched={fetched}, extracted={extracted}, persisted={persisted}, skipped_budget={skipped_budget}"
        ),
        fetched=fetched,
        extracted=extracted,
        persisted=persisted,
        skipped_budget=skipped_budget,
    )
