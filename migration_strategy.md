# Migration Strategy — PostgreSQL vs SQLite

> **决策日期**: 2026-04-22  
> **决策者**: Codex (架构师), Lane D (数据)  
> **状态**: ✅ APPROVED — 立即执行  
> **关联**: DATA_CONTRACT_V1.md v1.0.0, 7-DAY_DATA_RELIABILITY_SPRINT.md

---

## 1. 最终技术决策

### 生产主路径: PostgreSQL ✅

**理由**:
- 连接池支持 (psycopg3 + SQLAlchemy 2.0 AsyncEngine) — 3 节点集群共享连接池
- 行级锁 + MVCC — 并发写入安全 (多节点 scheduler 不冲突)
- CHECK 约束严格执行 — confidence [0.0,1.0] 在 DB 层强保证
- 原生 TIMESTAMPTZ — 消除时区歧义
- pg_stat_statements — query plan 可观测
- 已有 psycopg[binary]==3.2.13 在 requirements.txt

**风险**:

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 网络分区 (Postgres 不可达) | 中 | HIGH | 自动回源 SQLite (见第 6 节) |
| 连接池耗尽 (30 总连接) | 低 | MEDIUM | pool_size=8, max_overflow=2 per node |
| 时序数据膨胀 | 低 | MEDIUM | 按月分区 + 归档策略 (v1.1.0) |
| 性能回归 vs SQLite | 低 | LOW | 有连接池后本地 P99 < 20ms |

### 开发本地路径: SQLite ✅

**理由**:
- 零依赖 (Python 内置 sqlite3 + aiosqlite==0.19.0)
- 本地开发无需 docker-compose postgres
- 单文件数据库, 便于 CI/CD 测试隔离
- 已有 `apps/api/app/db/sqlite.py` + `migrations/001_init_sqlite_schema.sql`

**约束**:
- 仅用于本地开发和单元测试
- 不得用于生产集群节点
- 迁移期间作为 Phase 1 并行写入目标和 Phase 3 回滚目标

---

## 2. 三阶段迁移计划

```
Phase 1 (并行写入)    Phase 2 (灰度读取)    Phase 3 (验证完成)
[Day 1 - Day 14]      [Day 15 - Day 21]     [Day 22 - Day 24]
     ↓                        ↓                     ↓
 Postgres + SQLite       10%→50%→100%          回源验证
 双写, 以 SQLite         读流量切换             清理 SQLite 写路径
 为读真源               到 Postgres
```

### Phase 1: 并行写入 (最多 2 周)

**目标**: Postgres 追上 SQLite 的历史数据，同时双写保持同步。

**步骤**:

1. **历史数据回填** (Day 1):
```sql
-- 从 SQLite 导出
.output /tmp/market_prices.csv
.mode csv
.headers on
SELECT recorded_date, price_eur, source, confidence, freshness_minutes, error_code, created_at
FROM market_prices ORDER BY recorded_date;

-- 导入 Postgres
COPY market_prices (recorded_date, price_eur, source, confidence, freshness_minutes, error_code, created_at)
FROM '/tmp/market_prices.csv' CSV HEADER ON CONFLICT (recorded_date) DO NOTHING;
```

2. **双写启用** (在 `app/services/market.py` 中):
```python
# 在 write_metric() 中双写
async def write_metric(metric: str, data: dict, db_sqlite, db_postgres):
    await _write(db_sqlite, metric, data)    # 主写 (Phase 1 读仍用 SQLite)
    await _write(db_postgres, metric, data)  # 副写 (Phase 1 验证用)
```

3. **对账检查** (每日运行):
```bash
python apps/api/scripts/migration_check.py --phase 1
```

4. **结束条件**: 连续 3 天对账结果行数差 = 0, confidence 均值差 < 0.001。

---

### Phase 2: 灰度读取 (最多 1 周)

**目标**: 逐步将读流量从 SQLite 切换到 Postgres，验证无功能回归。

**流量切换规则** (通过环境变量控制):

```bash
# 10% 读 Postgres (Day 15)
READ_POSTGRES_PCT=10 uvicorn app.main:app

# 50% 读 Postgres (Day 17, 如果 Day 15-16 无告警)
READ_POSTGRES_PCT=50 uvicorn app.main:app

# 100% 读 Postgres (Day 19)
READ_POSTGRES_PCT=100 uvicorn app.main:app
```

**实现** (在 `app/db/session.py` 中):

```python
import random, os

def get_read_db():
    """灰度: READ_POSTGRES_PCT% 概率返回 Postgres session."""
    pct = int(os.getenv("READ_POSTGRES_PCT", "0"))
    if random.randint(1, 100) <= pct:
        yield from get_postgres_db()
    else:
        yield from get_sqlite_db()
```

**观测指标** (每 10 分钟检查):
```sql
-- 读 Postgres vs SQLite 的 P99 延迟对比
SELECT
    source_db,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99_ms,
    count(*) AS requests
FROM request_log
WHERE recorded_at > NOW() - INTERVAL '10 minutes'
GROUP BY source_db;
```

**中止条件** (任一触发 → 回退到上一档位):
- Postgres P99 > 200ms (SQLite 基线的 2×)
- 错误率 > 1%
- confidence 均值下降 > 0.05

---

### Phase 3: 回源验证 (最多 3 天)

**目标**: 确认 Postgres 为唯一真源，停止 SQLite 写路径，清理双写代码。

**步骤**:

1. **最终对账** (Day 22):
```bash
python apps/api/scripts/migration_check.py --phase 3 --strict
```

2. **停止 SQLite 写路径**:
```python
# 移除双写, 改为单写 Postgres
async def write_metric(metric: str, data: dict, db_postgres):
    await _write(db_postgres, metric, data)
```

3. **SQLite 归档**:
```bash
cp apps/api/data/safvsoil.db apps/api/data/safvsoil_archive_$(date +%Y%m%d).db
```

4. **记录 migration_audit**:
```sql
INSERT INTO migration_audit (event_type, phase, table_name, rows_written, rows_verified)
VALUES ('phase3_complete', 3, 'all', <total_rows>, <verified_rows>);
```

---

## 3. 数据一致性保证

### 事务隔离级别

```sql
-- Postgres: READ COMMITTED (默认, 适合高并发写入)
-- 理由: 7 指标每日写入, 无跨行聚合事务需求, RC 已足够
SET default_transaction_isolation = 'READ COMMITTED';

-- 对账查询时升级为 REPEATABLE READ (避免幻读)
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT count(*), avg(confidence) FROM market_prices;
COMMIT;
```

**为什么不用 SERIALIZABLE**:
- 写入场景: Scheduler 每日一次 upsert, 无并发冲突
- 读取场景: Dashboard 读取最新一行, 无 read-modify-write
- 性能: SERIALIZABLE 在 pg 下开销约 15-30%, 不值得

### 冲突解决策略

```sql
-- UPSERT 策略: latest-write-wins (基于 recorded_date/datetime)
INSERT INTO market_prices (recorded_date, price_eur, source, confidence, updated_at)
VALUES ($1, $2, $3, $4, NOW())
ON CONFLICT (recorded_date) DO UPDATE
  SET price_eur  = EXCLUDED.price_eur,
      source     = EXCLUDED.source,
      confidence = EXCLUDED.confidence,
      updated_at = NOW()
  WHERE EXCLUDED.confidence >= market_prices.confidence;  -- 只允许置信度不降
```

**Latest-write-wins 适用理由**:
- 数据源是时序快照, 同一天只有一个权威值
- 置信度护栏 (WHERE EXCLUDED.confidence >= ...) 防止 fallback 值覆盖权威值
- 无需 CRDT: 7 指标都是 last-value semantics, 不是累加型

### 数据验证脚本

见 `apps/api/scripts/migration_check.py` (完整实现)。核心逻辑:

```python
TABLES = [
    "market_prices",
    "carbon_intensities",
    "germany_premiums",
    "rotterdam_emissions",
    "eu_ets_volumes",
    "data_freshness",
    "source_status",
]

for table in TABLES:
    pg_count = pg_conn.execute(f"SELECT count(*) FROM {table}").scalar()
    sq_count = sq_conn.execute(f"SELECT count(*) FROM {table}").scalar()
    assert pg_count == sq_count, f"Row count mismatch: {table}"
```

---

## 4. 失败恢复与回滚

### 迁移失败检测

```python
# migration_check.py 的失败判定条件
FAILURE_CONDITIONS = {
    "row_count_mismatch":    lambda pg, sq: abs(pg - sq) > 0,
    "confidence_drift":      lambda pg, sq: abs(pg - sq) > 0.01,
    "schema_column_missing": lambda pg_cols, expected: expected - pg_cols != set(),
    "null_rate_spike":       lambda null_pct: null_pct > 0.05,   # >5% nulls in non-null cols
}
```

### 自动回滚触发条件

```yaml
auto_rollback_triggers:
  - pg_connection_failed: true          # Postgres 连接失败 3 次
  - error_rate_pct: "> 2"              # 读写错误率 > 2%
  - p99_latency_ms: "> 200"            # P99 超过 SQLite 2×
  - data_loss_rows: "> 0"              # 任何行计数减少
  - confidence_avg_drop: "> 0.1"       # 置信度均值下降 > 0.1
```

### 回滚步骤 (见 `apps/api/scripts/rollback.py`)

```python
# 自动回滚流程
def rollback():
    1. 设置 READ_POSTGRES_PCT=0  (立即停止 Postgres 读)
    2. 设置 WRITE_POSTGRES=false (停止 Postgres 写)
    3. 确认 SQLite 读写路径恢复正常 (health check)
    4. 记录 migration_audit (event_type='rollback')
    5. 发送 Slack 告警 (#data-alerts)
    6. 触发 Codex review 任务
```

---

## 5. 监控与埋点

### 迁移过程关键 Prometheus 指标

```
# 迁移阶段
safvsoil_migration_phase{phase="1|2|3"} 1

# 双写延迟
safvsoil_dual_write_latency_ms{target="postgres"} histogram
safvsoil_dual_write_latency_ms{target="sqlite"} histogram

# 对账结果
safvsoil_migration_check_row_diff{table="market_prices"} 0
safvsoil_migration_check_confidence_diff{table="market_prices"} 0.0

# 灰度读取分布
safvsoil_read_source{db="postgres"} counter
safvsoil_read_source{db="sqlite"} counter

# 错误率
safvsoil_migration_error_total{error="connection_failed|timeout|schema_mismatch"} counter
```

### 告警规则 (Prometheus AlertManager)

```yaml
groups:
  - name: migration
    rules:
      - alert: MigrationRowCountMismatch
        expr: safvsoil_migration_check_row_diff != 0
        for: 1m
        severity: critical
        annotations:
          summary: "Row count diverged between Postgres and SQLite"

      - alert: MigrationPostgresDown
        expr: up{job="postgres"} == 0
        for: 30s
        severity: critical
        annotations:
          summary: "Postgres unreachable — auto-rollback triggered"

      - alert: MigrationHighLatency
        expr: histogram_quantile(0.99, safvsoil_dual_write_latency_ms) > 200
        for: 5m
        severity: warning

      - alert: MigrationAutoRollback
        expr: safvsoil_migration_phase == 0  # 0 = rolled back
        for: 0m
        severity: critical
        annotations:
          summary: "Migration rolled back to SQLite — immediate review required"
```

### 自动切回 SQLite 的条件

```python
# apps/api/app/db/session.py — 熔断逻辑
POSTGRES_FAIL_COUNT = 0
POSTGRES_FAIL_THRESHOLD = 3

def get_db():
    global POSTGRES_FAIL_COUNT
    if POSTGRES_FAIL_COUNT >= POSTGRES_FAIL_THRESHOLD:
        # 熔断: 强制使用 SQLite
        yield from get_sqlite_db()
        return
    try:
        db = PostgresSessionLocal()
        yield db
        POSTGRES_FAIL_COUNT = 0   # reset on success
    except Exception:
        POSTGRES_FAIL_COUNT += 1
        if POSTGRES_FAIL_COUNT >= POSTGRES_FAIL_THRESHOLD:
            trigger_rollback_alert()  # 发 Slack + 写 migration_audit
        yield from get_sqlite_db()   # fallback
    finally:
        db.close()
```

---

## 6. 风险清单 (按 severity 排序)

| # | 风险 | Severity | 概率 | 缓解策略 |
|---|------|----------|------|----------|
| 1 | Postgres 网络分区 (节点间不可达) | HIGH | 中 | 熔断 + 自动回源 SQLite (见第5节) |
| 2 | 数据丢失 (回填缺行) | HIGH | 低 | Phase 1 每日对账, 差值 > 0 停止迁移 |
| 3 | 连接池耗尽 (30 总连接 = 3节点×10) | MEDIUM | 低 | pool_size=8, max_overflow=2, pool_timeout=10s |
| 4 | 时序数据膨胀 (history 表增长率) | MEDIUM | 中 | 按月分区归档 (计划 v1.1.0) |
| 5 | 灰度期间数据不一致 (双读源) | MEDIUM | 低 | 灰度窗口 < 1 周, A/B 结果对比告警 |
| 6 | 性能回归 (网络跳数 > 本地文件) | LOW | 低 | 连接池 + prepared statements, 基线 P99 < 100ms |
| 7 | SQLite 归档误删 | LOW | 极低 | 归档前 checksum 验证, 保留 30 天 |
| 8 | Alembic migration 顺序错误 | LOW | 低 | CI 跑 alembic upgrade head; downgrade -1; upgrade head |

---

## 7. 成功标准

| # | 标准 | 验证方法 | 责任人 |
|---|------|----------|--------|
| ✅ | 零数据丢失 (100% 行计数匹配) | migration_check.py --strict | Lane D |
| ✅ | 零停机时间 (灰度期间用户无感知) | error_rate < 0.1% in Prometheus | Lane E |
| ✅ | 性能 ≥ SQLite (P99 < 100ms for reads) | load test after Phase 2 100% | Lane D |
| ✅ | Postgres→SQLite 自动回滚成功率 ≥ 99% | rollback.py dry-run × 10 | Lane D |
| ✅ | migration_audit 有完整事件记录 | SELECT * FROM migration_audit | Lane D |
| ✅ | 所有 7 指标 confidence 均值 ≥ 0.8 after migration | migration_check.py --report | Lane D |

---

## 附录: 连接池配置参考

```python
# apps/api/app/db/session.py (Postgres — 生产配置)
from sqlalchemy import create_engine

engine = create_engine(
    settings.database_url,
    pool_size=8,           # 每个进程 8 个常驻连接
    max_overflow=2,        # 峰值额外 2 个 (共 10/node × 3 nodes = 30)
    pool_timeout=10,       # 等待连接超时 10s → 触发熔断
    pool_recycle=1800,     # 30 分钟回收连接 (防止 pg idle timeout)
    pool_pre_ping=True,    # 每次借用前 ping, 避免 stale connections
    future=True,
)
```

```python
# apps/api/app/db/sqlite.py (SQLite — 本地/fallback)
from sqlalchemy import create_engine

sqlite_engine = create_engine(
    "sqlite:///./apps/api/data/safvsoil.db",
    connect_args={"check_same_thread": False},
    pool_size=1,           # SQLite 单线程写
    max_overflow=0,
    future=True,
)
```
