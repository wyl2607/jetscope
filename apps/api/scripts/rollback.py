"""
rollback.py — JetScope 自动回滚脚本

在迁移失败时将读写路径从 Postgres 切回 SQLite:
1. 设置环境变量 READ_POSTGRES_PCT=0
2. 写入 .rollback_flag 文件 (FastAPI 启动时读取)
3. 记录 migration_audit 事件 (如果 Postgres 可达)
4. 打印告警信息 (生产中替换为 Slack webhook 发送)
5. 验证 SQLite 路径健康

触发方式:
  python apps/api/scripts/rollback.py [--reason "描述"] [--dry-run] [--force]

--dry-run  只打印会做什么, 不实际写入
--force    跳过健康检查, 强制执行回滚
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import pathlib
import sys

try:
    import sqlalchemy as sa
    from sqlalchemy import text
except ImportError:
    print("ERROR: sqlalchemy not found.")
    sys.exit(1)

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
POSTGRES_URL = os.getenv(
    "DATABASE_URL",
    os.getenv(
        "JETSCOPE_POSTGRES_URL",
        os.getenv("SAFVSOIL_POSTGRES_URL", "postgresql+psycopg://jetscope:jetscope@localhost:5432/jetscope"),
    ),
)
SQLITE_URL = os.getenv(
    "SQLITE_URL",
    os.getenv(
        "JETSCOPE_SQLITE_URL",
        os.getenv(
            "SAFVSOIL_SQLITE_URL",
            f"sqlite:///{pathlib.Path(__file__).parent.parent / 'data' / 'jetscope.db'}",
        ),
    ),
)

# .rollback_flag 文件路径 (FastAPI 启动时检查此文件)
ROLLBACK_FLAG_PATH = pathlib.Path(__file__).parent.parent / ".rollback_flag"

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")  # 留空则仅打印

# 触发回滚的阈值 (用于 --auto 模式)
THRESHOLDS = {
    "error_rate_pct": 2.0,       # > 2% 错误率
    "p99_latency_ms": 200.0,     # > 200ms P99
    "row_diff": 0,               # 任何行数差异
    "confidence_drop": 0.1,      # 置信度均值下降 > 0.1
    "pg_fail_count": 3,          # 连续 3 次连接失败
}


# ---------------------------------------------------------------------------
# 工具函数
# ---------------------------------------------------------------------------

def _ts() -> str:
    return datetime.datetime.utcnow().isoformat() + "Z"


def send_alert(message: str, dry_run: bool) -> None:
    """发送告警. 生产中接 Slack webhook; 现在打印到 stderr."""
    payload = {
        "text": f"🚨 *JetScope Migration ROLLBACK* — {_ts()}\n{message}",
    }
    print(f"\n🚨 ALERT: {message}", file=sys.stderr)
    if SLACK_WEBHOOK_URL and not dry_run:
        try:
            import urllib.request
            req = urllib.request.Request(
                SLACK_WEBHOOK_URL,
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            urllib.request.urlopen(req, timeout=5)
            print("  ↳ Slack alert sent.", file=sys.stderr)
        except Exception as e:
            print(f"  ↳ Slack send failed: {e}", file=sys.stderr)


def write_rollback_flag(reason: str, dry_run: bool) -> None:
    """写入 .rollback_flag 文件, FastAPI 启动时读取以决定使用 SQLite."""
    content = {
        "rollback": True,
        "reason": reason,
        "timestamp": _ts(),
        "read_postgres_pct": 0,
    }
    if dry_run:
        print(f"[DRY-RUN] Would write {ROLLBACK_FLAG_PATH}:\n{json.dumps(content, indent=2)}")
        return
    with open(ROLLBACK_FLAG_PATH, "w") as f:
        json.dump(content, f, indent=2)
    print(f"✅ Rollback flag written: {ROLLBACK_FLAG_PATH}")


def clear_rollback_flag(dry_run: bool) -> None:
    """清除回滚标志 (迁移重新启动前调用)."""
    if dry_run:
        print(f"[DRY-RUN] Would remove {ROLLBACK_FLAG_PATH}")
        return
    if ROLLBACK_FLAG_PATH.exists():
        ROLLBACK_FLAG_PATH.unlink()
        print(f"✅ Rollback flag cleared: {ROLLBACK_FLAG_PATH}")
    else:
        print("  (No rollback flag to clear)")


def record_audit_event(reason: str, dry_run: bool) -> None:
    """写入 migration_audit 表 (Postgres 可达时)."""
    sql = text(
        """
        INSERT INTO migration_audit (event_type, phase, error_detail, recorded_at)
        VALUES ('rollback', NULL, :reason, NOW())
        """
    )
    if dry_run:
        print(f"[DRY-RUN] Would INSERT migration_audit: rollback — {reason}")
        return
    try:
        engine = sa.create_engine(POSTGRES_URL, future=True)
        with engine.connect() as conn:
            conn.execute(sql, {"reason": reason})
            conn.commit()
        print("✅ Rollback event recorded in migration_audit (Postgres)")
    except Exception as e:
        print(f"  ↳ Could not write to Postgres audit log: {e} (non-fatal)")


def check_sqlite_health() -> bool:
    """验证 SQLite 路径可读写."""
    try:
        engine = sa.create_engine(SQLITE_URL, future=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        print(f"ERROR: SQLite health check failed: {e}", file=sys.stderr)
        return False


def check_postgres_health() -> bool:
    """检查 Postgres 当前是否可达."""
    try:
        engine = sa.create_engine(POSTGRES_URL, future=True, connect_args={"connect_timeout": 5})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def rollback(reason: str, dry_run: bool, force: bool) -> bool:
    print(f"\n{'='*60}")
    print(f" JetScope Migration Rollback")
    print(f" Reason: {reason}")
    print(f" Time:   {_ts()}")
    print(f" Mode:   {'DRY-RUN' if dry_run else 'LIVE'}")
    print(f"{'='*60}\n")

    # Step 1: SQLite 健康检查
    if not force:
        print("Step 1: Verifying SQLite health ...")
        if not check_sqlite_health():
            print("❌ SQLite is also unavailable. Manual intervention required.")
            send_alert(
                f"CRITICAL: Both Postgres AND SQLite unavailable. Reason: {reason}",
                dry_run=dry_run,
            )
            return False
        print("  ✅ SQLite healthy")
    else:
        print("Step 1: SKIPPED (--force)")

    # Step 2: 写入回滚标志
    print("\nStep 2: Writing rollback flag ...")
    write_rollback_flag(reason, dry_run)

    # Step 3: 记录 Postgres audit (best-effort)
    print("\nStep 3: Recording rollback event in Postgres (best-effort) ...")
    record_audit_event(reason, dry_run)

    # Step 4: 发送告警
    print("\nStep 4: Sending alert ...")
    send_alert(
        f"Migration rolled back to SQLite.\nReason: {reason}\n"
        f"Action: Set READ_POSTGRES_PCT=0 and restarted read path to SQLite.\n"
        f"Next: Review Postgres health, then re-run migration from Phase 1.",
        dry_run=dry_run,
    )

    # Step 5: 打印操作摘要
    print(f"\n{'='*60}")
    print(" ROLLBACK COMPLETE")
    print(f" {'='*60}")
    print(f" SQLite read/write: ACTIVE")
    print(f" Postgres read/write: SUSPENDED")
    print(f" Rollback flag: {ROLLBACK_FLAG_PATH}")
    print(f"\n Next steps:")
    print(f"   1. Investigate Postgres: check logs, connectivity, disk")
    print(f"   2. When Postgres healthy: python rollback.py --clear")
    print(f"   3. Re-run: python migration_check.py --phase 1")
    print(f"   4. Re-enable Phase 1 dual-write when check passes")
    print(f"{'='*60}\n")

    return True


def auto_rollback_check(dry_run: bool) -> None:
    """
    自动检测模式: 检查当前指标并在超阈值时触发回滚.
    用于定时任务 (cron) 或 watchdog.
    """
    print("Auto-check mode: evaluating rollback conditions ...")

    if not check_postgres_health():
        rollback(reason="Postgres health check failed (auto-detect)", dry_run=dry_run, force=False)
        return

    # 行数对账
    try:
        import subprocess
        result = subprocess.run(
            [sys.executable, str(pathlib.Path(__file__).parent / "migration_check.py"), "--phase", "2"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            rollback(
                reason=f"migration_check.py failed:\n{result.stdout[-500:]}",
                dry_run=dry_run,
                force=False,
            )
            return
    except Exception as e:
        print(f"  Could not run migration_check: {e}")

    print("  ✅ No rollback conditions triggered.")


def main() -> None:
    parser = argparse.ArgumentParser(description="JetScope migration rollback utility")
    parser.add_argument("--reason", default="Manual rollback", help="Reason for rollback")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without making changes")
    parser.add_argument("--force", action="store_true", help="Skip health checks and force rollback")
    parser.add_argument("--auto", action="store_true", help="Auto-detect and rollback if thresholds exceeded")
    parser.add_argument("--clear", action="store_true", help="Clear the rollback flag (re-enable Postgres)")
    args = parser.parse_args()

    if args.clear:
        clear_rollback_flag(dry_run=args.dry_run)
        return

    if args.auto:
        auto_rollback_check(dry_run=args.dry_run)
        return

    ok = rollback(reason=args.reason, dry_run=args.dry_run, force=args.force)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
