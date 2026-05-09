---
doc_id: docs-decisions-001
type: index
owner: repo-evolver
canonical_path: docs/decisions/INDEX.md
last_verified: 2026-05-09
verification_level: source-backed
source_of_truth:
  - repo:workspace-guides
staleness_policy: review_monthly
risk_if_wrong: medium
---

# 架构决策记录 (ADR)

## 项目边界决策

→ `docs/decisions/phase5-split-decision.md`
- **决策**：记录 Phase 5 拆分为独立私有仓库的 accepted ADR；执行仍需人工操作，自动拆分禁止
- 日期：2026-05-08
- 状态：accepted

→ `workspace-guides/automation-project-split-decision.md`
- **决策**：原始基线：现在不拆分 tools/automation 为独立包
- 日期：2026-04
- 状态：superseded by `docs/decisions/phase5-split-decision.md`

## 环境隔离

→ `workspace-guides/ai-environment-isolation-checklist-2026-04-08.md`
- **决策**：AI 环境隔离原则和检查清单
- 日期：2026-04-08
- 状态：active

## 调度器对齐

→ `workspace-guides/ai-scheduler-checklist-alignment-2026-04-08.md`
- **决策**：AI 调度器检查清单对齐
- 日期：2026-04-08
- 状态：active

## 自动重构安全边界

→ `workspace-guides/auto-refactor-safety-boundary-report.md`
- **决策**：自动重构的安全边界定义
- 状态：active

→ `workspace-guides/auto-refactor-task-boundary-strategy.md`
- **决策**：自动重构任务边界策略
- 状态：active

## Vibecoding 脚本参数化审计

→ `workspace-guides/vibecoding-script-parameterization-audit-2026-04-08.md`
- **决策**：脚本参数化审计与规范化
- 日期：2026-04-08
- 状态：archived
