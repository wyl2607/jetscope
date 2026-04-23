# 📋 Data Contract v1 — SAFvsOil 唯一真源

> **v1 FROZEN on 2026-04-22**  
> 状态: ✅ FROZEN  
> 有效期: 2026-04-22 ~ 2026-05-31 (冻结 39 天)  
> 治理: 更改需 Codex 5.3 审批 + 迁移计划  
> 版本: `v1.0.0` — 任何修改必须升级到 `v1.1.0` (非破坏性) 或 `v2.0.0` (破坏性)  
> 签署: Codex (架构师), Lane D (数据), 2026-04-22

---

## 🎯 7 指标统一定义 (market data core)

### **指标 1: market_price (SAF市场价格)**

```yaml
字段名: market_price
类型: float (EUR/L)
单位: EUR per Liter
小数位: 2
来源优先级:
  1. Destatis (德国官方补贴 + 市场价)
  2. ECMWF forecast (港口库存推算价格)
  3. Fallback: 前日缓存值 + 固定值 €3.85
精度要求: ±5% (相对误差)
更新频率: 每日 09:00 CEST
缓存策略: 24h TTL, 过期后强制刷新

Schema (PostgreSQL):
  CREATE TABLE market_prices (
    id SERIAL PRIMARY KEY,
    recorded_date DATE NOT NULL UNIQUE,
    price_eur NUMERIC(10,2) NOT NULL,
    source VARCHAR(50),
    confidence FLOAT DEFAULT 1.0,  -- [0.0=fallback, 1.0=authoritative]
    freshness_minutes INT,  -- mins since last refresh
    error_code VARCHAR(10),  -- null=success
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP
  );
```

**Fallback 语义**:
- 如果 Destatis API 失败 2+ 次: 使用 ECMWF 推算
- 如果 ECMWF 也失败: 使用前日缓存 + confidence=0.5
- 如果缓存无效: 使用固定 €3.85 + confidence=0.0 + warning log

**API 响应示例**:
```json
{
  "market_price": 4.23,
  "unit": "EUR/L",
  "source": "destatis",
  "confidence": 1.0,
  "freshness_minutes": 12,
  "fallback_chain": [],
  "next_refresh": "2026-04-23T09:00:00Z",
  "error": null
}
```

---

### **指标 2: carbon_intensity (碳强度)**

```yaml
字段名: carbon_intensity
类型: float (gCO2/kWh)
单位: Grams CO2 equivalent per kWh
来源优先级:
  1. CarbonIntensity.org (欧洲实时能源碳强度)
  2. ECB historical avg (过去30天平均)
  3. Fallback: 固定值 380 gCO2/kWh
精度要求: ±10%
更新频率: 每小时
缓存策略: 1h TTL

Schema (PostgreSQL):
  CREATE TABLE carbon_intensities (
    id SERIAL PRIMARY KEY,
    recorded_datetime TIMESTAMP NOT NULL UNIQUE,
    intensity_gco2_kwh NUMERIC(8,1) NOT NULL,
    country_code VARCHAR(2) DEFAULT 'DE',
    source VARCHAR(50),
    confidence FLOAT DEFAULT 1.0,
    freshness_minutes INT,
    error_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW()
  );

CREATE INDEX idx_carbon_datetime ON carbon_intensities(recorded_datetime DESC);
```

**Fallback 语义**:
- 实时源失败 → 历史平均 (30 day rolling window)
- 历史也无效 → 固定值 + confidence=0.0

---

### **指标 3: germany_premium (德国补贴溢价)**

```yaml
字段名: germany_premium
类型: float (EUR/L)
单位: EUR per Liter (补贴额度)
来源优先级:
  1. Destatis API (月度更新的补贴政策表)
  2. GitHub SAF-Policies (社区维护的政策汇总)
  3. Config table (运维可配置的手动值)
精度要求: ±1% (绝对值)
更新频率: 每日凌晨 (政策变更低频)
缓存策略: 7d TTL, 或政策变更时立即刷新

Schema (PostgreSQL):
  CREATE TABLE germany_premiums (
    id SERIAL PRIMARY KEY,
    policy_date DATE NOT NULL,
    airline_code VARCHAR(3),  -- LH, AF, BA, null=all
    route_code VARCHAR(10),  -- FRA-JFK, null=all
    subsidy_eur NUMERIC(10,2) NOT NULL,
    source VARCHAR(50),
    confidence FLOAT DEFAULT 1.0,
    valid_from DATE,
    valid_to DATE,
    error_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(policy_date, airline_code, route_code)
  );
```

**Fallback 语义**:
- Destatis 无该航司数据 → GitHub source
- GitHub 也无 → 查询 config table (运维维护的base case)
- config table 空 → €0.0 + confidence=0.0 + note="premium unavailable"

---

### **指标 4: rotterdam_port_emissions (鹿特丹港排放)**

```yaml
字段名: rotterdam_port_emissions
类型: float (tons CO2 daily)
单位: Metric tons CO2 per day
来源优先级:
  1. OpenAQ + ECMWF (港口空气质量 + 风速 → 推算排放)
  2. Historical avg (过去30天平均)
  3. Fallback: 固定值 1200 tons
精度要求: ±15% (估算值，精度低)
更新频率: 每日
缓存策略: 24h TTL

Schema (PostgreSQL):
  CREATE TABLE rotterdam_emissions (
    id SERIAL PRIMARY KEY,
    recorded_date DATE NOT NULL UNIQUE,
    emissions_tons NUMERIC(12,2) NOT NULL,
    calculation_method VARCHAR(50),  -- "openaq_ecmwf", "historical_avg", "fallback"
    source_1 VARCHAR(50),  -- OpenAQ
    source_2 VARCHAR(50),  -- ECMWF
    confidence FLOAT DEFAULT 1.0,
    error_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW()
  );
```

**Fallback 语义**:
- OpenAQ 无数据 → ECMWF 单独推算 (confidence=0.7)
- 两者都无 → 历史平均 (30d) (confidence=0.5)
- 无历史 → 固定值 (confidence=0.0)

---

### **指标 5: eu_ets_volume (EU ETS交易量)**

```yaml
字段名: eu_ets_volume
类型: integer (contracts traded)
单位: Daily trading volume
来源优先级:
  1. Quandl CHRIS/ICE_EC1 (欧盟官方交易数据)
  2. ECB historical (7日平均)
  3. Fallback: 固定值 1000000
精度要求: ±5%
更新频率: 每日 18:00 CEST (交易日结算后)
缓存策略: 2d TTL (前日数据为准)

Schema (PostgreSQL):
  CREATE TABLE eu_ets_volumes (
    id SERIAL PRIMARY KEY,
    trading_date DATE NOT NULL UNIQUE,
    volume_contracts INT NOT NULL,
    price_eur NUMERIC(8,2),
    source VARCHAR(50),
    confidence FLOAT DEFAULT 1.0,
    error_code VARCHAR(10),
    created_at TIMESTAMP DEFAULT NOW()
  );
```

---

### **指标 6: freshness (数据新鲜度)**

```yaml
字段名: freshness
类型: integer (minutes)
单位: Minutes since last successful refresh
计算规则:
  freshness = NOW() - last_successful_refresh_time
  
阈值定义:
  ✅ Green:   < 60 分钟 (fresh data)
  🟡 Yellow:  60-1440 分钟 (stale, 使用缓存)
  🔴 Red:     > 1440 分钟 (very stale, fallback active)

Schema (PostgreSQL):
  CREATE TABLE data_freshness (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(50) NOT NULL,
    last_refresh TIMESTAMP NOT NULL,
    next_refresh TIMESTAMP,
    status VARCHAR(10),  -- green/yellow/red
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(metric_name)
  );
```

---

### **指标 7: source_status (源健康度)**

```yaml
字段名: source_status
类型: object (per-source health)
结构:
  {
    "destatis": {"status": "ok|error", "error_code": "API_TIMEOUT", "last_error_at": timestamp},
    "ecmwf": {"status": "ok", "confidence": 0.95, "calls_today": 42},
    "quandl": {"status": "ok", "daily_quota_used": 23, "quota_limit": 100},
    "carbonintensity": {"status": "error", "error_code": "RATE_LIMIT", "retry_after_seconds": 300},
    "github_saf_policies": {"status": "ok", "last_sync": timestamp, "commits_behind": 0},
    "cache": {"status": "ok", "entries": 127, "hit_rate": 0.88}
  }

Schema (PostgreSQL):
  CREATE TABLE source_status (
    id SERIAL PRIMARY KEY,
    source_name VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20),  -- ok, error, rate_limited, stale
    error_code VARCHAR(20),
    last_error_time TIMESTAMP,
    confidence_score FLOAT,  -- [0.0, 1.0]
    quota_used INT,
    quota_limit INT,
    updated_at TIMESTAMP DEFAULT NOW()
  );

CREATE INDEX idx_source_status ON source_status(status) WHERE status != 'ok';
```

---

## 🗄️ 完整 DDL — Postgres & SQLite

### PostgreSQL DDL (生产主路径)

```sql
-- ============================================================
-- Data Contract v1 — PostgreSQL DDL
-- Generated: 2026-04-22  Status: FROZEN
-- ============================================================

-- 1. market_prices
CREATE TABLE IF NOT EXISTS market_prices (
    id            SERIAL PRIMARY KEY,
    recorded_date DATE        NOT NULL,
    price_eur     NUMERIC(10,2) NOT NULL,
    source        VARCHAR(50),
    confidence    FLOAT       NOT NULL DEFAULT 1.0
                  CHECK (confidence BETWEEN 0.0 AND 1.0),
    freshness_minutes INT,
    error_code    VARCHAR(20),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ,
    CONSTRAINT uq_market_prices_date UNIQUE (recorded_date)
);
CREATE INDEX IF NOT EXISTS idx_market_prices_date ON market_prices (recorded_date DESC);
COMMENT ON TABLE  market_prices IS 'SAF market price EUR/L — Data Contract v1';
COMMENT ON COLUMN market_prices.confidence IS '1.0=authoritative, 0.5=cached, 0.0=hardcoded_fallback';

-- 2. carbon_intensities
CREATE TABLE IF NOT EXISTS carbon_intensities (
    id                   SERIAL PRIMARY KEY,
    recorded_datetime    TIMESTAMPTZ NOT NULL,
    intensity_gco2_kwh   NUMERIC(8,1) NOT NULL,
    country_code         CHAR(2)     NOT NULL DEFAULT 'DE',
    source               VARCHAR(50),
    confidence           FLOAT       NOT NULL DEFAULT 1.0
                         CHECK (confidence BETWEEN 0.0 AND 1.0),
    freshness_minutes    INT,
    error_code           VARCHAR(20),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_carbon_datetime_country UNIQUE (recorded_datetime, country_code)
);
CREATE INDEX IF NOT EXISTS idx_carbon_datetime ON carbon_intensities (recorded_datetime DESC);

-- 3. germany_premiums
CREATE TABLE IF NOT EXISTS germany_premiums (
    id           SERIAL PRIMARY KEY,
    policy_date  DATE        NOT NULL,
    airline_code CHAR(3),                    -- NULL means all airlines
    route_code   VARCHAR(10),                -- NULL means all routes
    subsidy_eur  NUMERIC(10,2) NOT NULL,
    source       VARCHAR(50),
    confidence   FLOAT       NOT NULL DEFAULT 1.0
                 CHECK (confidence BETWEEN 0.0 AND 1.0),
    valid_from   DATE,
    valid_to     DATE,
    error_code   VARCHAR(20),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_germany_premiums UNIQUE (policy_date, airline_code, route_code)
);
CREATE INDEX IF NOT EXISTS idx_germany_premiums_date ON germany_premiums (policy_date DESC);

-- 4. rotterdam_emissions
CREATE TABLE IF NOT EXISTS rotterdam_emissions (
    id                 SERIAL PRIMARY KEY,
    recorded_date      DATE        NOT NULL,
    emissions_tons     NUMERIC(12,2) NOT NULL,
    calculation_method VARCHAR(50),           -- openaq_ecmwf | historical_avg | fallback
    source_1           VARCHAR(50),
    source_2           VARCHAR(50),
    confidence         FLOAT NOT NULL DEFAULT 1.0
                       CHECK (confidence BETWEEN 0.0 AND 1.0),
    error_code         VARCHAR(20),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_rotterdam_date UNIQUE (recorded_date)
);

-- 5. eu_ets_volumes
CREATE TABLE IF NOT EXISTS eu_ets_volumes (
    id               SERIAL PRIMARY KEY,
    trading_date     DATE        NOT NULL,
    volume_contracts BIGINT      NOT NULL,
    price_eur        NUMERIC(8,2),
    source           VARCHAR(50),
    confidence       FLOAT NOT NULL DEFAULT 1.0
                     CHECK (confidence BETWEEN 0.0 AND 1.0),
    error_code       VARCHAR(20),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_eu_ets_date UNIQUE (trading_date)
);

-- 6. data_freshness  (one row per metric — UPSERT target)
CREATE TABLE IF NOT EXISTS data_freshness (
    id           SERIAL PRIMARY KEY,
    metric_name  VARCHAR(50)  NOT NULL,
    last_refresh TIMESTAMPTZ  NOT NULL,
    next_refresh TIMESTAMPTZ,
    status       VARCHAR(10)  NOT NULL DEFAULT 'green'
                 CHECK (status IN ('green','yellow','red')),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_freshness_metric UNIQUE (metric_name)
);

-- 7. source_status  (one row per external source — UPSERT target)
CREATE TABLE IF NOT EXISTS source_status (
    id               SERIAL PRIMARY KEY,
    source_name      VARCHAR(50)  NOT NULL,
    status           VARCHAR(20)  NOT NULL DEFAULT 'ok'
                     CHECK (status IN ('ok','error','rate_limited','stale','unknown')),
    error_code       VARCHAR(20),
    last_error_time  TIMESTAMPTZ,
    confidence_score FLOAT        NOT NULL DEFAULT 1.0
                     CHECK (confidence_score BETWEEN 0.0 AND 1.0),
    quota_used       INT,
    quota_limit      INT,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_source_name UNIQUE (source_name)
);
CREATE INDEX IF NOT EXISTS idx_source_status_non_ok ON source_status (status)
    WHERE status != 'ok';

-- 8. migration_audit  (tracks Postgres↔SQLite sync events)
CREATE TABLE IF NOT EXISTS migration_audit (
    id           SERIAL PRIMARY KEY,
    event_type   VARCHAR(30) NOT NULL,  -- phase_start | row_sync | verify_ok | rollback
    phase        SMALLINT,              -- 1 | 2 | 3
    table_name   VARCHAR(50),
    rows_written BIGINT DEFAULT 0,
    rows_verified BIGINT DEFAULT 0,
    error_detail TEXT,
    recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### SQLite DDL (开发 / 本地 fallback)

```sql
-- SQLite DDL — Data Contract v1
-- NOTE: SQLite 不支持 TIMESTAMPTZ，改用 TEXT (ISO-8601)
-- NOTE: SERIAL → INTEGER PRIMARY KEY AUTOINCREMENT
-- NOTE: CHECK constraints 语法相同，但执行宽松

CREATE TABLE IF NOT EXISTS market_prices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_date   TEXT    NOT NULL UNIQUE,   -- YYYY-MM-DD
    price_eur       REAL    NOT NULL,
    source          TEXT,
    confidence      REAL    NOT NULL DEFAULT 1.0,
    freshness_minutes INTEGER,
    error_code      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS carbon_intensities (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_datetime   TEXT NOT NULL,         -- ISO-8601
    intensity_gco2_kwh  REAL NOT NULL,
    country_code        TEXT NOT NULL DEFAULT 'DE',
    source              TEXT,
    confidence          REAL NOT NULL DEFAULT 1.0,
    freshness_minutes   INTEGER,
    error_code          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(recorded_datetime, country_code)
);

CREATE TABLE IF NOT EXISTS germany_premiums (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    policy_date  TEXT    NOT NULL,
    airline_code TEXT,
    route_code   TEXT,
    subsidy_eur  REAL    NOT NULL,
    source       TEXT,
    confidence   REAL    NOT NULL DEFAULT 1.0,
    valid_from   TEXT,
    valid_to     TEXT,
    error_code   TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(policy_date, airline_code, route_code)
);

CREATE TABLE IF NOT EXISTS rotterdam_emissions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    recorded_date      TEXT NOT NULL UNIQUE,
    emissions_tons     REAL NOT NULL,
    calculation_method TEXT,
    source_1           TEXT,
    source_2           TEXT,
    confidence         REAL NOT NULL DEFAULT 1.0,
    error_code         TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eu_ets_volumes (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    trading_date     TEXT  NOT NULL UNIQUE,
    volume_contracts INTEGER NOT NULL,
    price_eur        REAL,
    source           TEXT,
    confidence       REAL NOT NULL DEFAULT 1.0,
    error_code       TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_freshness (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name  TEXT NOT NULL UNIQUE,
    last_refresh TEXT NOT NULL,
    next_refresh TEXT,
    status       TEXT NOT NULL DEFAULT 'green',
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_status (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name      TEXT NOT NULL UNIQUE,
    status           TEXT NOT NULL DEFAULT 'ok',
    error_code       TEXT,
    last_error_time  TEXT,
    confidence_score REAL NOT NULL DEFAULT 1.0,
    quota_used       INTEGER,
    quota_limit      INTEGER,
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS migration_audit (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type     TEXT NOT NULL,
    phase          INTEGER,
    table_name     TEXT,
    rows_written   INTEGER DEFAULT 0,
    rows_verified  INTEGER DEFAULT 0,
    error_detail   TEXT,
    recorded_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 📐 版本管理规则

### SemVer for Data Contracts

```
v<MAJOR>.<MINOR>.<PATCH>

PATCH (e.g. v1.0.1): 注释修正、文档澄清。不需要 DDL 变更。
MINOR (e.g. v1.1.0): 非破坏性更新。向后兼容。需要 DDL migration + PR。
MAJOR (e.g. v2.0.0): 破坏性变更。需要 RFC + 灰度迁移 + 2 周通知。
```

### 非破坏性更新 (MINOR) 指导原则

允许:
- 新增可空列 (`ALTER TABLE ... ADD COLUMN ... NULL`)
- 新增索引
- 扩大 VARCHAR 长度 (e.g. 50 → 100)
- 新增整张表
- 放宽 CHECK 约束范围

**禁止** (必须升 MAJOR):
- 删除或重命名列
- 更改列数据类型
- 收紧 CHECK 约束
- 删除表
- 更改 UNIQUE 约束组合

### 升级流程

```
1. 提 RFC PR → review by Codex
2. 修改本文档 + 版本号
3. 生成 Alembic migration: alembic revision --autogenerate -m "v1.x.0 ..."
4. 在 staging 执行 migration
5. Lane C 回归测试通过
6. merge → 3 节点同步
7. 更新 CHANGELOG.md
```

---

## 📊 监控告警阈值定义

### Freshness Thresholds

| 指标 | 绿色 (OK) | 黄色 (Stale) | 红色 (Critical) |
|------|-----------|--------------|-----------------|
| market_price | < 60 min | 60–1440 min | > 1440 min |
| carbon_intensity | < 90 min | 90–360 min | > 360 min |
| germany_premium | < 1440 min | 1440–10080 min | > 10080 min |
| rotterdam_port_emissions | < 1440 min | 1440–2880 min | > 2880 min |
| eu_ets_volume | < 1440 min | 1440–2880 min | > 2880 min |

### Confidence Alert Rules

```yaml
# 告警条件 (任一触发 → Slack #data-alerts)
- alert: LowConfidenceMetric
  condition: confidence < 0.5
  severity: warning
  message: "Metric {metric} on fallback, confidence={confidence}"

- alert: AllFallbackActive
  condition: avg(confidence) < 0.3 over all 7 metrics
  severity: critical
  message: "All metrics on fallback — data pipeline breakdown"

- alert: FreshnessRed
  condition: status = 'red'
  severity: critical
  page: true
```

### Fallback Rate Threshold

```yaml
# 过去 24h fallback 触发率
fallback_rate_threshold:
  warn:     >= 20%    # 5+ fallbacks per day per metric
  critical: >= 50%    # primary source effectively dead
  auto_escalate: >= 80%  # trigger Codex incident review
```

### Prometheus Metric Names (埋点规范)

```
# Gauge: 当前置信度
safvsoil_metric_confidence{metric="market_price", source="destatis"} 1.0

# Gauge: 数据新鲜度（分钟）
safvsoil_metric_freshness_minutes{metric="carbon_intensity"} 45

# Counter: fallback 触发次数
safvsoil_fallback_total{metric="eu_ets_volume", level="l2_cache"} 3

# Counter: 数据刷新次数（成功/失败）
safvsoil_refresh_total{metric="market_price", result="success"} 142
safvsoil_refresh_total{metric="market_price", result="error"} 2

# Histogram: 刷新耗时
safvsoil_refresh_duration_seconds{metric="market_price"} 0.34
```

---

## 🔗 数据流约定

### **刷新流程 (Refresh Pipeline)**
```
1. [Scheduler] 触发 refresh job (09:00 daily for daily metrics, hourly for hourly metrics)
2. [Adapter] fetch() 从源获取数据
   └─ on error → fallback_level++
3. [Validator] validate(data, schema)
   └─ on fail → source_status.error_code = "VALIDATION_FAILED"
4. [Transformer] transform() to standard model
5. [Storage] INSERT/UPDATE to PostgreSQL + Redis cache
6. [Monitor] 记录 freshness + source_status
7. [Notify] 如果 confidence < 0.5 → Slack alert
```

### **消费层约定**
- 所有消费者（Dashboard/Prices/Sources）必须检查 `source_status`
- 如果 confidence < 0.5，显示 "⚠️ Data from fallback, unreliable"
- API 响应必须包含 `freshness_minutes` + `source_status` 字段

### **升级路径**
- 如果单个源连续失败 3+ 天 → escalate to Codex for investigation
- 如果主路径 (Postgres) 迁移失败 → rollback to SQLite + 告警 + Codex review

---

## ✅ 验收标准 (Day 1 冻结后)

| # | 检查项 | 标准 | 实施者 |
|----|--------|------|--------|
| 1 | 7 指标字段定义 | Schema + API response 格式 | Codex |
| 2 | Fallback 语义 | 优先级明确，无歧义 | Codex |
| 3 | 缓存策略 | TTL 明确，刷新频率固定 | Codex |
| 4 | 错误码表 | 所有可能的 error_code 已列举 | Lane D (Codex) |
| 5 | 监控埋点 | freshness/confidence/source_status 采集规范 | Lane E |
| 6 | 前端消费 | Dashboard/Prices/Sources 都能显示这 7 个指标 | Lane B |
| 7 | 测试覆盖 | 所有 7 指标的单元测试 + 集成测试 | Lane C (gpt-5.4-mini) |

---

## 📅 冻结后的变更流程

**小改** (字段重命名、TTL 调整):
- PR 到 main
- Lane C 补测试
- 3 节点同步

**大改** (新增指标、fallback 逻辑、迁移):
- 必须 Codex 5.3 设计评审
- RFC 文档 (Data Contract v2)
- 灰度发布计划
- 2 周通知期

---

## 🎯 Down-to-code 清单 (Lane D: Day 1)

```bash
# File 1: Data Contract Schema (PostgreSQL)
apps/api/database/migrations/002_create_data_contract_v1.sql
# Contains: 7个表 + 索引 + FK关系

# File 2: Pydantic Models
apps/api/models/market_data.py
# Classes: MarketPrice / CarbonIntensity / GermanyPremium / RotterdamEmissions / 
#          EUETSVolume / DataFreshness / SourceStatus

# File 3: Error Codes Registry
apps/api/constants/error_codes.py
ERROR_CODES = {
  "API_TIMEOUT": {"severity": "warn", "fallback": True},
  "VALIDATION_FAILED": {"severity": "error", "fallback": True},
  "RATE_LIMITED": {"severity": "info", "retry_after": 300},
  ...
}

# File 4: Adapter Interface (Lane A 依赖这个)
apps/api/adapters/contract.py
class DataSourceAdapter:
    async def fetch() -> RawData
    def validate(data) -> bool
    def transform(data) -> MarketData
    def get_source_status() -> SourceStatus
```

---

**此文档已于 2026-04-22 正式冻结 (v1.0.0 FROZEN)。**  
任何修改须经 Codex 5.3 审批，并在 CHANGELOG.md 中记录。  
非破坏性更新升为 v1.x.0；破坏性更新升为 v2.0.0。
