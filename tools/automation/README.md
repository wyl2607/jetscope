# Automation Toolkit

## 当前定位

`tools/automation` 是 `/Users/yumei` 工作区的本地自动化包，负责跨 AI、跨节点、trace ledger、并行开发、VPS 边界和 Windows handoff。

Phase 5 已经有 accepted ADR：`docs/decisions/phase5-split-decision.md` supersedes the older "do not split yet" baseline. The local review-ready closure can pass inside this package, but actual split execution remains deferred: no new repo, push, PR, launchd mutation, or remote/sync/deploy action is part of the default workflow.

当前实现仍强依赖本机路径、Windows 映射、`.omx` 集群状态、launchd 和 workspace ledger。`tools/automation` 继续作为本机操作副本；任何独立 repo/package 执行都必须走 ADR 中的人工审批和恢复演练。

当前状态入口：

- `tools/automation/AGENTS.md`
- `tools/automation/workspace-guides/ai-entry-map.md`
- `tools/automation/workspace-guides/ai-entry-map.json`
- `tools/automation/workspace-guides/ai-systems-registry.json` — local AI CLI/App/provider inventory
- `tools/automation/workspace-guides/ai-systems-registry.md` — human-readable AI systems registry guide
- `tools/automation/workspace-guides/external-orchestration-candidates.md` — read-only external AI orchestration candidate ledger
- `tools/automation/PROJECT_PROGRESS.md`
- `tools/automation/plan.md` — repo-evolver architecture plan / phase roadmap
- `tools/automation/workspace-guides/repo-evolver-maintenance-system.md` — Git-first maintenance pipeline planning record
- `tools/automation/workspace-guides/parallel-dev-vps-handbook.md`
- `tools/automation/workspace-guides/windows-opencode-handoff.md`
- `tools/automation/workspace-guides/automation-source-runtime-classification.md`
- `tools/automation/workspace-guides/automation-project-split-decision.md`
- `tools/automation/workspace-guides/multi-agent/README.md`

目录边界：

- `workspace-guides/`: 架构、handoff、runbook、registry、策略文档
- `scripts/`: 稳定工具入口
- `auto-refactor-loop/`: 定时并行开发流水线
- `runtime/`: ledger、日志、状态、报告等生成物
- `templates/`: 项目记录和 agent 指令模板

Phase H 多智能体治理入口：`workspace-guides/multi-agent/README.md`。主智能体只调度不干活，子智能体按 planner/developer/tester/reviewer 岗位执行，治理脚本默认只读 runtime 并输出 digest，避免反复消耗 token 做同类判断。

当前结论：Phase 5 决策已记录为可拆分方向，但执行仍 deferred。旧判断标准记录在 `workspace-guides/automation-project-split-decision.md`，现已被 `docs/decisions/phase5-split-decision.md` 取代为当前事实源。

## 统一日常入口

日常状态、刷新和验证优先走一个稳定入口，不再直接记忆每个 Phase/实验脚本：

```bash
cd /Users/yumei/tools/automation
scripts/automationctl status
scripts/automationctl refresh
scripts/automationctl refresh --run-dry-run
scripts/automationctl validate
scripts/automationctl validate --full
```

边界：`automationctl` 不批准 plan，不授予 `execute-local`，不确认 runner，不 push/PR/merge/deploy，不 sync worker，不修改 VPS 或远端状态。底层 Phase F/H、OpenCode、task-board、triage、dedupe、quarantine 脚本保留为内部模块；默认对外入口先收敛到 `automationctl`、Telegram `/ai` 和 Telegram `/center`。

## AI 成本与额度入口

Claude Code session 成本导入器借鉴 Ruflo cost-tracker 的 JSONL usage
解析方式，但只写入本地 runtime JSON，不启用 Ruflo plugin、MCP、hooks 或
AgentDB：

```bash
python3 /Users/yumei/tools/automation/scripts/claude-session-cost-importer.py \
  --cwd /Users/yumei
```

默认输出：

```text
/Users/yumei/tools/automation/runtime/token-budget/claude-session-cost-latest.json
```

统一预算报告会自动读取这份摘要：

```bash
python3 /Users/yumei/tools/automation/token-budget-manager.py --report
```

统一预算阶梯：

```bash
python3 /Users/yumei/tools/automation/token-budget-manager.py --budget-governance
```

预算阶梯采用 Ruflo cost-tracker 风格的 50/75/90/100% 阈值：

- `INFO`: 50%，记录并继续观察
- `WARNING`: 75%，优先低成本 lane，避免宽并行
- `CRITICAL`: 90%，降级模型、压缩上下文或要求人工复核
- `HARD_STOP`: 100%，暂停非必要 agent/model 调用

可用环境变量覆盖默认值：

```bash
CLAUDE_SESSION_BUDGET_USD=10.0
OPENCODE_DAILY_TOKEN_QUOTA=50000000
```

## 统一往返入口

现在项目推送到美国 VPS、远端执行、再拉回本地合并，统一走：

```bash
bash /Users/yumei/tools/automation/vps-roundtrip.sh <project|project-conf> [options]
```

默认行为：

1. 读取项目的 `.automation/project.conf`
2. 推送到 `usa-vps`
3. 在远端执行任务或命令
4. 拉回结果到本地项目目录
5. 生成一份本次合并文件清单报告

## 常用示例

```bash
# meichen-web：执行单个自动化任务
bash /Users/yumei/tools/automation/vps-roundtrip.sh meichen-web --task-id auth-login-ui

# home-lab-app：只在美国 VPS 上跑构建
bash /Users/yumei/tools/automation/vps-roundtrip.sh home-lab-app

# 自定义远端命令
bash /Users/yumei/tools/automation/vps-roundtrip.sh home-lab-app --remote-cmd "npm run lint && npm run build"
```

## 相关配置

- `projects/meichen-web/.automation/project.conf`
- `projects/home-lab-app/.automation/project.conf`
- `projects/us-site/.automation/project.conf`
- `tools/automation/config/project.conf.template`

## 项目记录脚手架

为项目补齐 `PROJECT_PROGRESS.md` 和 `INCIDENT_LOG.md`，并给常见入口文档补链接：

```bash
bash /Users/yumei/tools/automation/scripts/init-project-records.sh /absolute/project/path
```

模板与规则来源：

- `tools/automation/templates/project-records/`
- `tools/automation/workspace-guides/project-records-standard.md`

## VPS 收尾 SOP 入口

把 VPS 修复/部署/运行态干预后的默认收尾链收敛到一个统一入口：

```bash
bash /Users/yumei/tools/automation/scripts/vps-post-change-sop.sh
```

常用示例：

```bash
# 默认检查 usa-vps + france-vps
bash /Users/yumei/tools/automation/scripts/vps-post-change-sop.sh

# 先执行项目 pullback，再清理 France 上已退场 PM2 app 的残留日志
bash /Users/yumei/tools/automation/scripts/vps-post-change-sop.sh \
  --pullback-cmd "bash <missing-local-path:pullback-from-vps.sh>" \
  --pm2-log-pattern 'meichen-web-eu-*.log'

# 只检查 France，并额外读回一个 service 和端口
bash /Users/yumei/tools/automation/scripts/vps-post-change-sop.sh \
  --host france-vps \
  --check-service meichen-web.service \
  --check-port 3000
```

默认输出：

1. 本地 pullback 命令结果
2. 每台 VPS 的 `health_check.sh`
3. `/opt/vps-sync/logs/*.log` 过期日志清理
4. 可选 PM2 残留日志清理
5. `systemctl --failed` 和额外 service/port 读回
6. 本地报告：`tools/automation/reports/vps-post-change-sop-*.md`

## Coco Surfshark Exit Audit

`coco` 的 Tailscale exit-node 到 Surfshark WireGuard 链路只读检查入口：

```bash
bash /Users/yumei/tools/automation/scripts/audit-coco-surfshark-exit.sh
```

说明文档：`tools/automation/workspace-guides/coco-surfshark-exit-runbook.md`。
该脚本只读采集本地报告，不修改 `coco` 的 systemd、nft、route、WireGuard 或 Tailscale 配置。

IPv6 exit 阻断的受控应用脚本是 `tools/automation/scripts/apply-coco-surfshark-ipv6-block.sh`。默认 `--dry-run`，只有显式 `--apply` 才会修改 `coco`，且需要远端交互式 sudo。该 helper 默认使用 `coco@coco`，因为 SSH alias `coco` 当前默认用户是 `yilinwang`。

## 当前架构与状态

- Workspace 级项目同步/控制面架构、真实技术方案、当前完成度与开发 backlog：
  - `tools/automation/workspace-guides/project-hub-architecture-status.md`

## 输出位置

- 合并报告：`<project>/.automation/reports/`
- 本地回滚备份：`<project>/.automation/vps-backups/`
