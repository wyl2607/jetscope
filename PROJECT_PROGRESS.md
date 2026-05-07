# JetScope Project Progress

## 2026-05-07 SAF Tipping Point Light UI Gate

- Purpose: remove the remaining dark-shell regression on `/crisis/saf-tipping-point` and verify the interactive SAF analysis page against real browser behavior.
- Changes: added a focused light-theme contract covering the Shell and SAF workbench surfaces, converted the SAF page, workbench cards, charts, pathway table, simulator, and airline decision matrix to a light reading theme, and replaced raw recompute/save errors with user-facing fallback copy.
- Front/back-end alignment: started the local FastAPI dev service with an isolated SQLite database and disabled background refresh, then verified Next `/api/analysis/tipping-point` and `/api/analysis/airline-decision` proxy requests return HTTP 200 with live analysis payloads.
- Browser evidence: Browser Use reloaded the current page, confirmed no `fetch failed` or raw `分析失败`, showed a light Shell/header/hero, clicked `使用实时值`, and manually changed fuel/blend inputs; URL state and analysis results updated through the FastAPI-backed proxy.
- Validation: `npm test -- test/tipping-point-workbench-contract.test.mjs` passed all 64 tests; `npm run web:typecheck` passed; targeted `git diff --check` passed.
- Boundary: no push, PR, release, deploy, node sync, SSH, rsync, lockfile, env, or database artifact changes were made.

## 2026-05-07 AI UI Verification Chain

- Purpose: make the browser-led UI optimization loop durable instead of leaving it as chat-only practice.
- Changes: added a plan-first execution file at `docs/exec-plans/2026-05-07-ai-ui-verification-chain.md`, added JetScope `AGENTS.md` rules for Browser Use UI evidence and verified local commit closure, and updated workspace skill-chain guidance to require browser evidence for frontend/UI work.
- Commit policy: verified current-task source/docs changes should be committed locally by default after dirty-tree classification and gates pass; mixed dirty trees must be sliced by purpose and never staged wholesale.
- Validation: plan-first validation passed, JSON validation passed, JetScope diff-check passed, and workspace skill-chain diff-check passed. ai-trace solution/session write-back completed.
- Boundary: workspace skill-chain files live under locally ignored `/Users/yumei/tools/automation/*`, so they were updated as local AI operating guidance and not force-added into the root repo.
- Next: commit the JetScope docs-only guidance slice locally; remote push/PR/release remain unapproved.

## 2026-05-07 Interactive UI / Human Factors Pass

- Purpose: start an interactive browser-led UI optimization loop for JetScope rather than relying only on command-line gates.
- Findings: mobile header navigation compressed into two visually noisy rows; dashboard/scenario degraded API states exposed internal error strings; homepage hero explained the thesis but did not present an immediate next action.
- Changes: refined `Shell` header responsiveness and horizontal mobile nav, replaced dashboard/scenario fallback text with user-facing status language, softened client market-timeline failure handling, added homepage primary CTAs for cockpit/scenario/source quality, shifted the shell to a light reading theme, cleaned Germany price/source fallback wording, and made price/source trace links navigate reliably in the browser.
- Front/back-end alignment: added bounded upstream timeouts to Next API proxies, changed scenario-by-id proxy lookup to hit the exact FastAPI route instead of fetching the whole list, and shortened SSR read-model fallback waits from 5s to 2s by default.
- Validation: `npm run web:typecheck` passed. `npm test -- test/product-read-model.test.mjs test/sources-read-model.test.mjs test/portfolio-read-model.test.mjs test/proxy-route-contract.test.mjs` passed via the package test command (62/62). Browser Use verified Sources -> Dashboard, Dashboard -> Germany price (~2.3s after parallelization), and Germany price -> Sources focus navigation with no console errors.
- Next: decide whether to remove the dead `/api/analysis` and duplicate `/api/reserves` proxy surfaces in a small API hygiene slice.

## 2026-05-06 Overnight Codex Refactor — Complete

- 2026-05-07T08:36  JS-REF-004  DONE  Extracted ResearchSignal subsystem from `apps/web/lib/portfolio-read-model.ts` into new `apps/web/lib/research-signals-read-model.ts`. Moved types `ResearchSignal`/`ResearchSignalsResult`/`ResearchDecisionBrief`, const `AI_RESEARCH_ENABLED`, fns `getResearchSignals`/`buildResearchDecisionBrief`. portfolio-read-model.ts 319→111 (-208); research-signals-read-model.ts 267 new. Updated 5 callers (page.tsx, research/page.tsx, reports/tipping-point-analysis/page.tsx, crisis/page.tsx, components/research-decision-brief.tsx) and `test/portfolio-read-model.test.mjs`. No re-export shim — all callers retargeted directly. Validation: 62/62 npm test green, web:typecheck green, diff-check clean. ⚠ Two private helpers (~40 LOC) duplicated between portfolio and research-signals modules; future cleanup goal can fold into shared `lib/portfolio-fetch.ts`.
- 2026-05-07T08:16  JS-REF-003  DONE  Split `apps/web/app/analysis/lufthansa-flight-cuts-2026-04/page.tsx` (507 lines) by extracting all pure data/constants/long-text-arrays into sibling `apps/web/app/analysis/lufthansa-flight-cuts-2026-04/data.ts` (191 lines new). page.tsx 507→298 (≤300 target met). Added smoke gate `test/lufthansa-flight-cuts-data.test.mjs` (3 tests, RED→GREEN). 62/62 npm test green, web:typecheck green, diff-check clean. ⚠ Render parity is structural not byte-exact: a few inline JSX paragraphs now go through a `<RichP>` helper that wraps non-bold segments in `<span>` instead of bare text nodes; semantically identical, no visual regression expected, but no snapshot tests exist for this page.
- 2026-05-07T07:00  JS-REF-002  DONE  Extracted PriceTrendChart read-model from `apps/web/lib/product-read-model.ts` into new `apps/web/lib/price-trend-chart-read-model.ts`. Moved `PriceTrendChartData`, `PriceTrendChartReadModel`, `getPriceTrendChartReadModel`. product-read-model.ts 296→247 (-49); price-trend-chart-read-model.ts 62 new. Updated callers: `apps/web/app/prices/germany-jet-fuel/page.tsx`, `apps/web/app/crisis/eu-jet-reserves/page.tsx`. Re-export shim retained in product-read-model.ts because `apps/web/app/dashboard/page.tsx` was in JS-REF-002 forbidden list. Validation: 62/62 focused tests green, web:typecheck green, diff-check clean. No commit/push/remote.
- 2026-05-06T22:36  JS-REF-001  DONE  Extracted Dashboard read-model from `apps/web/lib/product-read-model.ts` into new `apps/web/lib/dashboard-read-model.ts`. Moved `DashboardReadModel`, `getDashboardReadModel`, and helpers (`computeFreshnessSignal`, `computeTopRiskSignal`, `fallbackReadModel`, `envThreshold`, `FRESHNESS_*`). product-read-model.ts 490→296 lines (-194); dashboard-read-model.ts 231 new. Re-export at the bottom of product-read-model.ts preserves 6 unchanged callers. Validation: 60/60 focused tests green, web:typecheck green, diff-check clean. Allowlist respected. No commit/push/remote. Runbook: `docs/exec-plans/2026-05-06-overnight-codex-refactor-runbook.md`.

## Current Status

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

## 2026-05-06 Germany Jet Fuel Read-Model Refactor Gate

- Purpose: continue the bounded refactor loop by extracting the Germany Jet Fuel read-model out of `apps/web/lib/product-read-model.ts` into its own stable subsystem boundary, so unrelated dashboard, price-trend, and Germany surfaces stop sharing one 665-line module.
- Intent: keep `/prices/germany-jet-fuel` and `/de/prices/germany-jet-fuel` UI/API behavior unchanged while moving the Germany types, helpers, and `getGermanyJetFuelReadModel` into `apps/web/lib/germany-jet-fuel-read-model.ts`, importing the still-shared metric helpers from `product-read-model.ts` rather than duplicating them.
- Scope: `apps/web/lib/germany-jet-fuel-read-model.ts` (new), `apps/web/lib/product-read-model.ts`, `apps/web/app/prices/germany-jet-fuel/page.tsx`, `apps/web/app/de/prices/germany-jet-fuel/page.tsx`, `test/helpers/load-web-lib.mjs` (alias rewrite extended to cover `@/lib/product-read-model` so the new module can import shared symbols under the Node test loader), and `test/product-read-model.test.mjs` (acceptance gate import path).
- Initial gate: `npm test -- test/product-read-model.test.mjs` failed as expected because `apps/web/lib/germany-jet-fuel-read-model.ts` did not exist yet (ENOENT under the test loader).
- Validation: `npm test -- test/product-read-model.test.mjs` passed: 60 tests. `npm run web:typecheck` passed. `git diff --check -- apps/web/lib/germany-jet-fuel-read-model.ts apps/web/lib/product-read-model.ts apps/web/app/prices/germany-jet-fuel/page.tsx apps/web/app/de/prices/germany-jet-fuel/page.tsx test/helpers/load-web-lib.mjs test/product-read-model.test.mjs` passed. `product-read-model.ts` shrank from 665 to 490 lines, `germany-jet-fuel-read-model.ts` is 153 lines, total 643 lines (-22 net) with the eight previously duplicated helpers/constants now imported instead of copied.
- Risk: low behavior risk; existing read-model tests still cover Germany EU proxy fallback, freshness signal, top-risk signal, and dashboard fallback. No release, deploy, sync, push, PR, API, package, infra, or lockfile changes were made.

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

## 2026-04-29 Source Coverage Supplement Review

### Completed

- Reviewed the current dirty source/test set for source coverage display supplements.
- The API now inlines `error`, `note`, `cbam_eur`, and `usd_per_eur` on `/v1/sources/coverage` metrics instead of requiring the web read model to bridge from snapshot `source_details`.
- The web read model now treats `/sources/coverage` as the canonical source for display supplements and no longer reads snapshot `source_details` for notes or degraded reasons.
- Obsidian/local-only bridge artifacts are ignored locally, excluded from node sync packages, and included in post-sync blocked-path readback so historical node remnants fail closed.
- Added API and web regression coverage for coverage-metric `error` propagation and highest-priority display over snapshot `source_details` supplements.

### Verification

- `npm test -- --test-name-pattern=sources-read-model` passed: 53 tests.
- `cd apps/api && .venv/bin/python -m pytest tests/test_market_contract_v1.py -q` passed: 3 tests.
- `npm run web:typecheck` passed.
- `npm run api:check` passed.
- `git diff --check` passed.
- `bash -n scripts/sync-excludes.sh scripts/sync-to-nodes.sh` passed.

### Boundary

- No publish, push, PR, deploy, node sync, or release action was performed.
- External Codex review was attempted but tool-side execution failed or timed out; independent read-only review found sync readback and `error` test gaps, both fixed before final focused validation.

## 2026-04-28 PR #39 Release Approval Hardening Deploy

### Completed

- Merged PR #39 as `234d589e Harden release approval gates (#39)` after CI and CodeQL passed.
- Added approval-gated release, publish, deploy, rollback, sync, PR merge, and health restart flows.
- Added approval token replay protection through `scripts/approval-token-ledger.sh`, including derived child tokens for release side effects.
- Released `234d589e` to `usa-vps:/opt/jetscope` with commit-pinned deploy.

### Verification

- `npm run release` preflight passed: web gate, API compile, 85 backend pytest tests, OpenAPI check, 53 Node tests, product smoke, and UI E2E.
- Direct publish path found no new commits after PR #39 merge and push gates passed.
- VPS deploy fast-forwarded `/opt/jetscope` to `234d589e`.
- Final production checks passed: local API health `200`, public web `200 text/html`, public API proxy `200`, `jetscope-web.service` active, `jetscope-api` container up.

### Notes

- The first deploy attempt failed closed because the VPS production checkout had uncommitted copies of earlier `infra/server/health-check.sh` and `scripts/auto-deploy.sh` hardening changes.
- The dirty VPS diff was backed up to `usa-vps:/root/jetscope-deploy-backups/20260428T202130Z-pre-pr39-dirty`, then the production checkout was reset to clean `HEAD` before retrying deploy.
- No development node sync was executed.

## 2026-04-25 Safe-Local Automation Trial Prep

### Completed

- Added `docs/automation-safe-local-task-example.json` as the first bounded low-risk automation task contract.
- Updated `docs/AUTOMATION_LOOP.md` so the first autonomous write trial is documentation-only and explicitly blocks release, deploy, sync, SSH, rsync, publish, push, and merge actions.
- Narrowed the example task scope to `PROJECT_PROGRESS.md`, `docs/AUTOMATION_LOOP.md`, and the task JSON itself, with a tracked/untracked changed-file check and stop conditions against weakening guardrails or creating/modifying ignored forbidden artifacts relative to the controller pre-run snapshot.

### Verification

- `python3 -m json.tool docs/automation-safe-local-task-example.json >/dev/null`
- `test -f docs/AUTOMATION_LOOP.md`
- `(git diff --name-only HEAD; git ls-files --others --exclude-standard) | sort -u | grep -Ev '^(PROJECT_PROGRESS.md|docs/AUTOMATION_LOOP.md|docs/automation-safe-local-task-example.json)$' >/tmp/jetscope-safe-local-scope.err && exit 1 || test $? -eq 1`

### Impact

- JetScope now has a concrete safe-local task seed that can exercise automation planning without changing runtime behavior or touching high-risk operational scripts.

## 2026-04-25 Approval-Gated PR Merge Prep

### Completed

- Added `scripts/pr-approval-gate.mjs` as a fail-closed PR readiness and merge approval gate.
- Added `npm run pr:approval:gate` as the default read-only command for PR merge readiness reports.
- Documented explicit merge approval: actual merge requires `--execute`, `--approval-token`, and matching `APPROVE_JETSCOPE_PR_MERGE`.
- Added `pr:approval:gate` to `package.json` so the documented command resolves.
- Hardened direct publish against post-gate HEAD drift by pushing the gated `LOCAL_COMMIT` SHA and aborting if HEAD changes after gates.
- Hardened production auto-deploy so `JETSCOPE_EXPECT_COMMIT` is mandatory, keeping PR merge approval separate from deploy approval.
- Updated release, publish, and sync examples to include explicit approval tokens.
- Added direct sync approval gates to `sync-to-nodes.sh` and `sync-from-node.sh`, while preserving `sync-to-nodes.sh --dry-run` as approval-free preview.
- Updated PR approval gate to run local push gates when `--local-preflight-ok` is provided, instead of only checking that gate files exist.
- Added rollback approval gate with `APPROVE_JETSCOPE_ROLLBACK`, and made health-check service restart observe-only unless `JETSCOPE_HEALTH_ALLOW_RESTART=1` is explicitly set.
- Added deploy approval gate with `APPROVE_JETSCOPE_DEPLOY` to `auto-deploy.sh`, and strengthened health-check restart opt-in so it also requires matching `JETSCOPE_HEALTH_RESTART_TOKEN` and `APPROVE_JETSCOPE_HEALTH_RESTART`.
- Restricted the release SSH target to the approved production host alias `usa-vps` before invoking remote deploy.
- Hardened rollback to require the production checkout to be on `main`, require a clean production checkout, and removed stash/pop reapplication of local state.
- Added `scripts/approval-token-ledger.sh` so side-effect scripts hash-record approval tokens and reject replay on the same machine.
- Derived publish, sync, and deploy child tokens from the release approval token so a release token is not directly reused across action types.

### Verification

- `node scripts/pr-approval-gate.mjs --help`
- `bash -n` is not applicable to the Node script; syntax is checked by Node help execution.
- `git diff --check` passed.
- `bash -n scripts/release.sh scripts/publish-to-github.sh scripts/auto-deploy.sh scripts/rollback.sh scripts/sync-to-nodes.sh scripts/sync-from-node.sh infra/server/health-check.sh` passed.
- `npm test` passed: 45 Node tests.
- `npm run preflight` passed: web gate, API compile, 85 backend pytest tests, OpenAPI check, Node tests, product smoke, and UI E2E.
- `./scripts/security_check.sh` passed using the built-in fallback scan because `gitleaks` is not installed.
- `./scripts/review_push_guard.sh origin/main` failed as expected while this approval-gate change remains uncommitted in the dirty worktree.

### Impact

- The automation system can now develop and review toward a PR, then stop at `AWAIT_HUMAN_MERGE` until a human supplies the explicit approval token.
- The gate blocks draft PRs, non-`main` bases, unapproved reviews, non-mergeable PRs, failed or pending checks, high-risk file changes, and missing local push gates before any merge execution path can run.

## 2026-04-25 Backend Pytest Restoration

### Completed

- Verified system `python3 -m pytest` is not usable because Homebrew Python 3.14 has no pytest installed.
- Verified project venv pytest is usable: `apps/api/.venv/bin/python -m pytest tests` passed all backend tests.
- Added `npm run api:test` so backend pytest has a stable project-local entrypoint.
- Added `npm run api:test` to `npm run preflight` after `api:check` so compile-only validation is no longer the only API gate.

### Verification

- `.venv/bin/python -m pytest tests` passed: 80 tests.

### Impact

- Future API validation should use `npm run api:test` for backend behavior and `npm run api:check` only for Python compile/syntax checking.
- The backend test gate currently depends on the existing `apps/api/.venv`; recreating the venv remains a separate environment bootstrap concern.

## 2026-04-25 Sync Hardening Update

### Completed

- Added `scripts/sync-excludes.sh` as the shared exclude source for push and pull sync scripts.
- `scripts/sync-to-nodes.sh` now sources the shared excludes instead of carrying a private list.
- `scripts/sync-from-node.sh` now uses the same exclude list for Unix pullback, reducing the risk of pulling runtime/local-only artifacts back into local.
- Windows pull packaging was expanded to match the shared exclude policy as closely as the PowerShell/tar command path allows.
- Windows opt-in push sync now performs a minimal blocked-path readback after extraction for `.env`, `.env.local`, `.envrc`, `.omx`, `.automation`, and `apps/api/data`.
- Review fixes added pullback node validation, Windows push/pull failure event emission, local/remote temporary tar cleanup, wider Windows blocked-path readback, and fail-closed release push gates.
- Final review fix moved fail-closed push gate enforcement into `scripts/publish-to-github.sh` so direct publish and release both share the same gate.
- Final sync review fixes added Unix blocked-path readback after rsync and require `--allow-vps-workdir` before pulling from `usa-vps:~/jetscope`.
- Final readback compatibility fix removed GNU-only `find -printf` and made Unix `.env.*` readback recursive for macOS/BSD nodes.

### Impact

- Future local-only/sensitive path changes should update `scripts/sync-excludes.sh` instead of duplicating exclude lists across sync scripts.
- Windows opt-in sync is still overlay handoff sync, not a clean mirror; readback catches known blocked paths but does not replace a full cleanup strategy.
- Unix sync now fails if historical blocked remnants remain after rsync; cleanup still requires a separate explicit cleanup action.
- Default `npm run release` and direct `./scripts/publish-to-github.sh` now fail before push if `scripts/security_check.sh` or `scripts/review_push_guard.sh` is missing or not executable.
- No real sync, pullback, publish, deploy, VPS cleanup, commit, or push was executed during this hardening pass.

## 2026-04-25 Push Gate Addition

### Completed

- Added `scripts/security_check.sh` as the local safety gate for blocked tracked files, visible sensitive untracked files, and credential-like staged names.
- Added `scripts/review_push_guard.sh` as the outgoing-change guard against `origin/main`.
- `scripts/publish-to-github.sh` runs both gates before any push, so direct publish and default release share the same fail-closed behavior.
- Review fixes expanded gate coverage for nested `.env*` files, explicitly allowlisted `.env.example` and `*.env.*.example`, blocked common generated artifacts from `.gitignore`, and moved gate existence checks before `web:gate`.
- Final review fixes added credential-like outgoing file checks to `scripts/review_push_guard.sh` and made `scripts/publish-to-github.sh` require current branch `main` before pushing `HEAD:refs/heads/main`.

### Impact

- Publishing now requires a clean worktree plus passing gates.
- Current local working tree is intentionally dirty while this change is in progress, so publish/release should remain blocked until reviewed and committed intentionally.

### Verification

- `bash -n scripts/security_check.sh scripts/review_push_guard.sh scripts/publish-to-github.sh scripts/release.sh scripts/sync-excludes.sh scripts/sync-to-nodes.sh scripts/sync-from-node.sh` passed.
- `./scripts/security_check.sh` passed.
- `./scripts/review_push_guard.sh origin/main` failed as expected because the worktree is dirty.
- `./scripts/release.sh --skip-preflight --skip-publish --skip-vps-deploy` passed as a local-only no-op path.
- `./scripts/release.sh --skip-preflight --skip-vps-deploy` failed before publish because the worktree is dirty.
- `git diff --check` passed.
- Final independent read-only review found no remaining severe findings. Residual risks: filename-based guards are heuristic, `origin/main` freshness still depends on fetch, and Git gates do not clean historical remote/node remnants.
- Follow-up review flagged the existing `scripts/preflight-ui-e2e.mjs` local change as a release-gate risk because it weakens admin refresh coverage; it was not changed in this sync/publish hardening pass.
- Final sync readback review found no remaining severe issue in Unix readback or `usa-vps` pull opt-in. Residual risk: readback is a known blocked-path check, not full sensitive-content scanning.

### Verification

- `bash -n scripts/sync-excludes.sh scripts/sync-to-nodes.sh scripts/sync-from-node.sh scripts/release.sh` passed.
- `./scripts/sync-to-nodes.sh --help` passed.
- `./scripts/release.sh --help` passed.
- `git diff --check` passed.
- `./scripts/release.sh --skip-preflight --skip-vps-deploy` failed closed before publish because the worktree is dirty; push gates are also enforced inside `scripts/publish-to-github.sh` before any push can run.
- `./scripts/release.sh --skip-preflight --skip-publish --skip-vps-deploy` passed as a local-only no-op verification path.

## 2026-05-07 Crisis Briefing UX Pass

### Completed

- Reframed `/crisis` from a dense control-room page into a lighter risk briefing with current read, fallback/source/confidence signals, decision signal, and two primary actions.
- Replaced user-facing internal API path errors with plain fallback language for reserve and tipping-event empty states.
- Converted the two `/crisis` primary action cards from Next `Link` to plain anchors after Browser Use clicks showed the cards did not navigate reliably in the in-app browser.
- Hardened dashboard read-model fallback so scenario-list failure no longer collapses the full dashboard/crisis model.
- Improved SAF workbench accessibility and security posture with `aria-live="polite"` status and password-style admin token input.
- Updated research-disabled copy so it explains model impact instead of exposing env-var implementation details.

### Verification

- Browser Use verified `/crisis` reload with no console errors and confirmed both primary action clicks navigate:
  - `/crisis` -> `/crisis/eu-jet-reserves`
  - `/crisis` -> `/crisis/saf-tipping-point`
- `npm run web:typecheck` passed.
- `npm test -- test/product-read-model.test.mjs test/portfolio-read-model.test.mjs test/tipping-point-workbench-contract.test.mjs test/proxy-route-contract.test.mjs` ran the project test command and passed 62 tests.
- `git diff --check -- apps/web/app/crisis/page.tsx apps/web/components/reserves-coverage-strip.tsx apps/web/components/tipping-event-timeline.tsx apps/web/lib/research-signals-read-model.ts apps/web/lib/dashboard-read-model.ts apps/web/components/tipping-point-workbench.tsx` passed.

### Follow-Up

- Browser/API evidence showed local `127.0.0.1:8000` was unavailable or half-started during the session, so `/crisis` correctly displayed fallback mode. Next backend pass should fix local API startup/data availability before claiming live crisis data.
- Deeper contract work remains: derive tipping/airline analysis params from live market/reserve values instead of fixed baselines, and split reserve `observed_at` from response `generated_at`.

## 2026-04-25 Sync/Release Boundary Update

### Completed

- `scripts/sync-to-nodes.sh` now defaults to development workers only: `mac-mini` and `coco`.
- `windows-pc` sync is opt-in through `--windows` or `--all-dev`.
- `usa-vps:~/jetscope` sync is opt-in through `--include-vps` and remains a non-production workdir.
- `scripts/release.sh` no longer runs node sync by default; production release is `preflight -> publish -> commit-pinned usa-vps:/opt/jetscope deploy`.
- Optional release sync flags were added: `--sync-workers`, `--sync-windows`, and `--sync-vps-workdir`.
- `--skip-sync` remains accepted as a legacy no-op because sync is now opt-in by default.

### Verification

- `bash -n scripts/sync-to-nodes.sh scripts/release.sh scripts/sync-from-node.sh` passed.
- `./scripts/sync-to-nodes.sh --help` passed.
- `./scripts/release.sh --help` passed after restoring the executable bit on `scripts/release.sh`.
- `git diff --check` passed.

### Impact

- Default production release no longer writes to `mac-mini`, `coco`, `windows-pc`, or `usa-vps:~/jetscope` before publishing.
- `usa-vps:/opt/jetscope` remains the production deploy target and is still protected by `JETSCOPE_EXPECT_COMMIT` in `scripts/auto-deploy.sh`.
- This first round intentionally did not change `scripts/auto-deploy.sh`, did not execute real sync, did not deploy, did not clean VPS tools, and did not push or commit.

### Next Candidates

- Extract shared push/pull excludes so `sync-from-node.sh` cannot pull back runtime/local-only artifacts missed by the push exclude list.
- Add Windows readback/sensitive-file checks after opt-in Windows sync.
- Harden `scripts/auto-deploy.sh` with explicit fetch/ff-only behavior, bounded health retry, and last-good commit/rollback support.
- Handle `usa-vps` AI tool cleanup phase 1 only after separate explicit approval.

## 2026-04-24 Development-Zone Baseline

### Completed

- Local API data is ignored through `apps/api/data/` and local SQLite ignores.
- Cross-AI traceability entrypoint is documented in `AGENTS.md`.
- `api:dev` uses the project virtualenv uvicorn path to avoid global Python drift.
- Release documentation is aligned around `npm run release` as the default operational path.
- `scripts/sync-to-nodes.sh` excludes are aligned with local-only and sensitive `.gitignore` rules so node sync does not bypass Git safety boundaries.

### Verification

- `git check-ignore -v apps/api/data apps/api/data/market.db .automation .omx apps/api/.env.api-keys` passed.
- `npm run api:check` passed.
- `npm test` passed: 16 tests.
- `npm run web:typecheck` passed.
- `bash -n scripts/sync-to-nodes.sh` passed.

### Open Items

- Publishing, VPS deploy, sync, rollback, and PR merge remain high-risk operations and require explicit approval tokens.
- Windows `tar+scp` sync prevents newly excluded files from being packaged, but it does not delete every historical excluded remnant on the Windows target; keep readback checks and use explicit cleanup before relying on Windows as a clean mirror.
- `scripts/rollback.sh` remains a `HEAD~1` recovery tool; a future last-good/artifact-first rollback would be safer for production.

## 2026-04-25 Release/Sync Boundary Close-Out

- Default `npm run release` now runs preflight, GitHub publish, then commit-pinned VPS deploy; development worker sync is opt-in.
- `scripts/sync-excludes.sh` is the shared exclude source for push/pull sync, aligned with local-only and sensitive ignore rules.
- Default `sync-to-nodes.sh` targets only `mac-mini` and `coco`; Windows and `usa-vps:~/jetscope` require explicit flags.
- Verification passed: shell syntax for release/sync scripts, sync dry-run empty paths, API compile, 16 node tests, web typecheck, and web gate.
