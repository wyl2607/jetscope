from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.readiness import ReadinessCheck, ReadinessResponse
from app.services.bootstrap import utcnow
from app.services.market import build_market_snapshot_response
from app.services.sources import build_source_coverage_response

router = APIRouter()


def _is_configured(value: str | None) -> bool:
    return bool((value or "").strip())


@router.get("/health")
def get_health() -> dict:
    return {
        "ok": True,
        "service": "api",
        "time": datetime.now(timezone.utc).isoformat(),
        "phase0_deprecation_gate": settings.phase0_deprecation_gate,
        "phase_b_capabilities": {
            "market_snapshot": True,
            "scenario_crud": True,
            "preferences_persistence": True,
            "pathways_admin": True,
            "policies_admin": True,
        },
    }


@router.get("/readiness", response_model=ReadinessResponse)
def get_readiness(db: Session = Depends(get_db)) -> ReadinessResponse:
    checks: dict[str, ReadinessCheck] = {}

    try:
        db.execute(text("SELECT 1"))
        checks["database"] = ReadinessCheck(ok=True, status="ok")
    except Exception as exc:
        checks["database"] = ReadinessCheck(ok=False, status="error", detail=str(exc))

    try:
        snapshot = build_market_snapshot_response(db)
        source_status = snapshot.source_status.overall
        checks["market_snapshot"] = ReadinessCheck(
            ok=bool(snapshot.values) and source_status in {"ok", "degraded", "seed"},
            status=source_status,
            detail=f"{len(snapshot.values)} metrics available",
        )
    except Exception as exc:
        checks["market_snapshot"] = ReadinessCheck(ok=False, status="error", detail=str(exc))

    try:
        coverage = build_source_coverage_response(db)
        checks["source_coverage"] = ReadinessCheck(
            ok=coverage.completeness > 0 and bool(coverage.metrics),
            status="degraded" if coverage.degraded else "ok",
            detail=f"completeness={coverage.completeness:.3f}; metrics={len(coverage.metrics)}",
        )
    except Exception as exc:
        checks["source_coverage"] = ReadinessCheck(ok=False, status="error", detail=str(exc))

    admin_token_configured = _is_configured(settings.admin_token)
    checks["admin_token"] = ReadinessCheck(
        ok=admin_token_configured,
        status="ok" if admin_token_configured else "missing",
        detail=(
            "protected write routes configured"
            if admin_token_configured
            else "JETSCOPE_ADMIN_TOKEN is not configured; protected writes and market refresh are locked"
        ),
    )

    if settings.ai_research_enabled:
        ai_research_configured = settings.ai_research_mock_mode or _is_configured(settings.anthropic_api_key)
        checks["ai_research_pipeline"] = ReadinessCheck(
            ok=ai_research_configured,
            status="mock" if settings.ai_research_mock_mode else ("ok" if ai_research_configured else "missing_credentials"),
            detail=(
                "AI research enabled in mock mode"
                if settings.ai_research_mock_mode
                else (
                    "AI research enabled with live extractor credentials"
                    if ai_research_configured
                    else "JETSCOPE_ANTHROPIC_API_KEY is required when mock mode is disabled"
                )
            ),
        )
    else:
        checks["ai_research_pipeline"] = ReadinessCheck(
            ok=False,
            status="disabled",
            detail="JETSCOPE_AI_RESEARCH_ENABLED is false; research signal generation is disabled",
        )

    ready = all(check.ok for check in checks.values())
    degraded = any(check.status in {"degraded", "mock"} for check in checks.values())
    status = "not_ready"
    if ready:
        status = "degraded" if degraded else "ready"

    return ReadinessResponse(
        ready=ready,
        status=status,
        generated_at=utcnow(),
        environment=settings.app_env,
        api_prefix=settings.api_prefix,
        schema_bootstrap_mode=settings.schema_bootstrap_mode,
        degraded=degraded,
        checks=checks,
    )
