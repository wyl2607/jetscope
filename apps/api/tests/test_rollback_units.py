from __future__ import annotations

import importlib.util
import json
import sys
from datetime import datetime, timezone
from types import SimpleNamespace
from pathlib import Path


ROLLBACK_MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "rollback.py"


def load_rollback_module(monkeypatch):
    monkeypatch.setitem(
        sys.modules,
        "sqlalchemy",
        SimpleNamespace(create_engine=lambda *args, **kwargs: None, text=lambda sql: sql),
    )
    spec = importlib.util.spec_from_file_location("rollback_script_under_test", ROLLBACK_MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_write_rollback_flag_writes_expected_json(tmp_path, monkeypatch):
    rollback = load_rollback_module(monkeypatch)
    flag_path = tmp_path / ".rollback_flag"
    monkeypatch.setattr(rollback, "ROLLBACK_FLAG_PATH", flag_path)
    monkeypatch.setattr(rollback, "_ts", lambda: "2026-06-02T12:00:00Z")

    rollback.write_rollback_flag("postgres unavailable", dry_run=False)

    payload = json.loads(flag_path.read_text())
    assert payload["rollback"] is True
    assert payload["reason"] == "postgres unavailable"
    assert payload["timestamp"] == "2026-06-02T12:00:00Z"
    assert payload["read_postgres_pct"] == 0


def test_timestamp_uses_utc_timezone(monkeypatch):
    rollback = load_rollback_module(monkeypatch)
    value = rollback._ts()
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))

    assert value.endswith("Z")
    assert timestamp.tzinfo is timezone.utc


def test_clear_rollback_flag_removes_existing_file(tmp_path, monkeypatch):
    rollback = load_rollback_module(monkeypatch)
    flag_path = tmp_path / ".rollback_flag"
    flag_path.write_text('{"rollback": true}')
    monkeypatch.setattr(rollback, "ROLLBACK_FLAG_PATH", flag_path)

    rollback.clear_rollback_flag(dry_run=False)

    assert not flag_path.exists()


def test_rollback_success_runs_steps_in_order_without_external_io(monkeypatch):
    rollback = load_rollback_module(monkeypatch)
    calls: list[tuple[str, str | bool]] = []

    monkeypatch.setattr(rollback, "check_sqlite_health", lambda: calls.append(("health", True)) or True)
    monkeypatch.setattr(
        rollback,
        "write_rollback_flag",
        lambda reason, dry_run: calls.append(("flag", f"{reason}:{dry_run}")),
    )
    monkeypatch.setattr(
        rollback,
        "record_audit_event",
        lambda reason, dry_run: calls.append(("audit", f"{reason}:{dry_run}")),
    )
    monkeypatch.setattr(
        rollback,
        "send_alert",
        lambda message, dry_run: calls.append(("alert", dry_run)),
    )
    monkeypatch.setattr(rollback, "_ts", lambda: "2026-06-02T12:00:00Z")

    ok = rollback.rollback(reason="latency threshold exceeded", dry_run=True, force=False)

    assert ok is True
    assert calls == [
        ("health", True),
        ("flag", "latency threshold exceeded:True"),
        ("audit", "latency threshold exceeded:True"),
        ("alert", True),
    ]


def test_rollback_aborts_when_sqlite_health_fails(monkeypatch):
    rollback = load_rollback_module(monkeypatch)
    calls: list[tuple[str, str | bool]] = []

    monkeypatch.setattr(rollback, "check_sqlite_health", lambda: False)
    monkeypatch.setattr(
        rollback,
        "write_rollback_flag",
        lambda reason, dry_run: calls.append(("flag", f"{reason}:{dry_run}")),
    )
    monkeypatch.setattr(
        rollback,
        "record_audit_event",
        lambda reason, dry_run: calls.append(("audit", f"{reason}:{dry_run}")),
    )
    monkeypatch.setattr(
        rollback,
        "send_alert",
        lambda message, dry_run: calls.append(("alert", dry_run)),
    )

    ok = rollback.rollback(reason="manual test", dry_run=False, force=False)

    assert ok is False
    assert calls == [("alert", False)]
