"""
migration_check.py — Data Contract v1 対账脚本

对比 PostgreSQL 与 SQLite 中 7 张数据契约表的行数、均值、置信度。
支持三个阶段的严格度:
  --phase 1  宽松 (允许行数差 < 10)
  --phase 2  中等 (行数必须一致, confidence 差 < 0.01)
  --phase 3  严格 (行数、confidence、null 率三项全严格)

用法:
  python apps/api/scripts/migration_check.py [--phase N] [--strict] [--report]
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import sys
from typing import Any

# ---------------------------------------------------------------------------
# 依赖: SQLAlchemy 2.x (已在 requirements.txt)
# ---------------------------------------------------------------------------
try:
    import sqlalchemy as sa
    from sqlalchemy import text
except ImportError:
    print("ERROR: sqlalchemy not found. Run: pip install sqlalchemy psycopg[binary] aiosqlite")
    sys.exit(1)

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
POSTGRES_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://safvsoil:safvsoil@localhost:5432/safvsoil",
)
SQLITE_URL = os.getenv(
    "SQLITE_URL",
    f"sqlite:///{os.path.join(os.path.dirname(__file__), '../../data/safvsoil.db')}",
)

# 对账表清单 (表名 → 唯一键列名)
CONTRACT_TABLES: dict[str, str] = {
    "market_prices":        "recorded_date",
    "carbon_intensities":   "recorded_datetime",
    "germany_premiums":     "policy_date",
    "rotterdam_emissions":  "recorded_date",
    "eu_ets_volumes":       "trading_date",
    "data_freshness":       "metric_name",
    "source_status":        "source_name",
}

# 有 confidence 列的表
CONFIDENCE_TABLES = {
    "market_prices",
    "carbon_intensities",
    "germany_premiums",
    "rotterdam_emissions",
    "eu_ets_volumes",
    "source_status",
}


# ---------------------------------------------------------------------------
# 对账逻辑
# ---------------------------------------------------------------------------

def get_engine(url: str) -> sa.Engine:
    return sa.create_engine(url, future=True)


def table_exists(conn: sa.Connection, table: str) -> bool:
    try:
        conn.execute(text(f"SELECT 1 FROM {table} LIMIT 1"))
        return True
    except Exception:
        return False


def get_row_count(conn: sa.Connection, table: str) -> int:
    row = conn.execute(text(f"SELECT count(*) FROM {table}")).fetchone()
    return int(row[0]) if row else 0


def get_confidence_avg(conn: sa.Connection, table: str) -> float | None:
    if table not in CONFIDENCE_TABLES:
        return None
    try:
        row = conn.execute(text(f"SELECT avg(confidence) FROM {table}")).fetchone()
        return float(row[0]) if row and row[0] is not None else None
    except Exception:
        return None


def get_null_rate(conn: sa.Connection, table: str, col: str) -> float:
    """Fraction of NULL values in `col`."""
    try:
        row = conn.execute(
            text(f"SELECT count(*), sum(CASE WHEN {col} IS NULL THEN 1 ELSE 0 END) FROM {table}")
        ).fetchone()
        total, nulls = int(row[0]), int(row[1] or 0)
        return nulls / total if total > 0 else 0.0
    except Exception:
        return 0.0


def check_table(
    pg_conn: sa.Connection,
    sq_conn: sa.Connection,
    table: str,
    phase: int,
    strict: bool,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "table": table,
        "ok": True,
        "issues": [],
        "pg_rows": 0,
        "sq_rows": 0,
        "pg_confidence_avg": None,
        "sq_confidence_avg": None,
    }

    # 表是否存在
    pg_exists = table_exists(pg_conn, table)
    sq_exists = table_exists(sq_conn, table)
    if not pg_exists:
        result["issues"].append(f"Table '{table}' missing in Postgres")
        result["ok"] = False
    if not sq_exists:
        result["issues"].append(f"Table '{table}' missing in SQLite")
        # SQLite 缺表不一定是错误 (Phase 3 后 SQLite 可能已归档)
        if phase < 3:
            result["ok"] = False
    if not pg_exists or not sq_exists:
        return result

    # 行数对比
    pg_rows = get_row_count(pg_conn, table)
    sq_rows = get_row_count(sq_conn, table)
    result["pg_rows"] = pg_rows
    result["sq_rows"] = sq_rows
    row_diff = abs(pg_rows - sq_rows)

    phase_tolerance = {1: 10, 2: 0, 3: 0}
    tolerance = 0 if strict else phase_tolerance.get(phase, 0)
    if row_diff > tolerance:
        result["issues"].append(
            f"Row count mismatch: pg={pg_rows} sq={sq_rows} diff={row_diff} (tolerance={tolerance})"
        )
        result["ok"] = False

    # Confidence 对比
    pg_conf = get_confidence_avg(pg_conn, table)
    sq_conf = get_confidence_avg(sq_conn, table)
    result["pg_confidence_avg"] = pg_conf
    result["sq_confidence_avg"] = sq_conf
    if pg_conf is not None and sq_conf is not None:
        conf_threshold = 0.001 if (strict or phase >= 2) else 0.05
        conf_diff = abs(pg_conf - sq_conf)
        if conf_diff > conf_threshold:
            result["issues"].append(
                f"Confidence drift: pg={pg_conf:.4f} sq={sq_conf:.4f} diff={conf_diff:.4f} (threshold={conf_threshold})"
            )
            result["ok"] = False

    # Phase 3 严格: null 率检查 (confidence 列)
    if (strict or phase == 3) and table in CONFIDENCE_TABLES:
        null_rate = get_null_rate(pg_conn, table, "confidence")
        if null_rate > 0.05:
            result["issues"].append(
                f"High NULL rate in confidence: {null_rate:.1%} (threshold=5%)"
            )
            result["ok"] = False

    return result


def run_check(phase: int, strict: bool, report: bool) -> bool:
    print(f"\n{'='*60}")
    print(f" Migration Check — Phase {phase} {'[STRICT]' if strict else ''}")
    print(f" {datetime.datetime.now().isoformat()}")
    print(f"{'='*60}")

    try:
        pg_engine = get_engine(POSTGRES_URL)
        sq_engine = get_engine(SQLITE_URL)
    except Exception as e:
        print(f"ERROR: Cannot create engines: {e}")
        return False

    results: list[dict[str, Any]] = []
    all_ok = True

    try:
        with pg_engine.connect() as pg_conn, sq_engine.connect() as sq_conn:
            for table in CONTRACT_TABLES:
                r = check_table(pg_conn, sq_conn, table, phase, strict)
                results.append(r)
                status = "✅" if r["ok"] else "❌"
                print(
                    f"  {status} {table:<30} pg={r['pg_rows']:>6} sq={r['sq_rows']:>6}"
                    + (f" conf_pg={r['pg_confidence_avg']:.3f}" if r["pg_confidence_avg"] is not None else "")
                )
                if r["issues"]:
                    for issue in r["issues"]:
                        print(f"       ⚠  {issue}")
                    all_ok = False
    except Exception as e:
        print(f"ERROR: Database connection failed: {e}")
        return False

    print(f"\n{'='*60}")
    print(f" Overall: {'✅ PASS' if all_ok else '❌ FAIL'}")
    print(f"{'='*60}\n")

    if report:
        report_path = os.path.join(
            os.path.dirname(__file__),
            f"migration_check_phase{phase}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
        )
        with open(report_path, "w") as f:
            json.dump(
                {
                    "phase": phase,
                    "strict": strict,
                    "timestamp": datetime.datetime.now().isoformat(),
                    "overall_ok": all_ok,
                    "tables": results,
                },
                f,
                indent=2,
                default=str,
            )
        print(f"Report saved: {report_path}")

    return all_ok


def main() -> None:
    parser = argparse.ArgumentParser(description="SAFvsOil migration data reconciliation check")
    parser.add_argument("--phase", type=int, choices=[1, 2, 3], default=1, help="Migration phase (1-3)")
    parser.add_argument("--strict", action="store_true", help="Use strictest tolerances regardless of phase")
    parser.add_argument("--report", action="store_true", help="Save JSON report file")
    args = parser.parse_args()

    ok = run_check(phase=args.phase, strict=args.strict, report=args.report)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
