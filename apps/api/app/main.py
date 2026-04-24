import asyncio
import contextlib
import logging
from datetime import timedelta

from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import settings
from app.db.bootstrap import apply_schema_bootstrap
from app.db.session import SessionLocal, engine
from app.services.market import refresh_market_snapshot_set
from app.services.analysis.tipping_point import TippingPointEngine
from app.services.bootstrap import utcnow
from app.services.reserves import refresh_reserves_coverage

logger = logging.getLogger("safvsoil.market_refresh")
tipping_logger = logging.getLogger("safvsoil.tipping_point")
reserves_logger = logging.getLogger("jetscope.reserves_refresh")

TIPPING_EVALUATION_INTERVAL = timedelta(minutes=15)
RESERVES_REFRESH_INTERVAL = timedelta(hours=24)


async def _market_refresh_loop(interval_seconds: int) -> None:
    consecutive_failures = 0
    tipping_engine = TippingPointEngine()
    next_tipping_eval_at = utcnow()
    next_reserves_refresh_at = utcnow()
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

            now = utcnow()
            if now >= next_reserves_refresh_at:
                try:
                    inserted = refresh_reserves_coverage(db)
                    reserves_logger.info(
                        "reserves_refresh_cycle inserted=%s next_in_seconds=%s",
                        inserted,
                        int(RESERVES_REFRESH_INTERVAL.total_seconds()),
                    )
                except Exception:
                    reserves_logger.exception("reserves_refresh_cycle_failed")
                next_reserves_refresh_at = now + RESERVES_REFRESH_INTERVAL

            if now >= next_tipping_eval_at:
                events = tipping_engine.evaluate(now=now, db=db)
                tipping_engine.record_events(events, db)
                tipping_logger.info(
                    "tipping_point_cycle events=%s next_in_seconds=%s",
                    len(events),
                    int(TIPPING_EVALUATION_INTERVAL.total_seconds()),
                )
                next_tipping_eval_at = now + TIPPING_EVALUATION_INTERVAL
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
        title="JetScope API",
        version="0.1.0",
        description="Aviation fuel transition intelligence API",
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
