# JetScope Project Progress

## 2026-05-07 Reserve Evidence Chain UI

- Purpose: turn `/crisis/eu-jet-reserves` from a persuasive crisis narrative into a more auditable decision surface grounded in first-principles layers.
- Changes: added a `第一性原理证据链` section with fact, mechanism, confidence, and action layers; added institution/research links for NREL SAF, IATA Fuel, EU ETS aviation, and IEA Aviation; added an explicit model-boundary card for proxy curves, manually estimated reserves, and non-forecast use.
- Browser evidence: Browser Use reloaded `/crisis/eu-jet-reserves`, confirmed the new evidence-chain section, four layer labels, model-boundary copy, and all four external reference hrefs; no console errors were observed.
- Validation: `npm test -- test/product-read-model.test.mjs` failed first on the new evidence-chain contract, then passed all 70 Node tests after implementation; `npm run web:typecheck` passed.
- Boundary: no backend, database, migration, data refresh, push, PR, release, deploy, node sync, SSH, rsync, lockfile, or env changes were made.

## 2026-05-07 Market History Backfill

- Purpose: populate `/crisis/eu-jet-reserves` price trends with real local history so 1d/7d/30d controls behave like a trading chart instead of an accumulating placeholder.
- Sources: Brent futures daily curve from Yahoo Finance `BZ=F`; U.S. Gulf Coast jet fuel from FRED/EIA `DJFUELUSGULF`; EUA/carbon proxy curve from Yahoo Finance `CO2.L`; EU jet, Rotterdam, carbon, EU ETS, and Germany premium rows are marked as proxy/scaled in `MarketSnapshot.payload`.
- Changes: added an admin-protected `POST /v1/market/history/backfill`, public-source backfill service, idempotent row insertion into `market_snapshots`, seed-row filtering for chart history once non-seed rows exist, and a `近1天` chart window.
- Local data result: ran the backfill against `/tmp/jetscope-dev-api.db`; inserted 217 total history rows across two runs, expanding metric coverage to roughly 44 days with non-null 1d/7d/30d changes for all seven tracked metrics.
- Browser evidence: Browser Use reloaded `/crisis/eu-jet-reserves`, confirmed `近1天`, `近7天`, and `近30天` controls; clicked `德国溢价`, `近1天`, and `近30天`, confirming visible line movement, 25-28 samples in the 30-day window, `数据覆盖：本地历史约 44.3 天 / 目标 30 天`, and no console errors.
- Validation: `npm test -- test/product-read-model.test.mjs` passed all 70 Node tests; `cd apps/api && .venv/bin/python -m pytest tests/test_market_contract_v1.py -q` passed 7 tests; `npm run web:typecheck` passed; `npm run api:openapi && npm run api:openapi:check` passed.
- Compatibility: no schema migration was required; new rows are additive, old rows remain readable, duplicate backfill rows are skipped by metric/timestamp, and seed rows are ignored only for history chart series when non-seed rows are available.
- Boundary: no production database, push, PR, release, deploy, node sync, SSH, rsync, lockfile, or env changes were made.

## 2026-05-07 Reserve Trend Coverage Truthfulness

- Purpose: make the reserve page honest when the local `market_snapshots` store has not yet accumulated 7/30 days of real history.
- Evidence: local API `http://127.0.0.1:8000/v1/market/history` currently returns 6 points per tracked metric, spanning about 0.01 days from `2026-05-07T12:01:02` to `2026-05-07T12:15:23`, so the 30-day window is not actually collected yet.
- Changes: `PriceTrendsChart` now sorts valid historical points, computes actual local coverage days, marks 7/30-day window buttons as `积累中` when coverage is short, and displays `数据覆盖` with `未用模拟数据补齐` in the active-window summary.
- Browser evidence: Browser Use reloaded `/crisis/eu-jet-reserves`, confirmed `近30天积累中` and `数据覆盖：本地历史约 14 分钟 / 目标 30 天`; clicked `近7天`, `EU ETS`, and `近30天`, confirming the coverage warning follows the selected window with no console errors.
- Validation: `npm test -- test/product-read-model.test.mjs` failed first on the new coverage assertions, then passed all 70 Node tests after implementation; `npm run web:typecheck` passed.
- Boundary: no historical data was fabricated, no production database or migration changes were made, and no push, PR, release, deploy, node sync, SSH, rsync, lockfile, or env changes were made.

## 2026-05-07 Localized Trading-Style Trend Controls

- Purpose: make the reserve page history chart truthfully behave like a time-windowed market chart instead of merely labeling 1d/7d/30d summary cards.
- Changes: localized the price-trend metric buttons, added `近7天` / `近30天` / `全部历史` window controls, added left-axis and x-axis explanatory labels, added current-window sample/date/change copy, added per-metric interpretation text for Brent, carbon, EU ETS, global jet, EU jet, Rotterdam, and Germany premium, and added a reading guide beside the SAF competitiveness table.
- Browser evidence: Browser Use loaded `/crisis/eu-jet-reserves`, confirmed `阅读方式`, `当前窗口：近30天`, left/right axis copy, and Chinese metric buttons; clicked `近7天`, `碳价`, `欧盟航油`, `EU ETS`, and `近30天`, confirming the window and explanation text changed with no NaN/cy console messages.
- Validation: `npm test -- test/product-read-model.test.mjs` passed all 70 Node tests; `npm run web:typecheck` passed; targeted `git diff --check` passed.
- Boundary: no push, PR, release, deploy, node sync, SSH, rsync, lockfile, env, migration, or production database changes were made.

## 2026-05-07 EU Reserve SAF Breakpoint Chart Gate

- Purpose: fix `/crisis/eu-jet-reserves` where the current SAF breakpoint row was visually underweighted and the price-trend SVG could emit `Received NaN for cy`.
- Changes: highlighted the `$115/bbl（当前）` SAF competitiveness row as `当前拐点`, converted the key reserve/detail/trend sections to a light reading theme, clarified that 1d/7d/30d history comes from the local `market_snapshots` history store, and hardened `PriceTrendsChart` to filter invalid points and use a safe y-axis range for single-point or flat series.
- Data path: no new local database was invented; the page continues to use the existing FastAPI `/market/history` read path backed by `market_snapshots`, with the API refresh loop configured by `market_refresh_interval_seconds` and admin refresh evidence already writing `market_snapshots` rows.
- Browser evidence: Browser Use loaded `/crisis/eu-jet-reserves`, confirmed `当前拐点`, `历史价格趋势`, and `本地 market_snapshots 历史库`; then clicked Brent, carbon, EU ETS, Germany premium, EU/global/Rotterdam jet fuel trend buttons with no NaN/cy console messages.
- Validation: `npm test -- test/product-read-model.test.mjs` passed all 70 Node tests; `npm run web:typecheck` passed; targeted `git diff --check` passed.
- Boundary: no push, PR, release, deploy, node sync, SSH, rsync, lockfile, env, migration, or production database changes were made.

## 2026-05-07 Crisis Action Routing Gate

- Purpose: make `/crisis` behave like an operational branching surface, not a static explainer, by carrying current market/reserve context into follow-up actions.
- Changes: replaced the static crisis action links with three dynamic action cards: reserve detail, SAF workbench with current fuel/carbon/reserve/pathway query state, and source review at `/sources?filter=review`.
- Browser evidence: Browser Use loaded `/crisis`, confirmed the three action cards, clicked `打开 SAF 工作台` and landed on `/crisis/saf-tipping-point?fuel=0.864&carbon=82.21&subsidy=0.000&blend=6.00&reserve=2.86&pathway=hefa`, then clicked `复核数据来源` and landed on `/sources?filter=review`.
- Validation: `npm test -- test/product-read-model.test.mjs` passed all 69 Node tests; `npm run web:typecheck` passed; targeted `git diff --check` passed.
- Boundary: no push, PR, release, deploy, node sync, SSH, rsync, lockfile, env, or production database changes were made.

## 2026-05-07 SAF Source Credibility Workbench Gate

- Purpose: make `/crisis/saf-tipping-point` explain whether each SAF calculation input is live, proxy, fallback, or degraded before users tune the workbench.
- Changes: added a calculation credibility panel with five SAF input source cards, confidence/lag labels, and a direct `/sources?filter=review` review link; clarified the scenario save disabled state with visible copy and a tooltip; replaced the duplicated bottom provenance block with model-boundary guidance; removed the over-strong claim that all calculations use real-time data.
- Browser evidence: Browser Use loaded the current SAF URL, confirmed `本次计算可信度`, `5 / 5 个计算输入需要复核`, trust labels, and `输入管理令牌后可保存情景`; clicked `查看需复核来源` to `/sources?filter=review`; clicked `使用实时值`; filled the admin-token field and confirmed `保存情景` changed from disabled to enabled.
- Validation: `npm test -- test/tipping-point-workbench-contract.test.mjs` passed all 69 Node tests; `npm run web:typecheck` passed; targeted `git diff --check` passed.
- Boundary: no push, PR, release, deploy, node sync, SSH, rsync, lockfile, env, or production database changes were made.

## 2026-05-07 Sources Flow And Timestamp Gate

- Purpose: verify `/sources` as a real front/back-end provenance surface and remove misleading freshness/UI regressions.
- Findings: Browser Use showed the page worked end-to-end, but `/api/sources/coverage.generated_at` used request time while `/api/market.generated_at` used the real snapshot time, making "recently updated" appear newer than the data. The sources UI also retained dark table/panel classes and exposed machine error codes such as `fallback_used`.
- Changes: `build_source_coverage_response` now reports the underlying market snapshot timestamp, the sources page/provenance/coverage panels use the light data-review theme, and source error/status labels render as user-facing Chinese text.
- Browser evidence: `/sources?focus=carbon_proxy_usd_per_t` focused the intended metric, showed real snapshot time `2026-05-07 12:15:23`, removed the request-time `12:24/12:25` freshness illusion, and displayed `实时来源不可用，当前值来自回退路径` / `来源暂不可用` instead of raw error codes.
- Validation: `npm test -- test/sources-read-model.test.mjs` passed all 67 Node tests; `cd apps/api && .venv/bin/python -m pytest tests/test_market_contract_v1.py -q` passed 5 tests; `npm run web:typecheck` passed.
- Boundary: no push, PR, release, deploy, node sync, SSH, rsync, lockfile, env file, or production database changes were made.

## 2026-05-07 Admin UI And Data Persistence Gate

- Purpose: verify `/admin` as a real operations surface, not placeholder UI, while keeping the page readable in the light workbench theme.
- Changes: converted admin cards/forms from dark panels to light, high-contrast controls; changed the admin copy to state the real write/read contract; added a market-refresh evidence panel that reports `market_snapshots` rows written, backend source status, refresh timestamp, and `/api/market` readback timestamp.
- Backend alignment: extended `MarketRefreshResponse` with `refreshed_at`, `source_status`, `persisted_metric_count`, and `ingest`, with the refresh route counting rows persisted into `market_snapshots`.
- Browser evidence: Browser Use opened `/admin`, filled `smoke-admin-token`, clicked `触发市场刷新`, and confirmed the page displayed `market_snapshots +7`, `degraded`, and `/api/market generated_at=...`; a real interaction bug where array API responses were converted to `{}` was found and fixed.
- Database evidence: local SQLite `/tmp/jetscope-dev-api.db` advanced from `market_refresh_runs=3 / market_snapshots=21` to `5 / 35`, then to `6 / 42` after the final browser click; latest metric rows share the browser-triggered refresh timestamp.
- Validation: `npm test -- test/admin-validation.test.mjs` passed all 66 Node tests; `npm run web:typecheck` passed; `cd apps/api && .venv/bin/python -m pytest tests/test_market_contract_v1.py -q` passed; targeted browser DOM verification passed.
- Boundary: local dev API was restarted with isolated SQLite and `JETSCOPE_ADMIN_TOKEN=smoke-admin-token`; no push, PR, release, deploy, node sync, SSH, rsync, lockfile, env file, or production database changes were made.

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
## 2026-05-07 Sources Interaction QA

### Completed

- Browser Use clicked `/sources`, `focus=carbon_proxy_usd_per_t`, and the existing clear-focus flow; the focus flow worked but the matrix had no row-level next action.
- Added server-rendered source filters for `全部`, `需复核`, `回退`, `代理`, and `实时`, with counts and URL-backed state.
- Added a row-level `聚焦` action that preserves the active filter, so reviewers can narrow the matrix and then isolate one metric.
- Fixed the review-filter predicate after Browser Use exposed that read-model status is raw `ok` while page rendering localizes it to `正常`.

### Verification

- `npm test -- test/sources-read-model.test.mjs` passed: 68 tests.
- `npm run web:typecheck` passed.
- Browser Use verified `/sources -> /sources?filter=review` shows `需复核 5` and `正在显示 5 / 7`.
- Browser Use clicked carbon source `聚焦` under the review filter and verified clearing focus returns to `/sources?filter=review`.
## 2026-05-07 Crisis Data Confidence And UI Pass

### Completed

- Browser Use inspected `/crisis` and confirmed the page displayed connected reserve data but still used dark gray cards.
- Reworked the `/crisis` overview into light, semantic data cards for data time, source type, confidence, market confidence, and decision signal.
- Kept confidence honest: the current reserve signal is still `manual` at 62%, so the UI labels it as `人工估算` and `中等置信` instead of artificially raising trust.
- Updated reserve API aggregation so DB-backed official/derived reserve signals use the latest observed reserve row timestamp as `generated_at`; naive SQLite datetimes are normalized back to UTC.
- Lightened the reserve strip, tipping-event timeline, and research-decision card used on the crisis page.

### Verification

- Browser Use verified `/crisis` shows `人工估算`, `中等置信`, and `市场数据置信度：78%`.
- Browser Use clicked `/crisis -> /crisis/eu-jet-reserves` and `/crisis -> /crisis/saf-tipping-point`.
- `npm test -- test/product-read-model.test.mjs` passed: 69 tests.
- `npm run api:test -- tests/test_reserves_service.py` passed the API test suite command: 88 tests.
- `npm run web:typecheck` passed.
- `git diff --check` passed for the modified files.
