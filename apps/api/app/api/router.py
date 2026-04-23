from fastapi import APIRouter

from app.api.routes import analysis, health, market, pathways, policies, preferences, reserves, scenarios, sources
from app.api.routes import sqlite_alerts, sqlite_markets, sqlite_scenarios
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
api_router.include_router(market.router, prefix="/market", tags=["market"])
api_router.include_router(pathways.router, prefix="/pathways", tags=["pathways"])
api_router.include_router(policies.router, prefix="/policies", tags=["policies"])
api_router.include_router(reserves.router, prefix="/reserves", tags=["reserves"])
api_router.include_router(sources.router, prefix="/sources", tags=["sources"])
api_router.include_router(
    preferences.router, prefix="/workspaces/{workspace_slug}/preferences", tags=["preferences"]
)
api_router.include_router(
    scenarios.router, prefix="/workspaces/{workspace_slug}/scenarios", tags=["scenarios"]
)

if settings.enable_sqlite_routes:
    api_router.include_router(sqlite_markets.router, tags=["sqlite-markets"])
    api_router.include_router(sqlite_scenarios.router, tags=["sqlite-scenarios"])
    api_router.include_router(sqlite_alerts.router, tags=["sqlite-alerts"])
