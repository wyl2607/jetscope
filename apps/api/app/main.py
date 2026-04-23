import asyncio
import contextlib
import logging

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings
from app.db.bootstrap import apply_schema_bootstrap
from app.db.session import SessionLocal, engine
from app.services.market import refresh_market_snapshot_set

logger = logging.getLogger("safvsoil.market_refresh")


async def _market_refresh_loop(interval_seconds: int) -> None:
    consecutive_failures = 0
    while True:
        db = SessionLocal()
        try:
            refreshed_at, status = refresh_market_snapshot_set(db)
            consecutive_failures = 0
            logger.info(
                "market_refresh_cycle status=%s refreshed_at=%s interval_seconds=%s",
                status,
                refreshed_at.isoformat(),
                interval_seconds,
            )
        except Exception:
            consecutive_failures += 1
            logger.exception(
                "market_refresh_cycle_failed consecutive_failures=%s interval_seconds=%s",
                consecutive_failures,
                interval_seconds,
            )
        finally:
            db.close()
        await asyncio.sleep(interval_seconds)


def create_app() -> FastAPI:
    app = FastAPI(
        title="SAFvsOil API",
        version="0.1.0",
        description="Product scaffold for SAF vs Oil data, scenarios, and assumptions.",
    )
    app.include_router(api_router, prefix=settings.api_prefix)
    app.state.market_refresh_task = None

    @app.on_event("startup")
    async def init_db() -> None:
        # Import models so metadata/registries are available to whichever bootstrap mode runs.
        from app import models  # noqa: F401

        bootstrap_mode = apply_schema_bootstrap(engine)
        logger.info("schema_bootstrap_mode_applied mode=%s", bootstrap_mode)
        if settings.market_refresh_interval_seconds > 0:
            app.state.market_refresh_task = asyncio.create_task(
                _market_refresh_loop(settings.market_refresh_interval_seconds)
            )

    @app.on_event("shutdown")
    async def stop_market_loop() -> None:
        task = app.state.market_refresh_task
        if task is not None:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    return app


app = create_app()
