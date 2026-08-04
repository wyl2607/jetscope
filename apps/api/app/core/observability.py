"""Optional production observability: structured JSON logs and error tracking.

Both are opt-in and off by default, so local development and tests keep the
plain uvicorn/root logging behaviour unless explicitly enabled:

  * JETSCOPE_JSON_LOGS=1   -> emit app logs as one JSON object per line
  * JETSCOPE_SENTRY_DSN=... -> initialise Sentry error tracking (requires the
                               optional `sentry-sdk` package to be installed)
"""

import json
import logging
from datetime import datetime, timezone
from logging.config import fileConfig

from app.core.config import settings


class JsonLogFormatter(logging.Formatter):
    """Render a log record as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _configure_json_logging() -> None:
    if not settings.json_logs:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    root = logging.getLogger()
    # Replace root handlers so app logs are not emitted twice (plain + JSON).
    # uvicorn's own loggers don't propagate to root, so their format is untouched.
    root.handlers = [handler]
    if root.level == logging.NOTSET or root.level > logging.INFO:
        root.setLevel(logging.INFO)


def _configure_sentry() -> None:
    dsn = settings.sentry_dsn.strip()
    if not dsn:
        return
    try:
        import sentry_sdk
    except ImportError:
        logging.getLogger("jetscope.observability").warning(
            "JETSCOPE_SENTRY_DSN is set but sentry-sdk is not installed; error tracking disabled"
        )
        return
    sentry_sdk.init(dsn=dsn, environment=settings.app_env)


def configure_alembic_logging(config_file_name: str | None) -> None:
    """Apply Alembic's logging config without disabling the app's own loggers.

    Migrations run in-process during FastAPI startup, so ``fileConfig``'s default
    of ``disable_existing_loggers=True`` would permanently disable every logger
    created at import time -- dropping even ERROR records from the market refresh
    loop. uvicorn passes the same flag for the same reason.
    """
    if config_file_name is None:
        return
    fileConfig(config_file_name, disable_existing_loggers=False)


def configure_logging() -> None:
    """Apply the app's log configuration. Safe to re-apply after Alembic runs."""
    _configure_json_logging()


def configure_observability() -> None:
    """Set up structured logging and error tracking based on settings. No-op by default."""
    configure_logging()
    _configure_sentry()
