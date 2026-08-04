import asyncio
import threading
from contextlib import suppress
from datetime import datetime, timezone

from app import main


def test_market_refresh_loop_offloads_blocking_maintenance(monkeypatch):
    called = threading.Event()
    worker_thread_id: dict[str, int] = {}
    loop_thread_id: dict[str, int] = {}

    def fake_cycle(*args):
        worker_thread_id["value"] = threading.get_ident()
        called.set()
        return (
            datetime.now(timezone.utc),
            "degraded",
            args[1],
            args[2],
            args[3],
        )

    monkeypatch.setattr(main, "_run_background_maintenance_cycle", fake_cycle)

    async def exercise_loop() -> None:
        loop_thread_id["value"] = threading.get_ident()
        task = asyncio.create_task(main._market_refresh_loop(3600))
        try:
            await asyncio.to_thread(called.wait, 1.0)
            assert called.is_set()
            assert worker_thread_id["value"] != loop_thread_id["value"]
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    asyncio.run(exercise_loop())
