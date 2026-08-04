"""Running migrations in-process must not destroy the app's logging setup.

``app.db.bootstrap.apply_schema_bootstrap`` runs Alembic inside the API process
during FastAPI startup. Alembic's ``env.py`` applies ``alembic.ini`` via
``logging.config.fileConfig``, which by default disables every logger that was
already created at import time -- silencing the refresh loop's error reporting.
"""

from __future__ import annotations

import logging
from logging.config import fileConfig
from pathlib import Path

import pytest

from app.core.observability import configure_alembic_logging, configure_logging

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


@pytest.fixture(autouse=True)
def restore_logging():
    """Snapshot global logging state so these tests cannot leak into others."""
    root = logging.getLogger()
    prev_level = root.level
    prev_handlers = list(root.handlers)
    prev_disabled = {
        name: lg.disabled
        for name, lg in logging.root.manager.loggerDict.items()
        if isinstance(lg, logging.Logger)
    }
    yield
    root.setLevel(prev_level)
    root.handlers = prev_handlers
    for name, disabled in prev_disabled.items():
        lg = logging.root.manager.loggerDict.get(name)
        if isinstance(lg, logging.Logger):
            lg.disabled = disabled


def test_raw_fileconfig_disables_existing_loggers():
    """Guard the assumption this fix rests on: the stdlib default is destructive."""
    logger = logging.getLogger("app.test_raw_fileconfig")
    assert not logger.disabled

    fileConfig(str(ALEMBIC_INI))

    assert logger.disabled is True


def test_configure_alembic_logging_keeps_existing_loggers_enabled():
    logger = logging.getLogger("app.test_alembic_logging")
    assert not logger.disabled

    configure_alembic_logging(str(ALEMBIC_INI))

    assert logger.disabled is False


def test_configure_alembic_logging_still_reports_errors():
    """The regression that matters: refresh-loop failures must reach the logs.

    ``caplog`` is unusable here because ``fileConfig`` replaces the root
    handlers pytest installs, so attach a handler after configuring instead.
    """
    logger = logging.getLogger("app.test_alembic_logging_errors")

    configure_alembic_logging(str(ALEMBIC_INI))

    records: list[logging.LogRecord] = []

    class Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = Capture()
    logging.getLogger().addHandler(handler)
    try:
        logger.error("market_refresh_cycle_failed")
    finally:
        logging.getLogger().removeHandler(handler)

    assert [r.getMessage() for r in records] == ["market_refresh_cycle_failed"]


def test_configure_alembic_logging_noop_without_config_file():
    logger = logging.getLogger("app.test_alembic_logging_noop")
    configure_alembic_logging(None)
    assert logger.disabled is False


def test_configure_logging_reasserts_app_level_after_alembic(monkeypatch):
    """Alembic pins root to WARN; re-applying app logging must win."""
    monkeypatch.setattr("app.core.observability.settings.json_logs", True)

    configure_alembic_logging(str(ALEMBIC_INI))
    assert logging.getLogger().level == logging.WARNING

    configure_logging()

    assert logging.getLogger().level == logging.INFO
