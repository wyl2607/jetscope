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
