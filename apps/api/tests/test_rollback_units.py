"""Unit tests for scripts/rollback.py — focused, offline, deterministic."""

import json
import sys
from pathlib import Path

import pytest

_API_DIR = Path(__file__).resolve().parent.parent
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from scripts.rollback import (
    _ts,
    check_sqlite_health,
    clear_rollback_flag,
    record_audit_event,
    send_alert,
    write_rollback_flag,
)


class TestTimestamp:
    def test_returns_iso_string_ending_with_z(self) -> None:
        ts = _ts()
        assert ts.endswith("Z")
        assert "T" in ts
        date_part, time_part = ts.replace("Z", "").split("T", 1)
        assert len(date_part.split("-")) == 3
        assert len(time_part.split(":")) == 3


class TestWriteRollbackFlag:
    def test_dry_run_does_not_write_file(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        flag_path = tmp_path / ".rollback_flag"
        monkeypatch.setattr("scripts.rollback.ROLLBACK_FLAG_PATH", flag_path)
        write_rollback_flag("dry test", dry_run=True)
        assert not flag_path.exists()

    def test_writes_valid_json_with_correct_fields(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        flag_path = tmp_path / ".rollback_flag"
        monkeypatch.setattr("scripts.rollback.ROLLBACK_FLAG_PATH", flag_path)
        write_rollback_flag("unit test", dry_run=False)
        assert flag_path.exists()
        data = json.loads(flag_path.read_text())
        assert data["rollback"] is True
        assert data["reason"] == "unit test"
        assert data["read_postgres_pct"] == 0
        assert data["timestamp"].endswith("Z")


class TestClearRollbackFlag:
    def test_dry_run_does_not_remove_file(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        flag_path = tmp_path / ".rollback_flag"
        flag_path.write_text("{}")
        monkeypatch.setattr("scripts.rollback.ROLLBACK_FLAG_PATH", flag_path)
        clear_rollback_flag(dry_run=True)
        assert flag_path.exists()

    def test_removes_existing_file(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        flag_path = tmp_path / ".rollback_flag"
        flag_path.write_text("{}")
        monkeypatch.setattr("scripts.rollback.ROLLBACK_FLAG_PATH", flag_path)
        clear_rollback_flag(dry_run=False)
        assert not flag_path.exists()

    def test_no_file_does_not_raise(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        flag_path = tmp_path / ".rollback_flag"
        assert not flag_path.exists()
        monkeypatch.setattr("scripts.rollback.ROLLBACK_FLAG_PATH", flag_path)
        clear_rollback_flag(dry_run=False)


class TestSendAlert:
    def test_without_webhook_prints_to_stderr(self, capsys: pytest.CaptureFixture, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("scripts.rollback.SLACK_WEBHOOK_URL", "")
        send_alert("test alert message", dry_run=False)
        captured = capsys.readouterr()
        assert "test alert message" in captured.err
        assert "ALERT" in captured.err

    def test_prints_even_in_dry_run(self, capsys: pytest.CaptureFixture, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("scripts.rollback.SLACK_WEBHOOK_URL", "")
        send_alert("dry run alert", dry_run=True)
        captured = capsys.readouterr()
        assert "dry run alert" in captured.err


class TestRecordAuditEvent:
    def test_dry_run_does_not_create_engine(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls: list = []
        monkeypatch.setattr("scripts.rollback.sa.create_engine", lambda *a, **kw: calls.append(True))
        record_audit_event("test", dry_run=True)
        assert calls == []

    def test_live_attempts_create_engine(self, monkeypatch: pytest.MonkeyPatch) -> None:
        engines: list = []
        monkeypatch.setattr("scripts.rollback.sa.create_engine", lambda *a, **kw: engines.append(a))
        record_audit_event("test", dry_run=False)
        assert len(engines) >= 1


class TestCheckSqliteHealth:
    def test_in_memory_sqlite_returns_true(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr("scripts.rollback.SQLITE_URL", "sqlite://")
        assert check_sqlite_health() is True
