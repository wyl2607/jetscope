# /Users/yumei 开发区优化计划

> 创建日期：2026-04-24
> 范围：本机 `/Users/yumei` 工作区、`~/projects/*` 项目区、AI 自动化与追踪体系

## Goal

把当前 `/Users/yumei` 从“功能强但易漂移的多 AI 开发区”收口成更安全、可追踪、可交接、可发布的本地开发工作站。

## Context

- `/Users/yumei` 本身是 Git repo，当前有大量 home 目录配置、AI 工具状态、凭证相关路径处于未跟踪可见状态。
- 主项目为 `~/projects/jetscope`，当前基础验证 `npm run api:check` 与 `npm test` 已通过。
- traceability 覆盖检查显示 `career-ops` 与 `jetscope` 的 `AGENTS.md` 不满足当前强制 marker。
- 多项目工作树积压明显：`sustainos`、`career-ops`、`esg-research-toolkit` 均有较多未收口变更。
- AI 工具注册表与 ledger 体系已经存在，但 `PROJECT_PROGRESS.md` / `INCIDENT_LOG.md` 入口存在漂移。

## Constraints

- 不做破坏性 Git 操作，不 reset、不 checkout 覆盖用户变更。
- 不提交、不 push，除非用户明确要求。
- 不读取或输出密钥内容；只检查路径、忽略规则和跟踪状态。
- 高风险脚本、发布脚本、多节点同步脚本只做审计或文档说明，修改前先确认影响面。
- 优先做最小正确改动，先解决安全边界和可追踪性，再处理项目级收口。

## Done Criteria

- 根 `.gitignore` 覆盖本机 AI 工具状态、凭证目录、shell history、备份目录等本地敏感路径。
- JetScope `.gitignore` 忽略本地 API 数据库目录，避免 `apps/api/data/` 进入提交队列。
- `check-ai-traceability-coverage.sh /Users/yumei/projects` 能通过，或至少 JetScope 先通过。
- 根级 `PLANS.md` 成为后续 AI 接手的当前优化入口。
- 关键验证命令有记录：安全 ignore 验证、traceability 覆盖验证、JetScope `api:check` / `npm test`。

## Task List

1. 安全边界加固：更新根 `.gitignore`，覆盖 `.ssh/`、`.claude*/`、`.codex*/`、`.opencode*/`、`.gemini/`、`.mcp.json`、shell history、credential backups、AI runtime/cache 目录。
2. JetScope 本地数据保护：更新 `~/projects/jetscope/.gitignore`，忽略 `apps/api/data/` 与本地 SQLite 数据文件。
3. 忽略规则验证：用 `git check-ignore -v` 验证敏感路径和 JetScope 数据库路径均被忽略。
4. Traceability 修复：更新 `~/projects/jetscope/AGENTS.md`，补齐当前 read-first/write-back marker；再处理 `career-ops/AGENTS.md`。
5. 覆盖检查：运行 `bash /Users/yumei/tools/automation/scripts/check-ai-traceability-coverage.sh /Users/yumei/projects`。
6. JetScope 快速回归：运行 `npm run api:check` 与 `npm test`，确认忽略规则和文档调整不影响项目。
7. 工作树分层盘点：按 `jetscope`、`esg-research-toolkit`、`sustainos`、`career-ops` 输出待收口清单，不混改用户已有变更。
8. 自动化巡检：审计 launchd 中 `codex-p0-p1-loop`、`auto-refactor-loop`、`sustainos-vps-pullback` 的运行状态与日志入口。
9. 状态入口收口：决定是否创建 `/Users/yumei/PROJECT_PROGRESS.md` 与 `/Users/yumei/INCIDENT_LOG.md`，或把规范统一指向现有 durable memory。
10. 安全审计补档：恢复或重建 `security/SENSITIVE_FILES_MANIFEST.md`，记录本地敏感路径分类但不记录密钥内容。

## First Pass Priority

1. 完成任务 1-3，先降低误提交敏感文件风险。
2. 完成任务 4-6，让 JetScope 作为主项目先回到规范状态。
3. 再进入任务 7-10，做多项目和自动化治理。

## Second Pass Findings — 2026-04-24

### Completed in this pass

- Rechecked `jetscope`, `esg-research-toolkit`, `sustainos`, and `career-ops` worktrees.
- Verified all project `AGENTS.md` files now pass traceability coverage.
- Found and fixed one live SustainOS regression while auditing: `check-overnight.sh` and `remote-health-audit.sh` could falsely match the current test shell as a runner because PID fallback matched any argv containing the script path. The fallback now only accepts literal script path when invoked by `bash` or `sh`.

### Verification evidence

- `bash /Users/yumei/tools/automation/scripts/check-ai-traceability-coverage.sh /Users/yumei/projects` -> passed.
- `jetscope`: `npm run web:typecheck` -> passed; previous first-pass `npm run api:check` and `npm test` passed.
- `esg-research-toolkit`: `OPENAI_API_KEY=dummy .venv/bin/pytest -q tests/test_rate_limit.py` -> 2 passed.
- `sustainos`: `bash -n scripts/ops/check-overnight.sh scripts/ops/remote-health-audit.sh` -> passed; `./.venv/bin/python -m pytest tests/test_control_plane_ops.py tests/test_remote_health_audit_parsers.py -q` -> 48 passed; `./.venv/bin/python -m pytest tests -q` -> 166 passed.
- `career-ops`: `npm run verify` -> clean; `npm run optimize` -> clean; `npm run scan -- --dry-run` -> completed. `npm test` is not defined.

### Project classification

- `jetscope`: low-risk, ready to package as a small governance/dev-environment change. Current modified files: `.gitignore`, `AGENTS.md`, `package.json`.
- `esg-research-toolkit`: medium-risk refactor branch. `report_parser/api.py` was split into route modules; targeted upload tests pass. Needs broader backend test selection before commit/push.
- `sustainos`: high-risk recovery/control-plane branch. Very large untracked surface plus remote/runtime-sensitive scripts. Full local tests pass after the PID fallback fix, but remote rollout must be explicitly approved.
- `career-ops`: medium-risk local workflow improvement plus personal/job artifacts. Pipeline checks pass, but many untracked career artifacts should be classified before any commit.

### Open decisions for user

1. Whether to commit/package `jetscope` first as the clean baseline.
2. Whether `esg-research-toolkit` should continue toward broad test/review, or be parked as a refactor branch.
3. Whether `sustainos` should proceed to remote readback/rollout; this touches VPS/control-plane behavior and needs explicit approval.
4. Whether `career-ops` personal artifacts should be kept local-only, archived, or prepared for a private commit.

### User decisions — 2026-04-24

- Task 1 `jetscope`: allowed to proceed with close-out and testing.
- Task 2 `esg-research-toolkit`: allowed to proceed with close-out and testing.
- Task 3 `sustainos`: remote readback/rollout is not allowed for now. Keep all work local; do not touch VPS/control-plane runtime.
- Task 4 `career-ops`: keep artifacts in place locally. Do not push or prepare personal artifacts for remote publication.

### Next execution boundary

Proceed only with local verification and packaging notes for `jetscope` and `esg-research-toolkit`. Do not commit or push unless explicitly requested.

### Task 1-2 local close-out — 2026-04-24

#### JetScope

- Scope reviewed: `.gitignore`, `AGENTS.md`, `package.json`.
- Result: local data ignore and cross-AI traceability entrypoint are ready; `api:dev` now uses `apps/api/.venv/bin/uvicorn` to avoid global Python/uvicorn drift.
- Verification:
  - `git check-ignore -v apps/api/data apps/api/data/market.db` -> ignored by `apps/api/data/` rule.
  - `npm run api:check` -> passed.
  - `npm test` -> 12 passed.
  - `npm run web:typecheck` -> passed.
- Packaging status: ready for a small local commit when requested.

#### ESG Toolkit

- Scope reviewed: `report_parser/api.py` split into route/helper modules plus related test imports and local guard config.
- Fix during close-out: restored backward-compatible exports from `report_parser.api` for `get_dashboard_stats`, `save_manual_report`, and `preview_merge`, because existing tests import those symbols from `api.py`.
- Verification:
  - `python3 -m py_compile report_parser/api.py report_parser/upload_routes.py report_parser/manual_routes.py report_parser/merge_routes.py report_parser/dashboard_routes.py report_parser/common.py report_parser/query_router.py` -> passed.
  - `OPENAI_API_KEY=dummy .venv/bin/pytest -q tests/test_rate_limit.py tests/test_report_parser.py tests/test_openapi_contract.py` -> 62 passed.
  - `OPENAI_API_KEY=dummy .venv/bin/pytest -q tests/test_report_parser.py tests/test_frameworks_comparison.py tests/test_profile_contract.py tests/test_models_registry.py tests/test_openapi_contract.py tests/test_taxonomy_scorer.py` -> 81 passed.
  - `OPENAI_API_KEY=dummy .venv/bin/pytest -q` -> 206 passed.
- Packaging status: functionally green locally, but untracked generator/backup/review artifacts need classification before commit.

## Development Zone Backlog — 2026-04-24

### Priority order

1. Close out `jetscope` first as the clean local baseline for the development zone.
2. Classify `esg-research-toolkit` generated, backup, review, runtime, and script artifacts before any commit.
3. Create a root-level workspace progress dashboard so project status is not only stored in chat or ad hoc notes.
4. Refresh the AI systems registry and daily tool check report, then audit the missing alert channel.
5. Audit VPS policy violations where `codex` or `omx` appear on VPS nodes; execution requires explicit approval because it changes remote/shared state.
6. Define version-control boundaries for `meichen-web`, `home-lab-app`, and `obsidian-knowledge-pipeline`, which currently appear from the root workspace view rather than as clean independent repos.
7. Keep `sustainos` local-only for now; no VPS readback, promotion, pullback, or control-plane runtime changes without explicit approval.
8. Keep `career-ops` personal artifacts local-private and add local-only classification before any publication decision.
9. After the large tasks above are closed, rerun a workspace-wide status analysis and update task tracking.

### System-level gaps to fix

- Asset classification is incomplete: source files, local runtime state, backups, review logs, generated reports, credentials-adjacent config, and personal artifacts need explicit handling rules.
- Publication boundaries are incomplete: each project needs a clear answer for what can be committed, pushed, archived locally, or never published.
- The root `/Users/yumei` repo still sees many home-directory and project-directory paths; this must be treated as a safety boundary, not a normal application repo.
- Runtime state and source state are still mixed in several projects, especially around `.automation/`, `.omx/`, `runtime/`, review logs, local DBs, and backup files.
- The latest AI tools daily check report is stale relative to today and still reports `alert_channel_unconfigured`.
- VPS nodes show policy violations for AI developer tools; remediation must be planned before execution.
- Windows OpenCode needs a copied handoff entry to understand the existing multi-agent parallel development system without relying on chat history.

### Windows OpenCode handoff — 2026-04-24

- Created `/Users/yumei/tools/automation/workspace-guides/windows-opencode-handoff.md` as the durable handoff for Windows OpenCode.
- Purpose: teach Windows OpenCode the read-first order, safe parallel-agent policy, path mappings, write-back ledgers, and safety rules.
- Copied the handoff and parallel-dev/VPS handbook to the durable Windows target `windows-pc:C:/Users/wyl26/yumei/tools/automation/workspace-guides/` and verified Windows OpenCode could summarize the policy.
- Maintenance rule: after material edits to `windows-opencode-handoff.md` or `parallel-dev-vps-handbook.md`, refresh the Windows copy under `C:/Users/wyl26/yumei/tools/automation/workspace-guides/`; do not use `windows-pc:~/` as the canonical target.

### Parallel development policy for this cleanup wave

- Use local Codex/OpenCode review for low-risk repository close-out tasks.
- Do not fan out cleanup work to VPS/control-plane nodes unless the task explicitly needs remote runtime evidence.
- Prefer parallel agents for read-only classification, review, and test planning.
- Remote execution, rollout, sync, pullback, or install/uninstall actions require an explicit approval step.

## Root Dashboard — 2026-04-24

- Created `/Users/yumei/PROJECT_PROGRESS.md` as the current workspace dashboard.
- The dashboard records project status, risk, boundaries, blockers, verification evidence, next queue, and operating rules.
- `PLANS.md` remains the planning/backlog document; `PROJECT_PROGRESS.md` is the current status view.

## AI Tooling Refresh — 2026-04-24

- Refreshed `/Users/yumei/tools/automation/workspace-guides/ai-systems-registry.json` with current local runtime surfaces.
- Current registry now reports 12 runtime surfaces: 8 installed CLI tools and 4 installed apps.
- Restored `/Users/yumei/scripts/daily_ai_tools_update_check.py` and `/Users/yumei/scripts/ops_hub.sh`; `bash /Users/yumei/scripts/ops_hub.sh run-profile daily` now refreshes the registry, regenerates the AI tools report, writes an ops daily journal, writes a local-file alert fallback, and generates a read-only VPS remediation plan.
- Existing latest report is no longer stale; it now refreshes on 2026-04-24 and includes native Windows PowerShell probe output for `windows-pc`.
- Current critical blockers are `external_alert_delivery_unimplemented` and `usa-vps` `policy_violation:codex,omx`; `france-vps` remains an optional warning with the same policy violation.
- External alert delivery now supports HTTPS webhook and Telegram when configured through environment variables; reports persist delivery status only, not secret values. Local-file-only alerting is explicitly accepted by default policy through `AI_ALERT_ACCEPT_LOCAL_FILE_ONLY=1`, so missing external alert delivery no longer makes the daily report critical.
- Added `/Users/yumei/tools/automation/scripts/validate-workspace-automation.sh` as the read-only validation entrypoint for automation health. It checks daily checker syntax, ops hub syntax, generated reports, Windows probe status, non-critical alert config, ops journal health, auto-refactor Python compatibility, high-risk shell syntax, and Windows handbook reachability.

## Root Git Boundary And VPS Policy — 2026-04-25

- Completed approved `usa-vps` AI cleanup phase 1 after fresh readiness/plan review. Removed only global `codex`/`omx` symlinks and npm package directories, preserved dispatch, `.bashrc`, `.local/state`, `.omx`, and `.codex`.
- Latest daily AI tools check is `overall=ok`; `usa-vps` and `france-vps` no longer report forbidden AI tools installed.
- Strengthened root `.gitignore` so home/config/runtime/project surfaces are hidden from root Git by default: `projects/`, `tools/`, `yumei/`, `.Trash/`, `.cc-switch*`, `.esg-deploy-config*`, `.gitconfig`, `.viminfo`, `.cursorrules`.
- Remaining root visible files are now intentional governance/source candidates: `.gitignore`, `PLANS.md`, `PROJECT_PROGRESS.md`, `scripts/daily_ai_tools_update_check.py`, `scripts/internal_device_update_orchestrator.py`, `scripts/ops_hub.sh`, `scripts/probe-gpt55-authenticity.sh`, and `scripts/README.md`.
- Reclassified `scripts/README.md` from stale JetScope-specific content to root workspace script documentation, including the approval boundary for `internal_device_update_orchestrator.py`.
- Next boundary decision: whether to commit this root governance/source set, then whether to commit JetScope baseline.

## Tools Automation Phase F Backlog — 2026-04-26

### Goal

把 `tools/automation` 的 Phase F 从“OpenCode 发现任务 + preview/dry-run 控制面”推进到“单任务可安全进入 bounded execute-local 闭环”，同时保持 push、PR、merge、deploy、remote mutation 全部独立门禁。

### Current State

- Telegram 已有 preview-only 入口：`/phasef`、`/opencode_analyze_tasks`、`/opencode_import_preview`、`/opencode_import_apply <proposal_id>`、`/task_loop_preview`、`/bug_discovery_preview`、`/task_loop_plan`、`/git_action_queue`。
- `runtime/task-board/full-chain-report.json` 最新状态：`ok=true`、`auto_dry_run.candidate_count=4`、`failed_execution_count=0`、`triage_recommendations=0`。
- `runtime/task-board/loop-plan.json` 最新状态：`auto_executable_count=4`、`safe-local-progress=4`、`approve-execute-local-suggested=3`、`skip-terminal=6`、`escalate-to-claude=1`。
- no push / PR / merge / deploy / remote mutation；未授予新的真实 `execute-local`。

### Constraints

- 真实执行只能单 task id 推进，不能 bulk apply。
- `task-loop-processor.py --apply` 不暴露为 Telegram 批量按钮。
- `opencode-bug-discovery.py --import-tasks` 不直接接 Telegram 批量按钮；导入应复用 single proposal 或明确手动命令。
- `execute-local` approval 需要用户明确批准具体 task id。
- 所有新增 Telegram 控制面先走 offline driver 和 `validate-telegram-dev-bot.sh`。

### Task List

1. 给 `/task_loop_plan` 增加单任务详情按钮：只显示 `task_id`、`action`、`manual_hint`、`command_to_run`，不执行。
2. 给 `/bug_discovery_preview` 增加“转 proposal/import preview”的设计草案；先不实现批量导入。
3. 选择一个低风险任务进入真实 bounded 本地闭环，候选优先级：`ocbd-7712fbee6f88` 文档边界任务，或 `ocbd-833c4bceb3d4` 幂等性回归测试任务。
4. 若批准单任务执行，按顺序运行：`dev-control-full-chain.py --run-manual-dry-run`、`dev-control-full-chain.py --apply-execute-local --execute-local-task-id <id>`、`dev-control-runner.py --task-id <id>`。
5. 执行后刷新 `task-board.py`、`task-analyzer.py`、`task-board-triage.py`、`task-loop-processor.py`，确认任务状态和 loop-plan 收敛。
6. 增加回归测试：offline driver 必须阻断 mutating callback，尤其 `phasefimport:apply:*`、未来任何 loop apply callback。
7. 更新 `tools/automation/PROJECT_PROGRESS.md` 与 `runtime/ai-trace/session-ledger.jsonl`；如形成稳定模式，写入 `solution-ledger.jsonl`。
8. 运行最终验证：`python3 scripts/telegram-dev-bot.py --self-test`、`bash scripts/validate-telegram-dev-bot.sh`、`bash scripts/validate-workspace-automation.sh`。

### Done Criteria

- Telegram Phase F preview 控制面能解释每个候选下一步，但不会误触发执行。
- 至少一个单任务 bounded execute-local 闭环在明确批准后完成，或明确记录为等待批准。
- dry-run/noisy event 不再制造 `flag-investigation` 误报。
- `full-chain-report.json` 与 `loop-plan.json` 反映收敛后的事实。
- trace ledger 和 progress 文档已更新。

## JetScope Close-Out Plan — 2026-04-25 Night

### Goal

把 JetScope 当前 approval-gated release/publish/deploy/sync/rollback/health-check 改动收口成一个可审查、可提交、可开 PR 的独立变更集，同时不混入根仓库 divergence、VPS 噪音修复或产品功能开发。

### Context

- JetScope 当前 worktree intentionally dirty，包含 17 个 approval-gate 相关文件。
- 本轮已修复两轮审查发现的问题：publish 现在 pin 住通过 gate 的 `GATED_COMMIT`；release 远程 deploy 参数现在做安全字符集约束。
- 本轮验证已通过：`git diff --check`、shell syntax、`npm test`、完整 `npm run preflight`、`./scripts/security_check.sh`。
- `./scripts/review_push_guard.sh origin/main` 当前预期失败，因为 worktree dirty；提交后才应重新通过。
- `usa-vps` JetScope API/Web 健康，auto-deploy cron 已禁用，fail2ban active；但 tailscaled `SERVFAIL` 日志仍复发，需要单独监控/修复。
- 根仓库 `/Users/yumei` 当前 against JetScope origin 处于 ahead 2 / behind 52，并有 `projects/SAF-signal/.gitignore` dirty；禁止 force push，需单独处理。

### Constraints

- 不提交、不 push、不 merge、不 deploy，除非用户明确批准。
- 不把 root governance、SAF-signal graphify ignore、VPS DNS 噪音、产品功能改动混进 JetScope approval-gate 变更集。
- 高风险脚本继续 fail closed：publish/release/deploy/sync/rollback/health restart 都必须保留 explicit approval token 语义。
- 如果继续修改远程 shell 命令，所有插入远程 command 的变量必须有同等或更严格的字符集校验。

### Done Criteria

- JetScope 17 文件变更边界清晰，diff 中无非本主题文件。
- 两轮审查无 blocking findings；若发现新问题，先修复并重新跑最小验证。
- `git diff --check`、shell syntax、`npm test`、`npm run preflight`、`./scripts/security_check.sh` 通过。
- 提交前确认 `review_push_guard` 失败原因仅为 dirty worktree；提交后应重新运行并通过。
- `PROJECT_PROGRESS.md` 与 ai-trace session ledger 记录收口状态和下一步。

### Task List

1. 再次审查 JetScope `git diff --name-only`，确认只包含 approval-gated release hardening 相关文件。
2. 重新运行最小验证：`git diff --check`、shell syntax、`npm test`。
3. 如用户批准提交，先运行完整 `npm run preflight` 与 `./scripts/security_check.sh`。
4. 提交 JetScope 变更，建议提交信息：`Harden release side-effect approvals`。
5. 提交后运行 `./scripts/review_push_guard.sh origin/main`，确认 outgoing files 与本主题一致。
6. 如用户批准 push/PR，再创建独立 PR；PR summary 只覆盖 release/publish/deploy/sync/rollback/health-check approval gate。
7. 单独开后续事项：处理 usa-vps tailscaled `SERVFAIL` 复发，不纳入本 PR。
8. 单独开后续事项：处理根仓库 ahead/behind divergence 与 `projects/SAF-signal/.gitignore` dirty，不纳入本 PR。
9. 产品侧候选排队到 release gate 收口之后：数据合同一致性、admin E2E 稳定性、market/source coverage 真实数据质量、investor/demo 体验。

### Current Evidence

- JetScope current changed files: `AGENTS.md`, `OPERATIONS.md`, `PROJECT_PROGRESS.md`, `README.md`, `docs/AUTOMATION_LOOP.md`, `docs/DEPLOYMENT_GUIDE.md`, `infra/server/health-check.sh`, `package.json`, `scripts/README.md`, `scripts/auto-deploy.sh`, `scripts/pr-approval-gate.mjs`, `scripts/publish-to-github.sh`, `scripts/release.sh`, `scripts/rollback.sh`, `scripts/sync-from-node.sh`, `scripts/sync-to-nodes.sh`, `test/release-approval-contract.test.mjs`.
- Latest full `npm run preflight` passed after review fixes: web gate, API check, 85 backend pytest tests, OpenAPI check, 46 Node tests, product smoke, UI E2E.
- Safe-local no-execute run passed convergence with `selected=0`, `repairs=0`.

## Self-Healing Dev Control Loop — 2026-04-28

### Goal

把当前最重要的开发主线切到 `tools/automation`：将已经存在的 Telegram `/ai`、dev-control、task-board、OpenCode draft、safe-local runner、auto-refactor loop、review/convergence gate 和 ai-trace ledger 收口成一个稳定的“AI 自我发现问题 -> 分析根因 -> 验证修复 -> 低风险执行 -> 高风险审批 -> 写回经验”的开发控制面。

### Canonical planning file

- 主规划文件：`/Users/yumei/tools/automation/workspace-guides/self-healing-dev-control-loop.md`
- 当前执行入口：先读该文件，再读 `runtime/task-board/latest-board.json`、`full-chain-report.json`、`loop-plan.json`、`execute-local-gate.json`。
- 当前边界：本阶段只允许本地规划、分类、dry-run、safe-local 低风险任务；不允许 push、PR、merge、deploy、sync、remote mutation、VPS cleanup 或读取密钥。

### Priority queue

1. P0: 当前本地 board 无活跃 P0；如果出现 P0，暂停 P1/P2，只做 containment、root-cause analysis 和 approval-gated repair。
2. P1: repo/runtime/control-plane 边界任务，包括 `home-lab-app`、`meichen-web`、`sustainos`、`esg-research-toolkit` 的边界或高风险规划。
3. P2: 当前优先开发队列从 `tools/automation` 开始，先做 approval-to-dry-run 回归覆盖，再做 retry/noisy task 降噪，再验证 Telegram/OpenCode control plane。
4. P3: Career Ops、SAF-signal、somalia-project、us-site 等低风险边界规划延后。

### First task

从 `dev-tools-automation-add-or-verify-regression-coverage-for-ap-7bdfd1c2` 开始。原因：它直接保护“plan approval 不得绕过 dry-run / execute-local gate”的核心安全路径，是整个自愈开发飞轮最应该先加固的低风险任务。

### Next steps

1. 刷新 task-board/full-chain/execute-local gate 证据，避免使用 stale preview。
2. 检查该任务的现有测试和允许文件范围。
3. 如果仍是低风险，推进最小实现或生成一个明确的 `execute-local` 单任务审批点。
4. 修改后运行 focused validation，再按需运行 `bash scripts/validate-workspace-automation.sh`。
5. 写入 `ai-trace` session；如形成可复用模式，再写 `solution-ledger`。
