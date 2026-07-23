"""Unit tests for apps/api/app/api/router.py.

Tests focus on the router structure, route registration, and conditional
SQLite route inclusion — no IO, no network, no DB required.
"""

import importlib

import pytest
from fastapi import APIRouter
from fastapi.routing import APIRoute


class TestRouterDefaults:
    """api_router structure with default settings (enable_sqlite_routes=False)."""

    def test_api_router_is_apirouter_instance(self):
        from app.api.router import api_router

        assert isinstance(api_router, APIRouter)

    def test_health_route_registered(self):
        from app.api.router import api_router

        paths = {r.path for r in api_router.routes if isinstance(r, APIRoute)}
        assert "/health" in paths

    def test_analysis_route_prefix_registered(self):
        from app.api.router import api_router

        paths = {r.path for r in api_router.routes if isinstance(r, APIRoute)}
        assert any(p.startswith("/analysis") for p in paths)

    def test_workspace_preferences_route_registered(self):
        from app.api.router import api_router

        paths = {r.path for r in api_router.routes if isinstance(r, APIRoute)}
        assert any(
            p.startswith("/workspaces/") and "/preferences" in p
            for p in paths
        )

    def test_workspace_scenarios_route_registered(self):
        from app.api.router import api_router

        paths = {r.path for r in api_router.routes if isinstance(r, APIRoute)}
        assert any(
            p.startswith("/workspaces/") and "/scenarios" in p
            for p in paths
        )

    def test_sqlite_routes_excluded_by_default(self):
        from app.api.router import api_router

        sqlite_paths = [
            r.path
            for r in api_router.routes
            if isinstance(r, APIRoute) and "/sqlite/" in r.path
        ]
        assert len(sqlite_paths) == 0

    def test_all_default_routes_have_expected_tags(self):
        from app.api.router import api_router

        for r in api_router.routes:
            if isinstance(r, APIRoute):
                assert len(r.tags) >= 1, f"Route {r.path} has no tags"


class TestConditionalSqliteRoutes:
    """SQLite routes follow the feature flag without leaking reloaded state."""

    def test_sqlite_routes_included_when_enabled(self, monkeypatch):
        import app.api.router as router_mod
        from app.core.config import settings

        original = settings.enable_sqlite_routes
        try:
            with monkeypatch.context() as patch:
                patch.setattr(settings, "enable_sqlite_routes", True)
                importlib.reload(router_mod)
                paths = {
                    route.path
                    for route in router_mod.api_router.routes
                    if isinstance(route, APIRoute)
                }
                for expected in (
                    "/sqlite/market-prices",
                    "/sqlite/user-scenarios",
                    "/sqlite/market-alerts",
                ):
                    assert any(expected in path for path in paths)
        finally:
            settings.enable_sqlite_routes = original
            importlib.reload(router_mod)

    def test_router_matches_restored_feature_flag(self):
        import app.api.router as router_mod
        from app.core.config import settings

        paths = {
            route.path
            for route in router_mod.api_router.routes
            if isinstance(route, APIRoute)
        }
        sqlite_paths = [path for path in paths if "/sqlite/" in path]
        assert bool(sqlite_paths) is settings.enable_sqlite_routes
