"""Focused unit tests for apps/api/app/main.py — no IO / DB / network."""

from datetime import timedelta

from fastapi import FastAPI

from app.main import (
    AI_RESEARCH_REFRESH_INTERVAL,
    RESERVES_REFRESH_INTERVAL,
    TIPPING_EVALUATION_INTERVAL,
    create_app,
)

# Re-import the module-level singleton created by `app = create_app()` at the
# bottom of main.py.  The import above already triggered it; grab the reference
# explicitly so the origin is clear.
from app.main import app as module_app


# ── create_app() ─────────────────────────────────────────────────────────────


def test_create_app_returns_fastapi_instance():
    app = create_app()
    assert isinstance(app, FastAPI)


def test_create_app_sets_correct_metadata():
    app = create_app()
    assert app.title == "JetScope API"
    assert app.version == "0.1.0"
    assert "aviation fuel" in app.description.lower()


def test_create_app_includes_router_with_prefix():
    app = create_app()
    prefixes = {r.path for r in app.routes if hasattr(r, "path")}
    # The router is mounted at settings.api_prefix ("/v1"); at least one route
    # under that prefix should be present.
    assert any(p.startswith("/v1/") for p in prefixes), (
        f"No routes found under /v1/ – got prefixes: {prefixes}"
    )


def test_market_refresh_task_is_none_after_create():
    app = create_app()
    assert app.state.market_refresh_task is None


# ── Module-level singleton ──────────────────────────────────────────────────


def test_module_level_app_is_fastapi():
    assert isinstance(module_app, FastAPI)


def test_module_level_app_has_routes():
    prefixes = {r.path for r in module_app.routes if hasattr(r, "path")}
    assert any(p.startswith("/v1/") for p in prefixes)


# ── Constants ────────────────────────────────────────────────────────────────


class TestConstants:
    def test_tipping_evaluation_interval_is_15_minutes(self):
        assert TIPPING_EVALUATION_INTERVAL == timedelta(minutes=15)

    def test_reserves_refresh_interval_is_24_hours(self):
        assert RESERVES_REFRESH_INTERVAL == timedelta(hours=24)

    def test_ai_research_refresh_interval_is_24_hours(self):
        assert AI_RESEARCH_REFRESH_INTERVAL == timedelta(hours=24)
