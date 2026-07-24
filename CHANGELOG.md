# Changelog

## [0.1.0] - 2026-07-24

First tagged release, consolidating the alpha surface plus a production-hardening pass.

### Added

- SAF pathway comparison with carbon sensitivity and source trust
- EU ETS carbon-pressure projection endpoint
- Energy-transition feature batch: crossover core, grid-parity, EN/DE slices, research hardening, and AI signal taxonomy
- OpenAPI contract and grid proxy work (salvaged from a prior worktree)
- Docker quickstart smoke validation script
- Safe release dry-run CI workflow
- Deploy hardening carried into main: rollback, approval tokens, and public URL support
- SQLite backup (`scripts/backup-sqlite.sh`) and non-destructive restore-drill (`scripts/restore-sqlite-drill.sh`) scripts
- Deploy-time deep `/v1/readiness` gate and opt-in last-good auto-restore in `scripts/auto-deploy.sh`
- Optional structured JSON logging and Sentry error tracking (both env-gated, off by default)

### Changed

- Hardened public SAF price source fallback semantics
- Froze SQLite as the production database engine; the Postgres/dual-write path now fails loudly instead of silently falling back to SQLite
- AI research live mode: per-request timeout, rate-limit retry with backoff, and per-article failure isolation so one error no longer aborts the daily run

### Fixed

- Readiness error sanitizer now covers `newsapi_key` and `api_key` query params, plus whitespace-stripped secret variants
- Unblocked CI by bumping undici, starlette, and pydantic-settings

### Security

- Readiness secret sanitization for error responses
- Patched shell-quote and postcss vulnerabilities

### Tests

- Broad focused unit-test coverage across API modules (markets, pathways, EU ETS, research, health, config, security, cache, and related areas)
- Migration zero-downtime branching and rollback path coverage
- Auto-deploy orchestration tests
- AI research mock/live boundary validation

### Docs

- EU ETS carbon assumptions documentation
- Documented SQLite as the frozen production engine and the backup/restore drill (`OPERATIONS.md`, `docs/DEPLOYMENT_GUIDE.md`, `infra/README.md`)

### Dependencies

- Routine dependency and GitHub Actions bumps

## [0.1.0-alpha] - 2026-06-01

Initial public trust-pack documentation release for the current JetScope product surface.

### Added

- documented the current API surface for market snapshot, tipping-point analysis, source coverage, source freshness, reserve stress, scenario, and research-signal workflows
- recorded the current market snapshot and SAF tipping-point surfaces as the initial alpha baseline
- documented source coverage, provenance, freshness, confidence, and fallback-state expectations
- documented the mock-first AI research signal path and the safe live-mode boundary
- documented local Next.js + FastAPI development and Docker/infra review paths
- contributor guidance in `CONTRIBUTING.md`
- maintainer responsibilities in `MAINTAINERS.md`
- vulnerability reporting and no-secrets policy in `SECURITY.md`
- a conservative roadmap in `ROADMAP.md`
- public-safe maintenance evidence in `docs/MAINTENANCE_LOG.md`
- GitHub issue templates for bugs and feature requests
- an updated pull request template with validation, safety, and evidence fields

### Notes

- This entry reflects only surfaces already described in the repository: market snapshots, SAF tipping-point analysis, reserve stress, source coverage, AI research signals, and related contracts.
- No claim is made about production adoption, external users, or security coverage beyond what is documented in the repository.
