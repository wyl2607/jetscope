from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.analysis import (
    AirlineDecisionResponse,
    CrisisBriefAction,
    CrisisBriefResearchPosture,
    CrisisBriefResponse,
    TippingEventResponse,
    TippingPointResponse,
)
from app.services.analysis.dashboard_contracts import (
    build_airline_decision_response,
    build_eu_reserve_signal_response,
    build_tipping_point_response,
)
from app.services.analysis.pathway_costs import DEFAULT_ANALYSIS_PATHWAY_KEY, get_pathway_cost
from app.services.analysis.tipping_point import TippingPointEngine
from app.services.ai_research.signals import SignalRepository
from app.services.bootstrap import utcnow
from app.services.market import build_market_snapshot_response

router = APIRouter()
engine = TippingPointEngine()
signal_repository = SignalRepository()


@router.get("/tipping-point", response_model=TippingPointResponse)
def get_tipping_point_analysis(
    fossil_jet_usd_per_l: float = Query(..., gt=0, description="Current fossil jet fuel price in USD/L"),
    carbon_price_eur_per_t: float = Query(0.0, ge=0, description="Carbon price in EUR per metric ton"),
    subsidy_usd_per_l: float = Query(0.0, ge=0, description="Per-liter SAF subsidy in USD"),
    blend_rate_pct: float = Query(0.0, ge=0, le=100, description="Blend rate as percent of total fuel burn"),
) -> TippingPointResponse:
    return build_tipping_point_response(
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        subsidy_usd_per_l=subsidy_usd_per_l,
        blend_rate_pct=blend_rate_pct,
    )


@router.get("/airline-decision", response_model=AirlineDecisionResponse)
def get_airline_decision_analysis(
    fossil_jet_usd_per_l: float = Query(..., gt=0, description="Current fossil jet fuel price in USD/L"),
    reserve_weeks: float = Query(..., gt=0, description="Estimated reserve coverage in weeks"),
    carbon_price_eur_per_t: float = Query(0.0, ge=0, description="Carbon price in EUR per metric ton"),
    pathway_key: str = Query(DEFAULT_ANALYSIS_PATHWAY_KEY, description="SAF pathway key"),
) -> AirlineDecisionResponse:
    try:
        get_pathway_cost(pathway_key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Unknown pathway_key: {pathway_key}") from exc

    return build_airline_decision_response(
        fossil_jet_usd_per_l=fossil_jet_usd_per_l,
        reserve_weeks=reserve_weeks,
        carbon_price_eur_per_t=carbon_price_eur_per_t,
        pathway_key=pathway_key,
    )


@router.get("/tipping-point/events", response_model=list[TippingEventResponse])
def list_tipping_point_events(
    since: datetime | None = Query(default=None, description="Filter events observed at or after this ISO8601 timestamp"),
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[TippingEventResponse]:
    events = engine.fetch_events(db, since=since, limit=limit)
    return [
        TippingEventResponse(
            id=event.id,
            event_type=event.event_type,
            saf_pathway=event.saf_pathway,
            fossil_price_usd_per_l=float(event.fossil_price),
            saf_effective_cost_usd_per_l=float(event.saf_effective_price),
            gap_usd_per_l=float(event.gap_usd_per_litre),
            observed_at=event.timestamp,
            metadata=dict(event.metadata_ or {}),
        )
        for event in events
    ]


def _resolve_fossil_jet_usd_per_l(values: dict[str, float]) -> float:
    for key in ("rotterdam_jet_fuel_usd_per_l", "jet_eu_proxy_usd_per_l", "jet_usd_per_l"):
        value = values.get(key)
        if isinstance(value, int | float) and value > 0:
            return float(value)
    return 0.99


def _build_research_posture(db: Session) -> CrisisBriefResearchPosture:
    if not settings.ai_research_enabled:
        return CrisisBriefResearchPosture(status="disabled", signal_count=0)

    rows = signal_repository.list_recent(
        db=db,
        since=datetime.now(timezone.utc) - timedelta(days=30),
        limit=20,
    )
    if not rows:
        return CrisisBriefResearchPosture(status="empty", signal_count=0)

    top_signal = max(rows, key=lambda row: (float(row.confidence), row.published_at))
    latest_published_at = max(row.published_at for row in rows)
    return CrisisBriefResearchPosture(
        status="signal_backed",
        signal_count=len(rows),
        top_signal_title=top_signal.raw_title,
        top_signal_confidence=float(top_signal.confidence),
        latest_published_at=latest_published_at,
    )


def _crisis_actions() -> list[CrisisBriefAction]:
    return [
        CrisisBriefAction(
            id="review_sources",
            label="Review source evidence",
            href="/sources?filter=review",
            reason="Check fallback, proxy, degraded, and volatile rows before using crisis signals operationally.",
        ),
        CrisisBriefAction(
            id="open_report",
            label="Open tipping-point report",
            href="/reports/tipping-point-analysis",
            reason="Move from the brief into the longer source-backed SAF tipping-point evidence chain.",
        ),
        CrisisBriefAction(
            id="review_scenarios",
            label="Review scenarios",
            href="/scenarios",
            reason="Compare saved assumptions against current reserve stress and source confidence.",
        ),
    ]


@router.get("/crisis-brief", response_model=CrisisBriefResponse)
def get_crisis_brief(
    since: datetime | None = Query(default=None, description="Filter tipping events observed at or after this ISO8601 timestamp"),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
) -> CrisisBriefResponse:
    market = build_market_snapshot_response(db)
    reserve = build_eu_reserve_signal_response(db=db)
    event_since = since or (datetime.now(timezone.utc) - timedelta(days=42))
    events = engine.fetch_events(db, since=event_since, limit=limit)

    return CrisisBriefResponse(
        generated_at=utcnow(),
        market_generated_at=market.generated_at,
        fossil_jet_usd_per_l=_resolve_fossil_jet_usd_per_l(market.values),
        source_status=market.source_status,
        reserve=reserve,
        tipping_events=[
            TippingEventResponse(
                id=event.id,
                event_type=event.event_type,
                saf_pathway=event.saf_pathway,
                fossil_price_usd_per_l=float(event.fossil_price),
                saf_effective_cost_usd_per_l=float(event.saf_effective_price),
                gap_usd_per_l=float(event.gap_usd_per_litre),
                observed_at=event.timestamp,
                metadata=dict(event.metadata_ or {}),
            )
            for event in events
        ],
        research=_build_research_posture(db),
        actions=_crisis_actions(),
    )
