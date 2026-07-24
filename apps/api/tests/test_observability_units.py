"""Focused unit tests for app.core.observability (opt-in JSON logs + Sentry)."""

from __future__ import annotations

import json
import logging

import pytest

from app.core import observability
from app.core.observability import JsonLogFormatter


def test_json_formatter_emits_parseable_json():
    record = logging.LogRecord("jetscope.test", logging.INFO, __file__, 1, "hello %s", ("world",), None)
    payload = json.loads(JsonLogFormatter().format(record))
    assert payload["level"] == "INFO"
    assert payload["logger"] == "jetscope.test"
    assert payload["message"] == "hello world"
    assert "ts" in payload


def test_configure_observability_noop_when_disabled(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(observability.settings, "json_logs", False)
    monkeypatch.setattr(observability.settings, "sentry_dsn", "")
    root = logging.getLogger()
    before = list(root.handlers)
    observability.configure_observability()
    assert list(root.handlers) == before


def test_json_logging_installs_single_json_handler(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(observability.settings, "json_logs", True)
    monkeypatch.setattr(observability.settings, "sentry_dsn", "")
    root = logging.getLogger()
    saved_handlers = list(root.handlers)
    saved_level = root.level
    try:
        observability.configure_observability()
        assert len(root.handlers) == 1
        assert isinstance(root.handlers[0].formatter, JsonLogFormatter)
    finally:
        root.handlers = saved_handlers
        root.setLevel(saved_level)


def test_sentry_is_noop_when_dsn_empty(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(observability.settings, "sentry_dsn", "  ")
    # Empty/whitespace DSN must not attempt to import or initialise Sentry.
    observability._configure_sentry()
