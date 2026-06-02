import asyncio
from datetime import datetime, timezone

import pytest

from app import main


def test_create_app_sets_metadata_router_and_refresh_state():
    app = main.create_app()

    assert app.title == "JetScope API"
    assert app.version == "0.1.0"
    assert app.description == "Aviation fuel transition intelligence API"
    assert app.state.market_refresh_task is None
    assert any(route.path == f"{main.settings.api_prefix}/health" for route in app.routes)


def test_startup_bootstraps_schema_and_schedules_market_refresh(monkeypatch):
    calls = {}

    class FakeTask:
        def __init__(self):
            self.cancelled = False
            self.awaited = False

        def cancel(self):
            self.cancelled = True

        def __await__(self):
            async def _wait():
                self.awaited = True
                raise asyncio.CancelledError

            return _wait().__await__()

    fake_task = FakeTask()

    def fake_apply_schema_bootstrap(engine):
        calls["bootstrap_engine"] = engine
        return "unit-test"

    async def fake_market_refresh_loop(interval_seconds):
        calls["loop_interval"] = interval_seconds

    def fake_create_task(coro):
        calls["task_coro_name"] = coro.cr_code.co_name
        coro.close()
        return fake_task

    monkeypatch.setattr(main, "apply_schema_bootstrap", fake_apply_schema_bootstrap)
    monkeypatch.setattr(main, "_market_refresh_loop", fake_market_refresh_loop)
    monkeypatch.setattr(main.asyncio, "create_task", fake_create_task)
    monkeypatch.setattr(main.settings, "market_refresh_interval_seconds", 42)

    app = main.create_app()

    asyncio.run(app.router.startup())
    asyncio.run(app.router.shutdown())

    assert calls["bootstrap_engine"] is main.engine
    assert calls["task_coro_name"] == "fake_market_refresh_loop"
    assert app.state.market_refresh_task is fake_task
    assert fake_task.cancelled is True
    assert fake_task.awaited is True


def test_startup_does_not_schedule_market_refresh_when_disabled(monkeypatch):
    calls = {"create_task": 0}

    monkeypatch.setattr(main, "apply_schema_bootstrap", lambda _engine: "unit-test")
    monkeypatch.setattr(main.settings, "market_refresh_interval_seconds", 0)
    monkeypatch.setattr(
        main.asyncio,
        "create_task",
        lambda _coro: calls.__setitem__("create_task", calls["create_task"] + 1),
    )

    app = main.create_app()

    asyncio.run(app.router.startup())
    asyncio.run(app.router.shutdown())

    assert calls["create_task"] == 0
    assert app.state.market_refresh_task is None


def test_market_refresh_loop_runs_one_full_cycle_with_faked_collaborators(monkeypatch):
    fixed_now = datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc)
    calls = {
        "closed": 0,
        "market": [],
        "reserves": 0,
        "evaluated_at": [],
        "recorded_events": [],
        "ai_research": 0,
        "slept": [],
    }

    class FakeDb:
        def close(self):
            calls["closed"] += 1

    class FakeTippingPointEngine:
        def evaluate(self, *, now, db):
            calls["evaluated_at"].append((now, db))
            return ["event-a", "event-b"]

        def record_events(self, events, db):
            calls["recorded_events"].append((events, db))

    def fake_refresh_market_snapshot_set(db):
        calls["market"].append(db)
        return fixed_now, "fresh"

    def fake_refresh_reserves_coverage(db):
        calls["reserves"] += 1
        assert isinstance(db, FakeDb)
        return 3

    def fake_run_daily_pipeline(db):
        calls["ai_research"] += 1
        assert isinstance(db, FakeDb)
        return {"fetched": 1, "extracted": 2, "persisted": 1, "skipped_budget": 0}

    async def fake_sleep(interval_seconds):
        calls["slept"].append(interval_seconds)
        raise asyncio.CancelledError

    monkeypatch.setattr(main, "SessionLocal", FakeDb)
    monkeypatch.setattr(main, "TippingPointEngine", FakeTippingPointEngine)
    monkeypatch.setattr(main, "utcnow", lambda: fixed_now)
    monkeypatch.setattr(main, "refresh_market_snapshot_set", fake_refresh_market_snapshot_set)
    monkeypatch.setattr(main, "refresh_reserves_coverage", fake_refresh_reserves_coverage)
    monkeypatch.setattr(main, "run_daily_pipeline", fake_run_daily_pipeline)
    monkeypatch.setattr(main.settings, "ai_research_enabled", True)
    monkeypatch.setattr(main.asyncio, "sleep", fake_sleep)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(main._market_refresh_loop(interval_seconds=7))

    assert len(calls["market"]) == 1
    assert calls["reserves"] == 1
    assert calls["evaluated_at"] == [(fixed_now, calls["market"][0])]
    assert calls["recorded_events"] == [(["event-a", "event-b"], calls["market"][0])]
    assert calls["ai_research"] == 1
    assert calls["slept"] == [7]
    assert calls["closed"] == 1
