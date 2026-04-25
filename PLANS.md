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
