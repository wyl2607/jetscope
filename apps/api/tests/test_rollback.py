from types import SimpleNamespace
from unittest.mock import patch

from scripts import rollback as rollback_module


def test_rollback_aborts_when_sqlite_health_fails():
    with (
        patch.object(rollback_module, "check_sqlite_health", return_value=False) as check_sqlite,
        patch.object(rollback_module, "send_alert") as send_alert,
        patch.object(rollback_module, "write_rollback_flag") as write_flag,
        patch.object(rollback_module, "record_audit_event") as record_audit,
    ):
        result = rollback_module.rollback("sqlite unavailable", dry_run=True, force=False)

    assert result is False
    check_sqlite.assert_called_once_with()
    send_alert.assert_called_once()
    write_flag.assert_not_called()
    record_audit.assert_not_called()


def test_rollback_force_skips_sqlite_health_check():
    with (
        patch.object(rollback_module, "check_sqlite_health") as check_sqlite,
        patch.object(rollback_module, "write_rollback_flag") as write_flag,
        patch.object(rollback_module, "record_audit_event") as record_audit,
        patch.object(rollback_module, "send_alert") as send_alert,
    ):
        result = rollback_module.rollback("operator override", dry_run=True, force=True)

    assert result is True
    check_sqlite.assert_not_called()
    write_flag.assert_called_once_with("operator override", True)
    record_audit.assert_called_once_with("operator override", True)
    send_alert.assert_called_once()


def test_rollback_with_healthy_sqlite_runs_actions():
    with (
        patch.object(rollback_module, "check_sqlite_health", return_value=True) as check_sqlite,
        patch.object(rollback_module, "write_rollback_flag") as write_flag,
        patch.object(rollback_module, "record_audit_event") as record_audit,
        patch.object(rollback_module, "send_alert") as send_alert,
    ):
        result = rollback_module.rollback("manual rollback", dry_run=False, force=False)

    assert result is True
    check_sqlite.assert_called_once_with()
    write_flag.assert_called_once_with("manual rollback", False)
    record_audit.assert_called_once_with("manual rollback", False)
    send_alert.assert_called_once()


def test_auto_check_rolls_back_when_postgres_unhealthy():
    with (
        patch.object(rollback_module, "check_postgres_health", return_value=False),
        patch.object(rollback_module, "rollback") as rollback,
    ):
        rollback_module.auto_rollback_check(dry_run=True)

    rollback.assert_called_once_with(
        reason="Postgres health check failed (auto-detect)",
        dry_run=True,
        force=False,
    )


def test_auto_check_rolls_back_when_migration_check_fails():
    failed_check = SimpleNamespace(returncode=1, stdout="prefix" + ("x" * 600))

    with (
        patch.object(rollback_module, "check_postgres_health", return_value=True),
        patch("subprocess.run", return_value=failed_check) as run_check,
        patch.object(rollback_module, "rollback") as rollback,
    ):
        rollback_module.auto_rollback_check(dry_run=False)

    run_check.assert_called_once()
    reason = rollback.call_args.kwargs["reason"]
    assert reason.startswith("migration_check.py failed:")
    assert reason.endswith("x" * 500)
    rollback.assert_called_once_with(reason=reason, dry_run=False, force=False)
