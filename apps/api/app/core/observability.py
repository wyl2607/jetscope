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


def configure_observability() -> None:
    """Set up structured logging and error tracking based on settings. No-op by default."""
    _configure_json_logging()
    _configure_sentry()
