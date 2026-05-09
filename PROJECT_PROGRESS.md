# /Users/yumei Workspace Progress

> Last updated: 2026-05-01
> Scope: local workspace `/Users/yumei`, project area `~/projects/*`, AI automation, and cross-node development operations.

## Current State

The workspace is moving from a powerful but drifting multi-AI development area toward a safer, traceable, handoff-ready local workstation. JetScope is clean and aligned with `origin/main` after PR #41 and PR #42. Root governance/source history is being reconciled on top of the JetScope repository baseline, with root pushes blocked until an explicit branch/PR decision.

## JetScope Remote Baseline (origin/main through PR #47)

- Status: PR #42 source coverage hardening and PR #41 PostCSS patch update are merged and deployed to production at `ee908f233f8d40cf8cef144971cdf8e4aa7743b7`; backend pytest is restored as a local gate.
- Scope: JetScope web/API workspace, local data ignores, traceability entrypoint, release approval gates, token replay protection, and worker/VPS sync boundaries.
- Release entrypoint: `APPROVE_JETSCOPE_RELEASE=<token> npm run release -- --approval-token <token>` after `source scripts/jetscope-env`; development worker sync is opt-in.

## 2026-05-03 Workspace Consolidation Boundary

- JetScope remains the canonical aviation fuel-transition / SAF intelligence product.
- Do not revive `SAF-signal`; it is an archive/delete candidate after migration coverage review.
- Do not route workspace governance, home-lab control, ESG Toolkit, SustainOS, or Career-Ops work into this repo.
- Product work belongs here only when it touches JetScope web/API/core/docs/infra/release surfaces.
- Validation: documentation-only boundary update; `git diff --check -- PROJECT_PROGRESS.md` passed.

## 2026-05-03 Industry Readiness Refactor Gate

- Purpose: start the JetScope refactor loop with one bounded core slice, keeping SAF/industry readiness behavior unchanged.
- Intent: replace the chained industry-signal threshold branch with an ordered threshold table and enforce the structure through a focused quality gate.
- Scope: `packages/core/industry/readiness.ts` and `packages/core/industry/__tests__/readiness.test.mjs`; adjacent `.governance/` and `GOAL.md` remained separate.
- Validation: `node --experimental-strip-types --test packages/core/industry/__tests__/*.test.mjs test/tipping-point-workbench-contract.test.mjs` passed: 9 tests.

## 2026-05-03 Source Coverage Helper Refactor Gate

- Purpose: continue the bounded refactor loop by moving duplicated source coverage trust-state and lag-format rules into the shared frontend coverage contract.
- Intent: keep `/sources/coverage` UI/read-model behavior unchanged while preventing `sources-read-model.ts` and `source-coverage-panel.tsx` from owning separate copies of the same trust/lag rules.
- Scope: `apps/web/lib/source-coverage-contract.ts`, `apps/web/lib/sources-read-model.ts`, `apps/web/components/source-coverage-panel.tsx`, and `test/sources-read-model.test.mjs`; `.governance/` and `GOAL.md` remained separate.
- Initial gate: `npm test -- test/sources-read-model.test.mjs` failed as expected because `source-coverage-contract.ts` did not export `getSourceCoverageTrustState` or `formatSourceCoverageLag`.
- Validation: `npm test -- test/sources-read-model.test.mjs` passed: 59 tests. `npm run web:typecheck` passed. `git diff --check -- apps/web/lib/sources-read-model.ts apps/web/components/source-coverage-panel.tsx apps/web/lib/source-coverage-contract.ts test/sources-read-model.test.mjs PROJECT_PROGRESS.md` passed.

## 2026-05-04 Source Coverage Summary Refactor Gate

- Purpose: continue the source coverage/read-model cleanup with one adjacent slice by centralizing summary aggregation inside `apps/web/lib/sources-read-model.ts`.
- Intent: keep UI/API behavior unchanged while extracting trust counts, finite confidence averaging, and freshest lag selection out of `buildSummary`.
- Scope: `apps/web/lib/sources-read-model.ts`, `test/sources-read-model.test.mjs`, and `PROJECT_PROGRESS.md`.
- Initial gate: `npm test -- test/sources-read-model.test.mjs` failed as expected because `summarizeCoverageTrust`, `averageFinite`, and `freshestLagMinutes` were absent and summary aggregation still filtered/reduced inline.
- Validation: `npm test -- test/sources-read-model.test.mjs` passed: 60 tests. `npm run web:typecheck` passed.
- Risk: low behavior risk; existing read-model tests still cover source ordering, fallback summaries, note/error priority, volatility labels, and coverage supplement precedence. No release, deploy, sync, push, PR, API, package, infra, or lockfile changes were made.

## 2026-05-02 Release Safety Gate Sweep

### Completed

- Fixed `npm run automation:plan:check` so the no-argument package gate validates the checked-in safe-local automation task example instead of exiting with usage.
- Fixed `npm run automation:scope:check` so the no-argument package gate performs a non-mutating command smoke check against the same example and `HEAD`.
- Aligned `automation-scope-check` task loading with `automation-plan-check` so both accept a single task object, an array, or `{ "tasks": [...] }`.
- Added regression coverage for both no-argument automation gate entrypoints.

### Verification

- `node --experimental-strip-types --test test/automation-plan-check.test.mjs test/automation-scope-check.test.mjs` passed: 8 tests.
- `npm run automation:plan:check` passed.
- `npm run automation:scope:check` passed.
- `npm run api:openapi:check` passed.
- `npm test` passed: 56 tests.

### Boundary

- Changed only automation check scripts, their Node tests, and this progress record.
- Did not run release, publish, push, deploy, node sync, Docker, SSH, rsync, or approval-token flows.

## 2026-05-02 Refactoring Strategy Baseline

### Completed

- Added `docs/REFACTORING_STRATEGY.md` as the recurring JetScope refactoring policy.
- Captured the default rhythm: weekly or biweekly structural audits, one subsystem per change, and evidence-ranked candidates instead of date-driven file merges.
- Documented merge, split, deletion, and validation rules for API services, web read models, UI components, compatibility layers, release scripts, and sync scripts.
- Linked the strategy from `docs/product-architecture.md` and `README.md` so future product and architecture work can discover it.
- Aligned the README release sequence with the current `scripts/release.sh` behavior: production deploy is triggered from `/opt/jetscope` through `bash ./scripts/auto-deploy.sh`, so the procedure does not depend on the remote executable bit.

### Verification

- `git diff --check -- docs/REFACTORING_STRATEGY.md docs/product-architecture.md README.md PROJECT_PROGRESS.md` passed.
- `npm test -- test/automation-plan-check.test.mjs test/automation-scope-check.test.mjs` passed: 56 Node tests.

### Boundary

- Documentation/process change only.
- No runtime code, tests, release scripts, sync scripts, publish, push, deploy, or node sync was changed or executed.

## 2026-05-01 Source Coverage Release

### Completed

- Merged PR #42 with the German Lufthansa market provenance moved to canonical `/api/sources` coverage metrics, source coverage fetch decoupled from market value rendering, and public-safe source error codes on market/source coverage APIs.
- Merged PR #41 with the Dependabot PostCSS patch update from `8.5.10` to `8.5.12`.
- Released `ee908f233f8d40cf8cef144971cdf8e4aa7743b7` to `usa-vps:/opt/jetscope` with commit-pinned deploy.
- Updated `scripts/release.sh` to invoke the remote deploy script through `bash ./scripts/auto-deploy.sh` so release does not depend on the production checkout executable bit for `scripts/auto-deploy.sh`.

### Verification

- PR #42 and PR #41 GitHub CI and CodeQL checks passed before merge.
- `npm run preflight` passed locally after installing the missing Playwright Chromium browser cache.
- Release preflight passed during `npm run release`.
- VPS deploy fast-forwarded `/opt/jetscope` from `234d589e` to `ee908f23`.
- Final production checks passed: VPS local API health `200`, public web `200 text/html`, public API proxy `200 application/json`, `jetscope-web.service` active, and `jetscope-api` container up.

### Notes

- The first release deploy trigger failed because the production checkout had `scripts/auto-deploy.sh` without an executable bit; the same approval-gated deploy was completed by invoking the script through `bash`.
- No development worker sync was executed.

## 2026-04-30 German Lufthansa Source Coverage Cleanup

### Completed

- Updated `apps/web/app/de/lufthansa-saf-2026/client-market-data.tsx` so market card provenance comes from canonical `/api/sources` coverage metrics rather than legacy `market_snapshot.source_details`.
- Kept market values on `/api/market` and made source coverage fetch failure degrade gracefully without hiding the market card values.
- Added a regression contract in `test/proxy-route-contract.test.mjs` that requires the page to read `/api/sources` and forbids `source_details` dependency.

### Verification

- `node --experimental-strip-types --test test/proxy-route-contract.test.mjs` passed: 2 tests.
- `npm test` passed: 54 tests.
- `npm run web:typecheck` passed.
- `git diff --check -- apps/web/app/de/lufthansa-saf-2026/client-market-data.tsx test/proxy-route-contract.test.mjs PROJECT_PROGRESS.md` passed.

### Boundary

- No push, PR, merge, deploy, worker sync, VPS mutation, launchctl action, or secret access was performed.

## Project Dashboard

| Area | Status | Risk | Current boundary | Next action |
| --- | --- | --- | --- | --- |
| `projects/jetscope` | PR #41 and PR #42 merged; local main aligned | Low | No deploy/sync performed after merge checks; project worktree clean | Continue with normal feature work only after new task selection |
| `projects/esg-research-toolkit` | Local/remote cleanup complete | Low | Clean main; no public action unless requested | Optional mirror/history cleanup only with explicit intent |
| `projects/sustainos` | Local-only boundary strengthened | High | Root ignores `projects/`; project ignore/guard classify runtime, personal, review, DB, venv, and operator artifacts; no VPS/control-plane readback, rollout, promote, pullback, or sync | Decide whether to approve remote/control-plane recovery or continue local source review |
| `projects/career-ops` | Personal artifacts classified local-only | Medium | Private/local; no personal artifacts prepared for publication | Review remaining source candidates before any commit |
| `projects/us-site` | Stable static entrypoint | Low | Static entry for `meichen-web`; do not grow backend here | Leave parked unless static content changes are needed |
| `projects/meichen-web` | Local/private recovery snapshot classified | Medium | Root ignores `projects/`; local boundary files classify source candidates vs queue/runtime/operator state | Decide whether to rebuild source repo or keep archived local runtime snapshot |
| `projects/home-lab-app` | Private control-plane boundary classified | Medium | Root ignores `projects/`; local boundary files classify source candidates vs runtime/monitoring/build artifacts | Decide whether to initialize/restore an independent repo boundary |
| `projects/obsidian-knowledge-pipeline` | Local Obsidian utility boundary classified | Medium | Root ignores `projects/`; local boundary files keep vault config/log/runtime state private | Decide whether to keep as local utility or rebuild source repo from reviewed scripts |
| `machine-label-ocr` | Standalone nested Git project, root-hidden | Medium | Root ignores this nested repo; project contains local OCR uploads/runtime/build artifacts and must be handled from its own Git boundary | Review and clean its own dirty worktree before any commit or packaging |

## Completed Today

- Closed JetScope PR #42 for Lufthansa source coverage provenance. The branch was updated against `origin/main`, CI and CodeQL passed, PR #42 merged, and local JetScope `main` was later aligned with `origin/main`. No deploy, sync, release, or VPS mutation was performed.
- Closed JetScope PR #41 for Dependabot `postcss 8.5.10 -> 8.5.12`. Review found a `package-lock.json` workspace spec mismatch; it was fixed to pin `postcss` as `8.5.12`, pushed to the PR branch, CI and CodeQL passed, and PR #41 merged.
- Repaired tools/automation dedup recommendations locally after `/next` suggested cancelling terminal tasks. `task-similar-dedup.py` now only considers non-terminal tasks, and `next-action-recommender.py` only emits `cancel_dedup` for active tasks. Validation passed and `/next` reports no recommendations.
- Reclassified a narrow `tools/automation` source opening in root `.gitignore`: only the two dedup source scripts are visible; `tools/automation/runtime/`, local docs, reports, and other `tools/` content remain ignored/local-only.
- Dry-run checked root Obsidian inbox scripts without moving vault files. Generated manifests/summaries under `/Users/yumei/obsidian-audit-output/` remain local/private and must not be committed or synced.
- Closed the tools/automation Phase F dry-run loop for OpenCode-discovered work: four discovery drafts were imported into dev-control, advanced to `planned` with `plan` approval only, and validated through the full-chain dry-run path. No push, PR, merge, deploy, remote mutation, or real execute-local approval was performed.
- Added Phase F Telegram preview-only control surfaces in tools/automation: `/bug_discovery_preview`, `/task_loop_plan`, `phasef:bug`, and `phasef:processor`. No import/apply/execute-local/Git/remote mutation was performed.
- Created and extended `/Users/yumei/PLANS.md` as the optimization plan and backlog.
- Closed JetScope local baseline: strengthened ignore rules, aligned release entrypoint documentation, aligned node-sync excludes with local/sensitive ignore rules, added project progress/incident entrypoints, and verified API compile, node tests, web typecheck, script syntax, traceability coverage, and independent reviews.
- Classified ESG Toolkit local-only artifacts and updated guard policy for git-ignored scratch routers.
- Refreshed AI systems registry and created Windows/OpenCode handoff guides for parallel development.
- Restored the daily AI tools check chain by recreating `/Users/yumei/scripts/daily_ai_tools_update_check.py` and `/Users/yumei/scripts/ops_hub.sh`; `ops_hub.sh run-profile daily` refreshes the registry, regenerates the AI tools report, and writes an ops daily journal.
- Fixed project traceability coverage across `projects/*` and classified `machine-label-ocr` as a standalone nested Git project outside `projects/`.

## Root Source/Runtime Classification Update

The root `/Users/yumei` Git boundary remains intentionally narrow. Visible root source candidates include governance docs and reviewed scripts under `scripts/`. Local-only/generated areas include `projects/`, `machine-label-ocr/`, `tools/automation/runtime/`, Obsidian vault paths, AI tool state, logs, caches, and backups.

New or currently visible source candidates:

- `scripts/obsidian_vault_inbox_stub_cleanup.py`: local Obsidian vault cleanup helper. Defaults to dry-run, writes reports under `/Users/yumei/obsidian-audit-output`, and only mutates the vault with explicit `--apply`.
- `scripts/obsidian_vault_inbox_topic_route.py`: local Obsidian 0-INBOX topic routing helper. Defaults to dry-run, writes reports under `/Users/yumei/obsidian-audit-output`, and only moves vault notes with explicit `--apply`.
- `tools/automation/scripts/task-similar-dedup.py`: local automation dedup preview source. It writes under `tools/automation/runtime/` and does not execute cancellations.
- `tools/automation/scripts/next-action-recommender.py`: local automation `/next` recommendation source. It writes under `tools/automation/runtime/` and only recommends `cancel_dedup` for active tasks.

Do not commit/push Obsidian reports or vault-derived outputs. Do not run Obsidian helpers with `--apply` without explicit approval.

## Current Blockers

- Root `/Users/yumei` shares the JetScope Git remote but also carries local workspace governance commits. Root reconciliation must preserve local-only boundaries and must not push blindly.
- Root remote history contains many JetScope application commits; root local commits add governance/source files on top. Treat pushes from root as blocked unless a separate branch/PR plan is approved.
- Root `.gitignore` hides home/config/runtime project surfaces such as `projects/`, `machine-label-ocr/`, `tools/automation/runtime/`, `.Trash/`, `.cc-switch*`, `.gitconfig`, `.viminfo`, AI runtime state, and deploy config. Treat remaining visible files as explicit governance/source candidates only.
- Root `scripts/README.md` describes root workspace operations instead of JetScope project scripts.
- AI tools daily report refreshes locally, accepts local-file-only alerting by policy, writes a local-file fallback alert, and can send external alerts through HTTPS webhook or Telegram when env vars are configured.
- Windows daily inventory uses a native PowerShell SSH probe and reports Windows tool versions plus disk/memory data.
- `/Users/yumei/scripts/ai_cluster_preflight.py` is still missing; `daily-runner.sh` logs this and continues with the existing `.omx/cluster/ai-cluster-status.json` snapshot.
- VPS AI worker policy has a local drift guard in `/Users/yumei/tools/automation/scripts/validate-workspace-automation.sh`; it fails if `.omx/cluster` status/policy snapshots reintroduce `usa-vps` or `france-vps` as AI dispatch hosts.
- SustainOS remains high-risk because it mixes product modules, ops scripts, remote/control-plane scripts, runtime state, and many untracked files.
- Career Ops personal/job artifacts remain local/private; remaining source candidates need review before publication.
- Meichen Web, Home Lab App, and Obsidian Knowledge Pipeline remain private/local under the root `projects/` ignore until explicitly reclassified.

## Verification Evidence

### JetScope

- PR #42 merged after CI and CodeQL passed.
- PR #41 merged after CI and CodeQL passed.
- Local JetScope `main` aligned with `origin/main` after PR #41.
- `npm test` passed: 54 tests.
- `npm run web:typecheck` passed.
- `npm run api:check` passed.
- `scripts/security_check.sh` passed using the built-in scan because `gitleaks` is not installed.
- `scripts/review_push_guard.sh origin/main` passed with no outgoing file changes after local `main` alignment.

### AI Tooling

- `scripts/automationctl status` passed with `ok=True failed_steps=0`, `dedup_active=0`, and `suggestions=0` after the local dedup fix.
- `python3 /Users/yumei/tools/automation/scripts/next-action-recommender.py --json` returned `当前没有可推荐动作`.
- `python3 /Users/yumei/tools/automation/scripts/task-similar-dedup.py --self-test` passed.
- `python3 /Users/yumei/tools/automation/scripts/next-action-recommender.py --self-test` passed.
- `/Users/yumei/tools/automation/scripts/automationctl validate` passed after the local dedup fix.
- `python3 /Users/yumei/tools/automation/scripts/refresh_ai_systems_registry.py --write` passed.
- `/Users/yumei/tools/automation/workspace-guides/ai-systems-registry.json` updated to 2026-04-24.
- `/Users/yumei/scripts/daily_ai_tools_update_check.py`, `/Users/yumei/scripts/internal_device_update_orchestrator.py`, and `/Users/yumei/scripts/ops_hub.sh` are classified as root workspace source candidates.
- `python3 -m py_compile /Users/yumei/scripts/daily_ai_tools_update_check.py` passed.
- `python3 -m py_compile /Users/yumei/scripts/internal_device_update_orchestrator.py` passed.
- `bash -n /Users/yumei/scripts/ops_hub.sh` passed.
- `python3 /Users/yumei/scripts/internal_device_update_orchestrator.py --targets local --dry-run --print-json` passed without executing updates.
- `python3 /Users/yumei/scripts/daily_ai_tools_update_check.py` passed with `overall=ok` at `20260425-095130`.
- `bash /Users/yumei/scripts/probe-gpt55-authenticity.sh --help` passed.
- `bash /Users/yumei/scripts/ops_hub.sh run-profile daily` passed and generated local runtime reports under `tools/automation/runtime/`.
- Windows-native PowerShell probe is verified in the latest report: `windows-pc` is online with Windows tool inventory and disk usage.
- Local-file fallback alert is generated under `tools/automation/runtime/ai-tools-update-check/alerts/`; external alert delivery supports HTTPS webhook or Telegram env vars without persisting tokens.
- Workspace automation validation covers daily check, ops hub, generated reports, Windows probe, alert policy, ops journal, auto-refactor Python compatibility, high-risk shell syntax, and Windows handbook reachability.

## 2026-04-30 Obsidian Local Bridge

### Completed

- Added a local-only Obsidian bridge policy at `docs/obsidian-local-bridge.md`.
- Added `scripts/obsidian_workspace_bridge.py`, a one-way project-index generator for the local vault.
- Extended root ignore rules so Obsidian vaults, generated ingest notes, diagnostics, logs, and bridge output stay out of GitHub and remote sync surfaces.

### Boundary

- The bridge writes only workspace/project metadata into `/Users/yumei/Obsidian/MyKnowledgeVault/30-AI-Ingest/workspace-project-index.md`.
- No vault note bodies, `.obsidian/` config, env files, logs, or generated ingest state should be copied into project source.
- Project-level `.gitignore` files keep their own Obsidian/vault exclusions where those projects have independent Git repositories.

### Source/Local Classification

- Source candidates: `docs/obsidian-local-bridge.md`, `scripts/obsidian_workspace_bridge.py`, `scripts/obsidian_vault_audit.py`, and `scripts/obsidian_vault_repair_plan.py`.
- Generated/local-only: `obsidian-audit-output/`, Obsidian vault paths, generated ingest notes, vault diagnostics, and bridge output.
- `scripts/opencode-model-resolver.py` is a root source candidate only if the root workspace keeps shared OpenCode helpers here; otherwise move it into `tools/automation/scripts/` in a later bounded task.
- Do not publish or sync vault-derived reports before privacy review; audit reports may contain note titles, paths, tags, links, and excerpts.

## Next Queue

1. Finish root Git reconciliation on top of `origin/main`; preserve root governance files and keep push blocked until a separate branch/PR decision is approved.
2. Review `/Users/yumei/machine-label-ocr` as its own project: classify `.omx`, uploads, local DB/storage, dist, logs, and release artifacts before any nested-repo commit or packaging.
3. Review remaining Career Ops source candidates (`literature-ops/`, `literature-workflow.mjs`, `optimize-before-scan.mjs`, `scripts/`, and docs) before any commit.
4. Keep Obsidian inbox manifests/summaries and vault-routing scripts local/private until a dedicated privacy review approves any publication.
5. Decide whether `meichen-web` should be rebuilt as a source repo or kept as archived local runtime/worker state.
6. Decide whether `home-lab-app` should initialize/restore an independent repo boundary from reviewed source candidates.
7. Decide whether `obsidian-knowledge-pipeline` remains a local utility or becomes a source repo from reviewed scripts only.
8. For SustainOS, choose either local source-candidate review or explicitly approve remote/control-plane recovery; do not run sync/rollout/pullback/readback by default.
9. Optionally classify/retire residual `usa-vps` shell-profile `.opencode` PATH and stale `.omx`/`.codex` history in a later approved remote cleanup pass; do not perform remote mutation without explicit approval.
10. Run `/Users/yumei/tools/automation/scripts/validate-workspace-automation.sh` after future automation edits.

## Operating Rules

- No commit or push unless explicitly requested.
- No destructive Git operations.
- No remote sync, rollout, pullback, install, uninstall, or VPS cleanup without explicit approval.
- Do not read or print secret contents; classify paths and policies instead.
- Prefer local verification and read-only reviews for cleanup tasks.
