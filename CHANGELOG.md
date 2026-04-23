# CHANGELOG — SAFvsOil Data Contract

All notable changes to the Data Contract are documented here.  
Format: [vX.Y.Z] — YYYY-MM-DD | Author | Type | Description

---

## [v1.0.0] — 2026-04-22 | Codex (架构师) | FROZEN

### Why
DAY 1 任务：冻结 7 指标统一定义，作为所有 Lane 的数据真源。  
在此之前各 Lane 对字段名、类型、fallback 语义存在歧义，导致前端/后端/数据层出现不一致。  
冻结后所有 Lane 必须以本文档为准，不得自行扩展或修改字段语义。

### What
- ✅ 冻结 7 个核心指标定义 (market_price, carbon_intensity, germany_premium,
  rotterdam_port_emissions, eu_ets_volume, freshness, source_status)
- ✅ 新增完整 PostgreSQL DDL (8 张表 + 索引 + 约束)
- ✅ 新增完整 SQLite DDL (开发/fallback 路径)
- ✅ 新增版本管理规则 (SemVer for Data Contracts)
- ✅ 新增非破坏性更新指导原则 (MINOR vs MAJOR 边界)
- ✅ 新增监控告警阈值定义 (freshness_threshold, fallback_rate_threshold)
- ✅ 新增 Prometheus 埋点规范 (5 种 metric 类型)
- ✅ 新增 migration_audit 表 (迁移事件溯源)
- ✅ 所有 fallback 语义明确化 (confidence 值 + error_code 含义)

### When
- 提案: 2026-04-22 00:00 CST
- 审阅: 2026-04-22 (Codex self-review, Lane D)
- 冻结: 2026-04-22, commit `feat(data): freeze Data Contract v1 + migration strategy`
- 生效: 2026-04-22 起全 Lane 遵循
- 到期: 2026-05-31 (如无 v2 RFC 则自动续期)

### Artifacts Created
- `DATA_CONTRACT_V1.md` — 本文件，v1.0.0 FROZEN
- `CHANGELOG.md` — 本变更日志
- `migration_strategy.md` — PostgreSQL vs SQLite 迁移策略决策
- `apps/api/scripts/migration_check.py` — 数据对账脚本
- `apps/api/scripts/rollback.py` — 自动回滚脚本

---

## [Unreleased / Planned]

### Candidate for v1.1.0 (non-breaking)
- [ ] 新增 `price_forecast_eur` 列到 `market_prices` (ECMWF 预测值)
- [ ] 新增 `carbon_intensities` 的 `forecast_h24` 字段 (24h 前瞻)
- [ ] 新增 `api_response_time_ms` 到 `source_status`

### Candidate for v2.0.0 (breaking)
- [ ] 将 `germany_premiums.airline_code` 改为 FK → airlines 表
- [ ] 合并 `data_freshness` 进入 `source_status` (表结构重组)
- [ ] 引入 time-series 分区 (by month) 到 `market_prices`
