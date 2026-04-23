# JetScope SAF Platform Plan

**Status:** Draft for implementation  
**Last Updated:** 2026-04-23  
**Scope:** Product definition, platform architecture, phased delivery

## 1. Problem Definition

JetScope should not be treated as a collection of analysis pages. It should be treated as a market intelligence product for the European aviation fuel transition.

The core product question is:

> At what fuel price, carbon price, supply constraint, and policy threshold does SAF move from compliance burden to rational procurement choice for airlines?

This product exists to answer that question with:

- source-aware market data
- pathway-aware SAF cost models
- airline decision simulations
- crisis monitoring and policy context

## 2. Product Thesis

The current aviation fuel problem is not only a price problem. It is a price-plus-volume problem.

The commercial value of JetScope is to model the chain:

1. reserve stress
2. fossil jet scarcity
3. spot price escalation
4. carbon and policy pressure
5. SAF pathway competitiveness
6. airline response: surcharge, cuts, procurement, or strategic switching

## 3. Product Goals

JetScope should provide:

- a live crisis monitor for European jet fuel conditions
- a SAF pathway comparison surface for HEFA, ATJ, FT, PtL, and future pathways
- a tipping-point engine for fossil jet vs SAF economics
- a scenario lab for airline procurement and route-level stress testing
- report-grade analysis pages backed by reusable platform data

## 4. Non-Goals

JetScope should not attempt to be:

- a generic commodity terminal across all energy markets
- a consumer flight search product
- a pure CMS for publishing essays
- a static infographic site without data provenance

## 5. Current State

The current repository already contains:

- a Next.js web app
- a FastAPI backend
- market snapshot and history APIs
- scenario and pathway surfaces
- crisis and Lufthansa analysis pages
- a read-model layer on the web side

The current repository still relies on:

- manual reserve inputs
- proxy and fallback metrics for several market values
- page-local business logic
- content pages that duplicate product logic
- incomplete separation between platform data and article narrative

## 6. Product Positioning

JetScope should be positioned as:

**Aviation fuel transition intelligence for European operators, researchers, and policy-sensitive procurement teams.**

Primary user types:

- airline strategy and procurement teams
- SAF producers and project developers
- ESG and transition researchers
- policy and market analysts
- internal editorial or AI agents generating reports from trusted product data

## 7. Target Platform Architecture

JetScope should evolve into five layers.

### 7.1 Data Layer

Responsibilities:

- ingest raw market, policy, and capacity data
- normalize units and timestamps
- preserve source provenance
- expose confidence and fallback state

Core domains:

- fossil fuel prices
- jet fuel regional prices
- carbon prices
- SAF pathway costs
- SAF production capacity
- reserve and supply stress signals
- airline disruption events
- policy timelines and compliance thresholds

### 7.2 Domain and Analysis Layer

Responsibilities:

- convert raw market signals into interpretable economics
- compute breakeven and switching conditions
- produce reusable scenario outputs

Required engines:

- jet price engine
- SAF pathway cost engine
- reserve stress engine
- tipping-point engine
- airline decision engine
- scenario engine

### 7.3 API Layer

Responsibilities:

- expose stable contracts for web, app, and AI clients
- keep narrative pages from embedding raw business logic
- provide source metadata and freshness signals

Top-level API groups:

- `/v1/market/*`
- `/v1/analysis/*`
- `/v1/reserves/*`
- `/v1/scenarios/*`
- `/v1/sources/*`
- `/v1/pathways/*`
- `/v1/policies/*`

### 7.4 Presentation Layer

Responsibilities:

- render dashboard-grade monitoring views
- render reusable comparison and simulation modules
- separate product surfaces from article surfaces

Primary surfaces:

- Crisis Monitor
- SAF Pathway Explorer
- Airline Decision Lab
- Research Reports

### 7.5 AI and Research Layer

Responsibilities:

- let AI agents edit the project using stable specs instead of freeform prompts
- generate reports from platform data and citation rules
- preserve metric definitions, assumptions, and source trust policy

AI should operate against:

- metric catalog
- source registry
- scenario schema
- analysis output contract
- page component contract

## 8. Canonical Product Modules

The standalone HTML prototype should be decomposed into product modules, not preserved as a monolith.

Target modules:

- `CrisisKpiStrip`
- `FuelVsSafPriceChart`
- `SafPathwayComparisonTable`
- `TippingPointSimulator`
- `AirlineDecisionMatrix`
- `ScenarioCostStackChart`
- `SourceTrustPanel`
- `FreshnessStatusBanner`

## 9. Data Governance Rules

Every displayed metric should declare:

- unit
- source type
- update cadence
- fallback behavior
- confidence score
- latest timestamp

Source types should be normalized into:

- `official`
- `market_primary`
- `public_proxy`
- `derived`
- `manual`

No dashboard-critical metric should remain undocumented.

## 10. Strategic Gaps To Close

### 10.1 Data credibility gap

Several current values are still proxies, derived multipliers, or manually curated figures. This is acceptable for bootstrapping but not for long-term product trust.

### 10.2 Logic placement gap

Breakeven and scenario logic currently lives partly inside page components. That prevents reuse across dashboard, reports, and future app clients.

### 10.3 Product structure gap

The repository already has useful pages, but the information architecture still behaves like a mix of article site and product UI. These need clearer separation.

### 10.4 AI workflow gap

There is not yet a stable set of product specs that AI can follow to change the system safely.

## 11. Delivery Principles

- preserve current stack: Next.js + FastAPI
- preserve current market snapshot/history flow where possible
- prefer extraction over rewrite
- move calculations out of page-local UI
- convert static prototype widgets into reusable components
- make source trust visible in the UI
- keep article pages thin and data-driven

## 12. Phased Roadmap

### Phase 1: Normalize the domain

Objectives:

- define canonical entities
- define metric catalog
- define source trust policy
- define reserve and pathway terminology

Outputs:

- domain model document
- metric catalog document
- source trust policy document

Primary reference:

- `docs/canonical-domain-model.md`

Current status:

- in progress
- platform plan and implementation spec are complete
- first domain and contract boundaries are now reflected in backend and web code

### Phase 2: Extract shared analysis logic

Objectives:

- move breakeven logic into shared services
- define tipping-point outputs
- define airline decision matrix outputs
- define scenario payload schema

Outputs:

- shared analysis functions
- unit tests
- fixed example scenarios

Current status:

- in progress
- initial `tipping-point` and `airline-decision` analysis services are implemented
- backend contract tests for new analysis routes are passing

### Phase 3: Rebuild the dashboard surface

Objectives:

- transform current crisis page into core monitoring surface
- reuse the same modules in topical pages
- attach source and freshness metadata to every major chart

Outputs:

- unified crisis dashboard
- pathway explorer
- reusable simulator

Current status:

- in progress
- crisis dashboard consumes reserve, analysis, and source coverage contracts
- dashboard page consumes the same shared modules
- first reusable modules are extracted:
  - `FuelVsSafPriceChart`
  - `TippingPointSimulator`
  - `SourceCoveragePanel`

### Phase 4: App and AI readiness

Objectives:

- expose stable API contracts
- support future mobile app consumption
- support report export and AI automation

Outputs:

- stable analysis endpoints
- scenario export formats
- AI-editable product specs

Current status:

- not started

## 13. Execution Status

Completed:

- product architecture plan written
- implementation specification written
- backend routes added for:
  - `/v1/analysis/tipping-point`
  - `/v1/analysis/airline-decision`
  - `/v1/reserves/eu`
  - `/v1/sources/coverage`
- `market/snapshot` source status enriched with confidence, freshness, fallback rate, and fallback flag
- crisis dashboard wired to shared reserve, analysis, and source coverage contracts
- main dashboard wired to shared reserve, analysis, and source coverage contracts

In progress:

- convergence of legacy source views with the new source coverage contract
- reuse of shared dashboard modules across topical pages

Blocked until environment is ready:

- full web typecheck
- full web production build
- frontend end-to-end verification

Blocker detail:

- `apps/web` dependencies are currently missing in the working environment, so `tsc` and `next` are unavailable for validation

## 14. Next Build Queue

The next concrete build queue should be:

1. refactor `sources-read-model` so the new source coverage contract becomes the primary provenance surface
2. update topical pages such as Lufthansa analysis to reuse `FuelVsSafPriceChart` and `TippingPointSimulator`
3. add frontend contract tests for reserve, analysis, and source coverage rendering
4. install `apps/web` dependencies and run:
   - `npm run web:typecheck`
   - `npm run web:build`
5. after frontend validation, start database-backed reserve persistence and source registry work

## 15. Success Criteria

JetScope should be considered structurally ready when:

- market metrics carry explicit source metadata
- reserve, pathway, and breakeven logic live outside page components
- dashboard and report pages use shared data contracts
- source confidence is visible to the user
- AI can add or modify a page by following documented platform contracts

## 16. Immediate Next Build Targets

The next implementation cycle should prioritize:

1. canonical domain model and metric definitions
2. shared tipping-point analysis service
3. source-aware reserve signal contract
4. dashboard module extraction from the current HTML prototype
5. separation of dashboard surfaces from article-style analysis pages

The active domain source of truth for this cycle is:

- `docs/canonical-domain-model.md`

## 17. Decision Summary

JetScope should advance as a data product, not as a static content site.

The HTML dashboard prototype is useful as interaction reference, but the production system should be anchored on:

- reusable domain models
- trusted source metadata
- stable APIs
- shared analysis logic
- modular UI components
