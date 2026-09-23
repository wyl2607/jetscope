from fastapi import APIRouter

from app.api.routes import (
    analysis,
    events,
    grid,
    heat,
    health,
    market,
    pathways,
    policies,
    preferences,
    reserves,
    research,
    road_fuels,
    scenarios,
    sources,
    transition,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
api_router.include_router(events.router, prefix="/events", tags=["events"])
api_router.include_router(grid.router, prefix="/analysis", tags=["grid"])
api_router.include_router(heat.router, prefix="/analysis", tags=["heat"])
api_router.include_router(transition.router, prefix="/analysis", tags=["transition"])
api_router.include_router(market.router, prefix="/market", tags=["market"])
api_router.include_router(pathways.router, prefix="/pathways", tags=["pathways"])
api_router.include_router(policies.router, prefix="/policies", tags=["policies"])
api_router.include_router(reserves.router, prefix="/reserves", tags=["reserves"])
api_router.include_router(research.router, prefix="/research", tags=["research"])
api_router.include_router(road_fuels.router, prefix="/road-fuels", tags=["road-fuels"])
api_router.include_router(sources.router, prefix="/sources", tags=["sources"])
api_router.include_router(
    preferences.router, prefix="/workspaces/{workspace_slug}/preferences", tags=["preferences"]
)
api_router.include_router(
    scenarios.router, prefix="/workspaces/{workspace_slug}/scenarios", tags=["scenarios"]
)
