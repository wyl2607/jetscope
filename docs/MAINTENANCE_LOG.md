# Maintenance Log

This log records public-safe maintenance evidence for the JetScope repository.

## 2026-06-03

- Stabilized local reviewer bring-up: API schema bootstrap now creates the
  SQLite parent directory for relative local database URLs, and Next.js
  development defaults its server-side API proxy to `http://127.0.0.1:8000`
  when no explicit API base is configured.
- Improved first-pass UI operability: the shared shell navigation no longer
  overflows on a 390px viewport, scenario writes explain the admin-token/name
  prerequisites, and admin write actions explain why save/refresh controls are
  locked without a token.
- Hardened the first German locale slice: the shared shell now renders
  German navigation on `/de/*`, the language switcher exposes German labels,
  German market read models render localized metric/fallback labels, and the
  German dashboard, price monitor, policy timeline, and Lufthansa analysis
  avoid visible Chinese or raw internal status strings.
- Validation: `cd apps/api && .venv/bin/python -m pytest
  tests/test_bootstrap_units.py`, `node --experimental-strip-types --test
  test/api-config.test.mjs`, `cd apps/web && npm exec vitest run
  components/__tests__/shell.test.tsx
  components/__tests__/scenario-registry.test.tsx
  components/__tests__/admin-data-ops.test.tsx`, and `npm --prefix apps/web
  run typecheck` passed. Browser checks confirmed `/api/market` works under
  plain `npm run dev` and that `/`, `/dashboard`, `/scenarios`, and `/admin`
  have no horizontal overflow at 390px.
- German locale validation: `cd apps/web && npm exec vitest run
  components/__tests__/language-switcher.test.tsx
  components/__tests__/shell.test.tsx
  components/__tests__/policy-timeline.test.tsx
  components/__tests__/policy-timeline-with-market-time.test.tsx`,
  `node --experimental-strip-types --test test/product-read-model.test.mjs`,
  `npm --prefix apps/web run typecheck`, `npm --prefix apps/web run build`,
  `git diff --check`, and `scripts/security_check.sh` passed. Browser visible
  text checks confirmed `/de`, `/de/dashboard`, `/de/prices/germany-jet-fuel`,
  and `/de/lufthansa-saf-2026` have German navigation/language controls and no
  visible Chinese text.
- Upgraded `/reports` from a static report index into a live report workbench
  backed by `getDashboardReadModel()`: it now surfaces source status,
  scenario count, top risk signal, readiness posture, report entry points, and
  source-review actions before sending users into the long report.
- Reports validation: `node --experimental-strip-types --test
  test/product-read-model.test.mjs --test-name-pattern "reports landing page"`,
  `npm --prefix apps/web run typecheck`, `npm --prefix apps/web run build`,
  `git diff --check`, and `scripts/security_check.sh` passed. Browser checks
  confirmed `/reports` shows the report workbench, report links, and a
  degraded-source review hint when local market data is not fully healthy.
- Upgraded `/research` into a production-honest research workbench: it now
  shows pipeline status, signal counts, latest signal state, usage boundary,
  disabled-state enablement copy, report/source review actions, and a signal
  list without presenting disabled AI research as live analysis.
- Research validation: `node --experimental-strip-types --test
  test/product-read-model.test.mjs --test-name-pattern "research page"`,
  `npm --prefix apps/web run typecheck`, and `npm --prefix apps/web run build`
  passed. Browser checks confirmed `/research` shows the disabled-state
  boundary, report/source actions, and no self-link back to the same page.
- Fixed API bootstrap unit test isolation: the bootstrap tests now only install
  fake Alembic/SQLAlchemy/config modules when the real modules are unavailable,
  preventing `sys.modules` pollution from breaking database contract tests in
  the same pytest process.
- API isolation validation: `cd apps/api && .venv/bin/python -m pytest
  tests/test_bootstrap_units.py tests/test_market_contract_v1.py
  tests/test_sources_units.py tests/test_lane_c_e2e.py -q` passed with 40
  tests.
- Polished the Chinese dashboard/admin copy so primary UI no longer exposes
  raw `degraded/stale`-style status codes, SSR shorthand, or markdown-style
  backtick table names as user-facing text.
- Dashboard/admin validation: `node --experimental-strip-types --test
  test/product-read-model.test.mjs --test-name-pattern "dashboard and admin"`,
  `npm --prefix apps/web run typecheck`, `npm --prefix apps/web run build`,
  and `git diff --check` passed. Browser checks confirmed `/dashboard` shows
  localized source freshness/status and `/admin` renders backend table names
  as code elements without backtick text.
- Installed `gitleaks` 8.30.1 locally and reran the repository security gate.
  The first full-history scan found 13 secret-like matches only in historical
  files that are absent from the current tracked tree: removed webhook
  deployment notes, removed generated Next.js `dist` artifacts, and a retired
  `public/app.js` bundle. A tracked-content archive scan reported no current
  leaks. Added scoped `.gitleaksignore` fingerprints for those absent
  historical files so `scripts/security_check.sh` continues to fail closed on
  new findings while allowing local release-readiness checks to complete.
- Security validation: `gitleaks dir` against a temporary `git archive HEAD`
  reported no leaks in current tracked content. `scripts/review_push_guard.sh
  origin/main` passed locally with no push or remote mutation.
- Made `/sources` operationally actionable while preserving degraded-source
  honesty: the sources read model now derives a review action for live,
  proxy, fallback, unavailable, and error states; the page surfaces a
  recovery-step section with Admin refresh and review-filter entry points; and
  each source row links to either the Admin recovery path or report evidence.
- Sources action validation: `node --experimental-strip-types --test
  test/sources-read-model.test.mjs`, `npm --prefix apps/web run typecheck`,
  `npm --prefix apps/web run build`, `npm --prefix apps/web run gate`,
  `git diff --check`, and `scripts/security_check.sh` passed. Browser checks
  confirmed `/sources` renders recovery steps, Admin refresh links, row-level
  processing links, no console errors, and no horizontal overflow at the
  desktop viewport.
- Extended `/v1/readiness` into a launch-prerequisite contract: database,
  market snapshot, source coverage, admin-token configuration, and AI research
  pipeline state are now reported as explicit checks without exposing secret
  values. The web app also proxies `/api/readiness`, and `/admin` now renders a
  read-only launch readiness panel with action links for missing configuration
  and degraded checks.
- Readiness validation: `cd apps/api && .venv/bin/python -m pytest
  tests/test_health_units.py tests/test_readiness.py tests/test_security_units.py
  -q`, `node --experimental-strip-types --test
  test/readiness-read-model.test.mjs test/proxy-route-contract.test.mjs
  test/admin-validation.test.mjs`, `npm --prefix apps/web run typecheck`,
  `npm --prefix apps/web run gate`, and focused API readiness/source tests
  passed. Browser checks confirmed `/admin` shows Not ready, admin token,
  AI research pipeline, and recovery links with no console errors or desktop
  horizontal overflow.
- Added a protected AI research refresh operation for real admin use:
  `POST /v1/research/refresh` now requires the admin token, refuses disabled or
  credential-incomplete research configuration with explicit 409 responses, and
  returns fetched/extracted/persisted/skipped-budget counts when the pipeline
  runs. The web app proxies `/api/research/refresh`, and the Admin operations
  console exposes a locked research refresh button plus read-back evidence.
- Research refresh validation: `cd apps/api && .venv/bin/python -m pytest
  tests/test_ai_research.py tests/test_research_units.py
  tests/test_generate_openapi_units.py -q`, `node --experimental-strip-types
  --test test/proxy-route-contract.test.mjs test/admin-validation.test.mjs`,
  `npm --prefix apps/web run typecheck`, `npm --prefix apps/web run gate`, and
  `cd apps/api && .venv/bin/python generate_openapi.py` passed. Browser checks
  confirmed `/admin` shows the research refresh button, keeps it locked without
  a management token, renders research refresh evidence, and has no console
  errors or desktop horizontal overflow.
- Aligned public configuration and contract docs with the new launch readiness
  and research refresh behavior: README, API contract, API README, Quickstart,
  AI pipeline notes, deployment guide, and `.env.example` now describe
  `/v1/readiness`, protected `/v1/research/refresh`, and the expected
  quickstart `not_ready` state without including real credentials.
- Documentation validation: focused API research/readiness tests, web proxy and
  admin/readiness read-model tests, `git diff --check`, and
  `scripts/security_check.sh` passed after the documentation update.
- Stabilized the release UI E2E market-refresh path: API market source fetches
  now honor `JETSCOPE_MARKET_SOURCE_TIMEOUT_SECONDS` and the legacy
  `SAFVSOIL_MARKET_REFRESH_TIMEOUT_MS` value, while the E2E harness passes the
  bounded timeout to the API process instead of the web proxy process. This
  keeps valid-token admin refresh coverage deterministic without hiding
  degraded public sources.
- Market-refresh E2E validation: the initial `npm run preflight` failed at
  `preflight:e2e` with `Market refresh with valid token failed: 504 {"error":
  "Upstream API timed out"}`. After the timeout fix,
  `cd apps/api && .venv/bin/python -m pytest tests/test_market_units.py -q`,
  `node --experimental-strip-types --test
  test/preflight-ui-e2e-contract.test.mjs`, and `npm run preflight:e2e`
  passed.
- Added an English frontend slice: `/en` and `/en/dashboard` now provide a
  reviewable English landing page and decision cockpit, the language switcher
  enables English routing, Shell supports English navigation, sitemap and
  metadata alternates include the English paths, and README documents the
  current localized route coverage without claiming full-site English parity.
- English slice validation: initial focused gates failed because English
  routing, Shell locale support, and `/en` route files were missing. After the
  implementation, `cd apps/web && npm exec vitest run
  components/__tests__/language-switcher.test.tsx
  components/__tests__/shell.test.tsx`, `node --experimental-strip-types
  --test test/routing.test.mjs test/product-read-model.test.mjs`,
  `npm --prefix apps/web run gate`, `npm test`, and `git diff --check` passed.
  Browser checks confirmed `/en` and `/en/dashboard` show English navigation,
  select `English`, avoid Chinese/German navigation leftovers, and do not
  overflow horizontally at the current desktop viewport.
- Added English source review: `/en/sources` now exposes row-level market
  provenance, confidence, fallback/proxy/live filtering, volatility state, and
  recovery actions without routing English users back to the Chinese sources
  workspace. English home, dashboard, language switching, sitemap, and README
  now point to the localized source review route.
- English source review validation: focused language/Shell tests, routing and
  sources read-model tests, `npm --prefix apps/web run gate`, `npm test`,
  `git diff --check`, `scripts/security_check.sh`, and Browser checks for
  `/en/sources` passed; Browser confirmed English navigation, selected
  `English`, no visible Chinese text, recovery actions, the market matrix, and
  no horizontal overflow.
- Added English research workbench: `/en/research` now exposes AI research
  pipeline status, disabled-state honesty, signal counts, latest-signal
  evidence, report/source/admin handoffs, and an English signal list without
  mutating the research API contract or canonical signal fields.
- English research validation: initial focused gates failed because English
  research routing, language switching, Shell navigation, and the route file
  were missing. After implementation, focused language/Shell/routing/product
  gates, `npm --prefix apps/web run gate`, `npm test`, and `git diff --check`
  passed. Browser confirmed `/en/research` selects `English`, shows Research
  navigation, discloses that the research pipeline is disabled, has evidence
  actions, has no visible Chinese text, and has no horizontal overflow.
- Added English report workbench: `/en/reports` now exposes report readiness
  from `getDashboardReadModel('en')`, including source status, saved scenario
  count, top risk signal, launch posture, report catalog, and pre-launch
  evidence actions without changing API contracts or the primary detailed
  report route.
- English report validation: initial focused gates failed because English
  report routing, language switching, Shell navigation, and the route file were
  missing. After implementation, focused language/Shell/routing/product gates,
  `npm --prefix apps/web run gate`, `npm test`, and `git diff --check` passed.
  Browser confirmed `/en/reports` selects `English`, shows Reports navigation,
  report catalog, pre-launch actions, source status, no visible Chinese text,
  and no horizontal overflow.
- Added focused source freshness regression coverage for issue #77.
- Strengthened API contract tests so `/v1/market/snapshot` must expose
  `source_status.freshness_minutes`, confidence, fallback rate, and explicit
  fallback state.
- Added a stale fallback regression using an old refresh run so stale source
  age and fallback state remain visible together.
- Added source coverage unit assertions for live/proxy and fallback quality
  metadata, including confidence, lag, source type, fallback flags, and degraded
  coverage state.
- Updated the Lane C freshness canary to read `source_status.freshness_minutes`
  directly instead of silently defaulting from a missing `values.data_freshness`
  key.
- Validation: `apps/api/.venv/bin/python -m pytest
  apps/api/tests/test_market_contract_v1.py apps/api/tests/test_sources_units.py
  apps/api/tests/test_lane_c_e2e.py -q` passed with 33 tests; full
  `apps/api/.venv/bin/python -m pytest apps/api/tests -q` passed with 317
  tests and 3 pre-existing deprecation warnings; `git diff --check` and
  `scripts/security_check.sh` passed.

## 2026-06-01

- Reviewed the public repository entry files, product README, API contract, data contract, AI pipeline, and PR template before making documentation changes.
- Added contributor-facing trust-pack documentation for onboarding, maintainer responsibilities, security reporting, roadmap framing, and changelog history.
- Kept the OSS trust-pack wave within public documentation and issue/PR
  template files only.
- Avoided adding claims about production adoption, external team size, private automation, or security guarantees not supported by the repository.
- Added release-readiness and reviewer reproducibility documentation: a local
  dry-run release script, release process notes, Codex-for-OSS use guidance,
  quickstart, demo path, `.env.example`, and infrastructure notes.
- Prepared public-safe next-step artifacts: `docs/OSS_ISSUE_BACKLOG.md`,
  `docs/RELEASE_NOTES_V0_1_0_ALPHA.md`, and the goal-refactor execution record
  in `docs/exec-plans/2026-06-01-oss-readiness-goal-refactor.md`.
- Validation evidence for the local OSS-readiness branch: `bash -n
  scripts/release-dry-run.sh`, `git diff --check origin/main..HEAD`, and
  `scripts/security_check.sh` passed. `gitleaks` was not installed, so the
  security gate used its built-in high-signal secret pattern scan.
- No push, PR, merge, deploy, publish, SSH, rsync, reset, delete, or remote
  mutation was performed during this maintenance pass.

## Maintenance Posture

- Public documentation should stay aligned with the implemented API, data, and AI pipeline contracts.
- Maintenance notes should remain reviewable and free of secrets, raw runtime logs, local machine paths, and private automation internals.
- Validation for docs-only changes should remain lightweight but real.
