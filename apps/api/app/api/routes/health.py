from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


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
