---
doc_id: docs-index-001
type: index
owner: repo-evolver
canonical_path: docs/INDEX.md
last_verified: 2026-05-08
verification_level: source-backed
source_of_truth:
  - repo:workspace-guides
  - repo:plan.md
  - repo:development-plan.md
staleness_policy: review_monthly
risk_if_wrong: medium
---

# tools/automation 文档索引

## 架构文档

→ [docs/architecture/INDEX.md](architecture/INDEX.md)
- 系统设计、架构计划、阶段规划、基线文档

## 操作手册

→ [docs/human/INDEX.md](human/INDEX.md)
- Runbook、SOP、操作指南、交接文档、检查清单

## 决策记录

→ [docs/decisions/INDEX.md](decisions/INDEX.md)
- 架构决策记录 (ADR)、边界裁定、拆分决策、策略选择

## 变更日志

→ [docs/changelog/INDEX.md](changelog/INDEX.md)
- 项目进展、近期变更、版本记录

## 核心入口文件

| 文件 | 用途 |
|---|---|
| `plan.md` | repo-evolver 五主线六阶段架构计划 |
| `development-plan.md` | 现状分析 + 开发推进路线 |
| `AGENTS.md` | AI agent 本地入口和安全契约 |
| `PROJECT_PROGRESS.md` | 日常进展记录 |
| `PLANS.md` | 当前活跃计划 |

## 治理文件

| 文件 | 用途 |
|---|---|
| `.evolver/config.yml` | 演化规则、节奏、偏好 |
| `.evolver/risk-policy.md` | 四级风险边界 |
| `.evolver/style-guide.md` | 中文写作风格规范 |
| `.evolver/memory/lessons.md` | 已验证经验教训 |
| `.evolver/memory/rejected-patterns.md` | 禁止再出现的做法 |
| `workspace-guides/evolution-registry.json` | 注册表 |
