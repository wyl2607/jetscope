# DB Migrations — Data Contract v1

## 文件说明

| 文件 | 数据库 | 用途 |
|------|--------|------|
| `001_create_market_contract_v1.sql` | PostgreSQL | 生产环境主路径 |
| `sqlite_001_create_market_contract_v1.sql` | SQLite | 本地开发 / 测试 / fallback |

## 包含的表 (8 张)

1. **market_prices** — SAF 市场价格 (EUR/L)
2. **carbon_intensities** — 碳强度 (gCO2/kWh)
3. **germany_premiums** — 德国补贴溢价 (EUR/L)
4. **rotterdam_emissions** — 鹿特丹港排放 (tons CO2/day)
5. **eu_ets_volumes** — EU ETS 交易量 (contracts)
6. **data_freshness** — 数据新鲜度监控 (per metric)
7. **source_status** — 外部数据源健康度 (per source)
8. **migration_audit** — 迁移/同步审计日志

## 执行方式

### PostgreSQL
```bash
psql -U your_user -d your_db -f 001_create_market_contract_v1.sql
```

### SQLite
```bash
sqlite3 your_db.sqlite3 < sqlite_001_create_market_contract_v1.sql
```

## 兼容性说明

- PostgreSQL 使用 `SERIAL`、`TIMESTAMPTZ`、`NUMERIC`、`BIGINT`、`CHAR`/`VARCHAR`
- SQLite 使用 `INTEGER PRIMARY KEY AUTOINCREMENT`、`TEXT`、`REAL`、`INTEGER`
- SQLite 不支持 `COMMENT ON`，如有需要请在应用层维护字段注释
- SQLite 的 `CHECK` 约束语法与 PostgreSQL 相同，但执行策略更宽松

## 版本

- Data Contract: v1.0.0 FROZEN (2026-04-22)
- Migration: 001
