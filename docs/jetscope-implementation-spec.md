# JetScope Implementation Spec

**Status:** Draft for implementation  
**Last Updated:** 2026-04-23  
**Scope:** Target repository structure, API contracts, data schema, components, and execution tasks

## 1. Implementation Objective

This document defines how JetScope should be evolved from the current mixed dashboard-and-article state into a source-aware aviation fuel intelligence platform.

It is implementation-focused. It does not replace the platform plan.

## 2. Repository Target Shape

The current repository shape is workable. The next step is to make domain boundaries explicit.

### 2.1 Web

Target additions under `apps/web`:

```text
apps/web/
  app/
    crisis/
      eu-jet-reserves/
    pathways/
    airlines/
    reports/
  components/
    crisis/
    pathways/
    simulations/
    sources/
  lib/
    analysis/
    mappers/
    contracts/
```

Recommended module ownership:

- `components/crisis/*` for reserve and scarcity visuals
- `components/pathways/*` for SAF pathway comparison visuals
- `components/simulations/*` for sliders and scenario widgets
- `components/sources/*` for trust, freshness, and provenance UI
- `lib/analysis/*` for light client-side formatting only
- `lib/contracts/*` for typed API contracts

### 2.2 API

Target additions under `apps/api/app`:

```text
apps/api/app/
  api/routes/
    analysis.py
    reserves.py
    sources.py
  schemas/
    analysis.py
    reserves.py
    sources.py
  services/
    analysis/
      breakeven.py
      decision_matrix.py
      pathway_costs.py
      reserve_stress.py
    ingestion/
    sources/
```

Recommended ownership:

- `services/analysis/*` holds reusable calculation logic
- `services/sources/*` holds source metadata, trust policy, and fallback explanation
- route modules should stay thin and orchestration-focused

### 2.3 Shared Core

Target additions under `packages/core`:

```text
packages/core/
  aviation/
    metrics.ts
    pathways.ts
    reserves.ts
    scenarios.ts
    units.ts
```

Shared core should contain:

- enums
- unit conversion helpers
- static policy timelines
- typed scenario shapes

Shared core should not contain:

- page-specific presentation logic
- fetch calls
- framework-specific code

## 3. Canonical Domain Model

The following entities should be treated as first-class product concepts.

### 3.1 MarketMetric

Fields:

- `metric_key`
- `label`
- `unit`
- `value`
- `as_of`
- `source_type`
- `source_name`
- `confidence_score`
- `fallback_used`
- `lag_minutes`

### 3.2 ReserveSignal

Fields:

- `region`
- `coverage_days`
- `coverage_weeks`
- `stress_level`
- `estimated_supply_gap_pct`
- `updated_at`
- `source_summary`
- `confidence_score`

### 3.3 SafPathwayCost

Fields:

- `pathway_key`
- `display_name`
- `feedstock_family`
- `maturity_level`
- `cost_low_usd_per_l`
- `cost_high_usd_per_l`
- `carbon_reduction_low_pct`
- `carbon_reduction_high_pct`
- `capacity_constraint`
- `notes`

### 3.4 AirlineDecisionScenario

Fields:

- `scenario_id`
- `fossil_jet_usd_per_l`
- `carbon_price_eur_per_t`
- `saf_subsidy_usd_per_l`
- `reserve_weeks`
- `blend_rate_pct`
- `pathway_key`
- `responses`

### 3.5 AirlineResponse

Fields:

- `raise_fares_probability`
- `cut_capacity_probability`
- `buy_spot_saf_probability`
- `sign_long_term_offtake_probability`
- `ground_routes_probability`

## 4. API Contract Expansion

The existing market routes should remain. The following routes should be added.

### 4.1 Analysis Routes

`GET /v1/analysis/tipping-point`

Purpose:

- compare fossil jet economics against selected SAF pathways
- return breakeven status and cost gaps

Query parameters:

- `fossil_jet_usd_per_l`
- `carbon_price_eur_per_t`
- `subsidy_usd_per_l`
- `blend_rate_pct`

Response shape:

```json
{
  "generated_at": "2026-04-23T12:00:00Z",
  "inputs": {
    "fossil_jet_usd_per_l": 1.30,
    "carbon_price_eur_per_t": 95,
    "subsidy_usd_per_l": 0.10,
    "blend_rate_pct": 6
  },
  "pathways": [
    {
      "pathway_key": "hefa",
      "net_cost_low_usd_per_l": 1.10,
      "net_cost_high_usd_per_l": 1.45,
      "spread_low_pct": -15.4,
      "spread_high_pct": 11.5,
      "status": "inflection"
    }
  ]
}
```

`GET /v1/analysis/airline-decision`

Purpose:

- estimate response probabilities for an airline under stress

Query parameters:

- `fossil_jet_usd_per_l`
- `reserve_weeks`
- `carbon_price_eur_per_t`
- `pathway_key`

Response shape:

```json
{
  "generated_at": "2026-04-23T12:00:00Z",
  "inputs": {
    "fossil_jet_usd_per_l": 1.30,
    "reserve_weeks": 3.0,
    "carbon_price_eur_per_t": 95,
    "pathway_key": "hefa"
  },
  "probabilities": {
    "raise_fares": 0.82,
    "cut_capacity": 0.71,
    "buy_spot_saf": 0.38,
    "sign_long_term_offtake": 0.54,
    "ground_routes": 0.12
  },
  "signal": "switch_window_opening"
}
```

### 4.2 Reserve Routes

`GET /v1/reserves/eu`

Purpose:

- return current reserve and supply stress signal for Europe

Response shape:

```json
{
  "generated_at": "2026-04-23T12:00:00Z",
  "region": "eu",
  "coverage_days": 20,
  "coverage_weeks": 2.9,
  "stress_level": "elevated",
  "estimated_supply_gap_pct": 25,
  "source_type": "manual",
  "source_name": "IATA / EUROCONTROL curated estimate",
  "confidence_score": 0.62
}
```

### 4.3 Source Routes

`GET /v1/sources/coverage`

Purpose:

- expose what each visible metric is based on

Response shape:

```json
{
  "generated_at": "2026-04-23T12:00:00Z",
  "metrics": [
    {
      "metric_key": "jet_eu_proxy_usd_per_l",
      "source_name": "Investing.com Jet Fuel CIF NWE public quote",
      "source_type": "public_proxy",
      "confidence_score": 0.76,
      "lag_minutes": 1440,
      "fallback_used": false
    }
  ]
}
```

## 5. Database Additions

The current database already stores market snapshots and related records. The following tables should be added or formalized next.

### 5.1 `reserve_signals`

Purpose:

- store explicit reserve and supply stress records instead of embedding reserve numbers in page code

Suggested columns:

- `id`
- `region`
- `coverage_days`
- `coverage_weeks`
- `estimated_supply_gap_pct`
- `stress_level`
- `source_type`
- `source_name`
- `confidence_score`
- `notes`
- `as_of`
- `created_at`

### 5.2 `saf_pathway_cost_curves`

Purpose:

- store range-based pathway economics with provenance

Suggested columns:

- `id`
- `pathway_key`
- `feedstock_family`
- `cost_low_usd_per_l`
- `cost_high_usd_per_l`
- `carbon_reduction_low_pct`
- `carbon_reduction_high_pct`
- `maturity_level`
- `source_name`
- `source_type`
- `confidence_score`
- `as_of`

### 5.3 `saf_supply_capacity`

Purpose:

- track production scale and constraint narrative separately from cost

Suggested columns:

- `id`
- `region`
- `pathway_key`
- `annual_capacity_tonnes`
- `committed_capacity_tonnes`
- `utilization_pct`
- `constraint_note`
- `source_name`
- `as_of`

### 5.4 `airline_events`

Purpose:

- preserve event signals like cuts, warnings, offtake agreements, and pricing actions

Suggested columns:

- `id`
- `airline_code`
- `event_type`
- `headline`
- `summary`
- `event_date`
- `estimated_fuel_impact_tonnes`
- `source_url`
- `source_name`
- `confidence_score`

### 5.5 `source_registry`

Purpose:

- provide one place to explain source semantics and trust levels

Suggested columns:

- `id`
- `source_key`
- `source_name`
- `source_type`
- `region`
- `market_scope`
- `default_lag_minutes`
- `default_confidence_score`
- `fallback_order`
- `notes`

## 6. UI Component Decomposition

The HTML prototype should be split into reusable components with clear responsibilities.

### 6.1 Crisis components

- `CrisisKpiStrip`
- `ReserveCoverageBanner`
- `SupplyGapCallout`

### 6.2 Price components

- `FuelVsSafPriceChart`
- `PathwayCostRangeLegend`
- `PriceTrendContextPanel`

### 6.3 Simulation components

- `TippingPointSimulator`
- `AirlineDecisionMatrix`
- `ScenarioCostBreakdownChart`

### 6.4 Trust components

- `MetricSourceBadge`
- `SourceTrustPanel`
- `FreshnessBanner`

## 7. Page Ownership Model

### 7.1 Dashboard pages

Dashboard pages should own:

- live monitoring
- simulation entry points
- source trust display
- scenario controls

### 7.2 Analysis pages

Analysis pages should own:

- narrative synthesis
- event interpretation
- SEO-oriented summaries
- deep links into the dashboard

Analysis pages should not own:

- primary business logic
- bespoke calculation implementations
- duplicated static versions of dashboard widgets

## 8. Extraction Targets In Current Codebase

The following existing logic should be extracted first:

- breakeven math from the Lufthansa calculator
- reserve signal handling from the crisis page
- pathway cost assumptions from article pages and prototype HTML
- source and freshness rendering from read-model responses

## 9. Phase Execution Tasks

### Phase A: Specs and contracts

- add domain model docs
- add source trust policy docs
- freeze metric naming
- define response schemas

### Phase B: Backend analysis services

- implement pathway cost service
- implement tipping-point service
- implement reserve signal service
- implement airline decision service
- add schema tests

### Phase C: Frontend module extraction

- create modular dashboard components
- replace page-local calculations with API-backed data
- add source trust and freshness UI

### Phase D: Content page convergence

- refactor analysis pages to consume shared modules
- remove duplicated tables where shared components are sufficient
- keep narrative text but stop duplicating product logic

## 10. Implementation Status

Completed:

- added planning and implementation documents
- added backend routes for analysis, reserves, and source coverage
- enriched market snapshot source-status fields
- added backend tests for new routes
- wired crisis dashboard to shared reserve, analysis, and source coverage contracts
- wired main dashboard to the same contracts
- added reusable web components:
  - `FuelVsSafPriceChart`
  - `TippingPointSimulator`
  - `SourceCoveragePanel`

In progress:

- converge the legacy source provenance page with the new `/sources/coverage` contract
- reuse shared modules in topical pages such as Lufthansa analysis

Blocked until environment is ready:

- web typecheck
- web build
- frontend validation that depends on installed `apps/web` dependencies

Current blocker:

- `apps/web` dependencies are missing in the current working environment, so `tsc` and `next` commands are unavailable

Domain source of truth for this phase:

- `docs/canonical-domain-model.md`

## 11. Immediate Next Sprint

Execute the next sprint in this order:

1. refactor `apps/web/lib/sources-read-model.ts` so the new source coverage contract becomes primary
2. reuse extracted dashboard components in topical pages such as `apps/web/app/de/lufthansa-saf-2026/*`
3. add frontend read-model and component tests for reserve, source coverage, and simulator rendering
4. install `apps/web` dependencies and run:
   - `npm run web:typecheck`
   - `npm run web:build`
5. once frontend validation passes, begin database-backed reserve and source registry persistence

Implementation note:

- treat `apps/web/app/scenarios/page.tsx` as the carrier for the second dashboard migration before introducing any new top-level route

## 12. Testing Requirements

### 10.1 Backend

- unit tests for all analysis engines
- contract tests for new routes
- fallback and confidence-state tests

### 10.2 Frontend

- DOM contract tests for new dashboard modules
- rendering tests for source/freshness badges
- scenario control state tests

### 10.3 Integration

- one end-to-end test for crisis dashboard
- one end-to-end test for tipping-point simulator
- one read-model fallback regression test

## 13. AI Editing Guidance

AI agents modifying JetScope should prefer these artifacts in order:

1. implementation spec
2. platform plan
3. API contract
4. data contract
5. local component and schema files

AI tasks should be framed as:

- add or update a metric contract
- add or update an analysis service
- add or update a reusable dashboard component
- wire an existing page to shared contracts

AI tasks should avoid:

- inventing new metric names without updating contracts
- embedding new business logic directly inside page files
- adding undocumented hardcoded values

## 14. Immediate Build Order

The first implementation cycle after this spec should be:

1. add `reserve_signals` and `source_registry` contracts
2. extract breakeven and decision logic into shared API services
3. build `FuelVsSafPriceChart` and `TippingPointSimulator` as reusable web components
4. refactor the crisis page to consume the shared services
5. refactor the Lufthansa page to become a thin narrative surface over shared product logic
