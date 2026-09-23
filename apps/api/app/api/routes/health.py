from datetime import datetime, timezone
import re

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.readiness import ReadinessAction, ReadinessCheck, ReadinessResponse
from app.services.bootstrap import utcnow
from app.services.market import build_market_snapshot_response
from app.services.sources import build_source_coverage_response

router = APIRouter()


def _is_configured(value: str | None) -> bool:
    return bool((value or "").strip())


def _sanitize_error_detail(error: str) -> str:
    sanitized = error

    if not sanitized:
        return sanitized

    for secret in (
        settings.admin_token,
        settings.anthropic_api_key,
        settings.database_url,
        settings.newsapi_key,
    ):
        if secret:
            sanitized = sanitized.replace(secret, "[redacted-secret]")
            stripped = secret.strip()
            if stripped and stripped != secret:
                sanitized = sanitized.replace(stripped, "[redacted-secret]")

    sanitized = re.sub(
        r"(?i)\bbearer\s+[^\s,;\"']+",
        "Bearer [redacted-secret]",
        sanitized,
    )
    sanitized = re.sub(
        r"(?i)([?&](?:token|access_token|refresh_token|api_key|apikey))=[^&\s\"']+",
        r"\1=[redacted-secret]",
        sanitized,
    )
    sanitized = re.sub(
        r"(?i)([a-z][a-z0-9+.-]*://[^/\s:]+:)[^@\s/?]+(@)",
        r"\1[redacted-secret]\2",
        sanitized,
    )

    return sanitized


def _error_detail(exc: Exception) -> str:
    return _sanitize_error_detail(str(exc))


def _readiness_action(key: str, href: str | None = None, config_keys: list[str] | None = None) -> ReadinessAction:
    return ReadinessAction(key=key, href=href, config_keys=config_keys or [])


def _readiness_check(
    *,
    ok: bool,
    status: str,
    detail: str | None = None,
    severity: str | None = None,
    action: ReadinessAction | None = None,
) -> ReadinessCheck:
    resolved_severity = severity
    if resolved_severity is None:
        resolved_severity = "ok" if ok and status not in {"degraded", "mock", "seed"} else ("review" if ok else "blocker")
    return ReadinessCheck(
        ok=ok,
        status=status,
        detail=detail,
        severity=resolved_severity,
        blocking=resolved_severity == "blocker",
        action=action,
    )


_MISSING_REFRESH_TASK = object()


def _market_refresh_task_running(request: Request | None) -> bool:
    """Whether the background market refresh loop is alive.

    Calls without an ASGI request only see the config switch. Served requests
    read ``app.state.market_refresh_task`` owned by the API process.
    """
    if not settings.market_refresh_loop_enabled:
        return False
    if request is None:
        return True
    task = getattr(request.app.state, "market_refresh_task", _MISSING_REFRESH_TASK)
    if task is _MISSING_REFRESH_TASK or task is None:
        return False
    done = getattr(task, "done", None)
    if callable(done):
        try:
            if done():
                return False
        except Exception:
            return False
    cancelled = getattr(task, "cancelled", None)
    if callable(cancelled):
        try:
            if cancelled():
                return False
        except Exception:
            return False
    return True


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
def get_readiness(db: Session = Depends(get_db), request: Request = None) -> ReadinessResponse:
    checks: dict[str, ReadinessCheck] = {}

    try:
        db.execute(text("SELECT 1"))
        checks["database"] = _readiness_check(ok=True, status="ok")
    except Exception as exc:
        checks["database"] = _readiness_check(
            ok=False,
            status="error",
            detail=_error_detail(exc),
            action=_readiness_action(
                "inspect_database",
                "/admin",
                ["JETSCOPE_DATABASE_URL", "JETSCOPE_SCHEMA_BOOTSTRAP_MODE"],
            ),
        )

    try:
        snapshot = build_market_snapshot_response(db)
        source_status = snapshot.source_status.overall
        market_ok = bool(snapshot.values) and source_status in {"ok", "degraded", "seed"}
        market_clean = market_ok and source_status == "ok"
        checks["market_snapshot"] = _readiness_check(
            ok=market_ok,
            status=source_status,
            detail=f"{len(snapshot.values)} metrics available",
            severity="ok" if market_clean else "review",
            action=_readiness_action(
                "review_market_sources",
                "/sources?filter=review" if source_status != "ok" else "/sources",
            ),
        )
    except Exception as exc:
        checks["market_snapshot"] = _readiness_check(
            ok=False,
            status="error",
            detail=_error_detail(exc),
            severity="review",
            action=_readiness_action("review_market_sources", "/sources?filter=review"),
        )

    try:
        coverage = build_source_coverage_response(db)
        coverage_ok = coverage.completeness > 0 and bool(coverage.metrics)
        coverage_clean = coverage_ok and not coverage.degraded
        checks["source_coverage"] = _readiness_check(
            ok=coverage_ok,
            status="ok" if coverage_clean else "degraded",
            detail=f"completeness={coverage.completeness:.3f}; metrics={len(coverage.metrics)}",
            severity="ok" if coverage_clean else "review",
            action=_readiness_action(
                "review_source_coverage",
                "/sources?filter=review" if not coverage_clean else "/sources",
            ),
        )
    except Exception as exc:
        checks["source_coverage"] = _readiness_check(
            ok=False,
            status="error",
            detail=_error_detail(exc),
            severity="review",
            action=_readiness_action("review_source_coverage", "/sources?filter=review"),
        )

    admin_token_configured = _is_configured(settings.admin_token)
    checks["admin_token"] = _readiness_check(
        ok=admin_token_configured,
        status="ok" if admin_token_configured else "missing",
        detail=(
            "protected write routes configured"
            if admin_token_configured
            else "JETSCOPE_ADMIN_TOKEN is not configured; protected writes and market refresh are locked"
        ),
        severity="ok" if admin_token_configured else "blocker",
        action=_readiness_action(
            "review_admin_token" if admin_token_configured else "configure_admin_token",
            "/admin",
            [] if admin_token_configured else ["JETSCOPE_ADMIN_TOKEN"],
        ),
    )

    if settings.ai_research_informational:
        if settings.ai_research_enabled and settings.ai_research_mock_mode:
            checks["ai_research_pipeline"] = _readiness_check(
                ok=True,
                status="mock",
                detail="AI research enabled in mock mode",
                severity="info",
                action=_readiness_action(
                    "review_ai_research_mock_mode",
                    "/research",
                    ["JETSCOPE_AI_RESEARCH_MOCK_MODE"],
                ),
            )
        else:
            checks["ai_research_pipeline"] = _readiness_check(
                ok=True,
                status="disabled",
                detail="JETSCOPE_AI_RESEARCH_ENABLED is false; research signal generation is disabled",
                severity="info",
                action=_readiness_action(
                    "enable_ai_research",
                    "/research",
                    ["JETSCOPE_AI_RESEARCH_ENABLED"],
                ),
            )
    else:
        ai_research_configured = _is_configured(settings.anthropic_api_key)
        checks["ai_research_pipeline"] = _readiness_check(
            ok=ai_research_configured,
            status="ok" if ai_research_configured else "missing_credentials",
            detail=(
                "AI research enabled with live extractor credentials"
                if ai_research_configured
                else "JETSCOPE_ANTHROPIC_API_KEY is required when mock mode is disabled"
            ),
            severity="ok" if ai_research_configured else "blocker",
            action=_readiness_action(
                "review_ai_research_pipeline" if ai_research_configured else "configure_ai_research_credentials",
                "/research",
                [] if ai_research_configured else ["JETSCOPE_ANTHROPIC_API_KEY"],
            ),
        )

    refresh_running = _market_refresh_task_running(request)
    if refresh_running:
        refresh_status = "running"
        refresh_detail = "market refresh loop is running"
        refresh_action = _readiness_action("review_market_refresh", "/sources")
    elif not settings.market_refresh_loop_enabled:
        refresh_status = "disabled"
        refresh_detail = (
            "JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS is not positive; market refresh loop is disabled"
        )
        refresh_action = _readiness_action(
            "enable_market_refresh",
            "/admin",
            ["JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS"],
        )
    else:
        refresh_status = "stopped"
        refresh_detail = "market refresh loop is not running"
        refresh_action = _readiness_action(
            "start_market_refresh",
            "/admin",
            ["JETSCOPE_MARKET_REFRESH_INTERVAL_SECONDS"],
        )
    checks["market_refresh_task"] = _readiness_check(
        ok=refresh_running,
        status=refresh_status,
        detail=refresh_detail,
        severity="ok" if refresh_running else "blocker",
        action=refresh_action,
    )

    ready = checks["database"].ok and checks["admin_token"].ok and checks["market_refresh_task"].ok
    degraded = checks["market_snapshot"].severity == "review" or checks["source_coverage"].severity == "review"
    if not ready:
        status = "not_ready"
    elif degraded:
        status = "degraded"
    else:
        status = "ready"

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
