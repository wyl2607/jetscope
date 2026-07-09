# JetScope Product Architecture

## Product Positioning

JetScope is a European transition-energy intelligence product now covering three adjacent decision domains: SAF, renewable electricity/grid parity, and residential heating transition. It models when SAF and heat pathways become economically rational under price, policy, and infrastructure assumptions, and it supports comparison between fossil, SAF, grid, and heat alternatives using shared market, policy, and model assumptions.

## Product Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: FastAPI, SQLAlchemy, Alembic
- Database: SQLite for local development; PostgreSQL-compatible SQLAlchemy/Alembic path for production-style deployments
- Shared domain logic: `packages/core`
- Automation: root `package.json` scripts plus `scripts/` release and preflight tooling
- Admin surface: built into the product for protected refresh, pathway, policy, and scenario operations

## Repository Shape

```text
apps/
  web/        # Next.js product frontend and API proxy routes
  api/        # FastAPI backend, services, schemas, migrations, and API tests
  db/         # SQL migration artifacts
packages/
  core/       # Shared aviation and industry models
data/         # Small checked-in sample and baseline datasets
docs/         # Product, API, data-contract, AI-pipeline, and deployment docs
infra/        # Docker Compose, nginx, and service examples
scripts/      # Release, preflight, sync, deploy, and smoke-check scripts
test/         # Node contract and read-model tests
```

## Current Product Modules

- Market dashboard and source coverage
- Germany jet-fuel price page
- EU reserve stress crisis page
- SAF tipping-point crisis page
- Grid parity dashboard and heat comparison surfaces
- Grid history and historical calibration context
- Grid LCOE sensitivity analysis
- Heat parity dashboard
- Heat sensitivity analysis
- Reports and research portfolio surfaces
- Scenario registry and persistence flow
- Admin data operations

## Current API Families

- `GET /v1/health`
- `GET /v1/market/snapshot`
- `GET /v1/market/history`
- `POST /v1/market/refresh`
- `GET /v1/analysis/tipping-point`
- `GET /v1/analysis/airline-decision`
- `GET /v1/analysis/tipping-point/events`
- `GET /v1/analysis/grid-parity`
- `GET /v1/analysis/grid-parity/history`
- `POST /v1/analysis/grid-parity/history/seed`
- `GET /v1/analysis/grid-parity/lcoe-sensitivity`
- `GET /v1/analysis/heat-parity`
- `GET /v1/analysis/heat-parity/sensitivity`
- `GET /v1/reserves/eu`
- `GET /v1/research/signals`
- `GET /v1/sources/coverage`
- `GET /v1/pathways`
- `GET /v1/policies/refuel-eu`
- `GET/POST /v1/workspaces/{workspace_slug}/scenarios`
- `PUT/DELETE /v1/workspaces/{workspace_slug}/scenarios/{scenario_id}`
- `GET/PUT/DELETE /v1/workspaces/{workspace_slug}/preferences`

Write routes are protected with `x-admin-token` and require `JETSCOPE_ADMIN_TOKEN`.

## Current Database Tables

- `workspaces`
- `workspace_preferences`
- `scenarios`
- `market_snapshots`
- `market_refresh_runs`
- `route_catalog`
- `refuel_eu_targets`
- `reserves_coverage`
- `tipping_events`
- `esg_signals`
- `ai_research_budget_days`

## Data Source Posture

JetScope should present source provenance explicitly. Public sources and proxies are acceptable when labelled as such. The product must not imply paid or authoritative data feeds unless the integration exists in code and is operationally configured.

Current implemented source posture includes:

- FRED public time series for Brent and jet-fuel proxy data
- EIA public benchmark page parsing for Brent fallback
- ECB public EUR/USD reference rate
- European Commission CBAM certificate price as carbon proxy
- EEX EU ETS public market page where available
- Investing.com ARA/Rotterdam public quote parsing where available
- Checked-in baselines and deterministic fallback values when live sources fail
- Portfolio demo data for grid/heat pathways where public baselines are not yet live

Additional constraints:

- Portfolio-level outputs are intended for decision support and scenario planning, not investment-grade forecasting.
- Grid and heat analysis products remain demo-oriented where no production-grade feed contracts are explicit in code.
- There are no claims of live paid-feed integration in current surface contracts.

## Architecture Rules

1. New product work should use JetScope naming, not legacy predecessor branding.
2. New API contracts should expose source status, freshness, confidence, and fallback state.
3. New UI modules should consume read models rather than embedding transport logic directly in pages.
4. New write operations should remain admin-token protected unless a full auth model is introduced.
5. Local-only outputs, logs, databases, node modules, private automation ledgers, and internal handoff archives should not be tracked.
6. Refactors should follow `docs/REFACTORING_STRATEGY.md`: evidence-ranked, one subsystem at a time, and validated against the affected contract boundary.

## Compatibility Boundary

Some older files and environment variables still use `SAFVSOIL_*` naming for compatibility with existing deployments and tests. Treat that vocabulary as legacy compatibility, not the preferred naming for new work.
