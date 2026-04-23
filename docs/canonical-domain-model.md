# JetScope Canonical Domain Model

**Status:** Active working source of truth  
**Last Updated:** 2026-04-23  
**Purpose:** Define the single product vocabulary for JetScope Phase 1 normalization

## 1. Product Core

JetScope is an aviation fuel transition intelligence product.

The core product question is:

> Under what combination of fossil jet price, carbon price, reserve stress, subsidy support, and pathway economics does SAF become a rational airline procurement decision?

The canonical product model is therefore:

1. market metrics
2. reserve stress
3. SAF pathways
4. tipping-point analysis
5. airline decision signals
6. saved scenarios
7. source trust and freshness

This model is the default vocabulary for:

- API contracts
- shared TypeScript/Python types
- web read models
- dashboard modules
- report and article data bindings

## 2. Canonical Entities

### 2.1 MarketMetric

Represents a displayed market signal with provenance.

Required fields:

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

### 2.2 ReserveSignal

Represents regional supply-stress status.

Required fields:

- `region`
- `coverage_days`
- `coverage_weeks`
- `stress_level`
- `estimated_supply_gap_pct`
- `source_type`
- `source_name`
- `confidence_score`

### 2.3 SafPathway

Represents a pathway family, not a page-local editable route row.

Required fields:

- `pathway_key`
- `display_name`
- `feedstock_family`
- `maturity_level`
- `cost_low_usd_per_l`
- `cost_high_usd_per_l`
- `carbon_reduction_low_pct`
- `carbon_reduction_high_pct`
- `source_basis`

Canonical pathway keys for Phase 1:

- `hefa`
- `atj`
- `ft`
- `ptl`

### 2.4 TippingPointScenario

Represents the input envelope for price-competitiveness analysis.

Required fields:

- `fossil_jet_usd_per_l`
- `carbon_price_eur_per_t`
- `subsidy_usd_per_l`
- `blend_rate_pct`
- `reserve_weeks`
- `selected_pathway_key`

### 2.5 PathwayTippingPoint

Represents per-pathway competitiveness output.

Required fields:

- `pathway_key`
- `display_name`
- `net_cost_low_usd_per_l`
- `net_cost_high_usd_per_l`
- `spread_low_pct`
- `spread_high_pct`
- `status`

Allowed `status` values:

- `competitive`
- `inflection`
- `premium`

### 2.6 AirlineDecisionSignal

Represents modelled airline responses under market stress.

Required fields:

- `raise_fares`
- `cut_capacity`
- `buy_spot_saf`
- `sign_long_term_offtake`
- `ground_routes`
- `signal`

## 3. Canonical Product Modules

The second dashboard prototype should be treated as the target product surface.

Its canonical modules are:

1. `CrisisKpiStrip`
2. `FuelVsSafPriceChart`
3. `SafPathwayComparisonTable`
4. `TippingPointControls`
5. `TippingPointStatus`
6. `AirlineDecisionMatrix`
7. `ScenarioCostStackChart`
8. `SourceTrustPanel`

These modules consume canonical entities. They should not define their own domain model.

## 4. Legacy Boundary

The following concepts are now classified as **legacy compatibility vocabulary**, not primary product vocabulary:

- `route_edits`
- `breakEvenCrude`
- `sugar-atj`
- `reed-hefa`
- `jetProxySlope`
- `jetProxyIntercept`

They may remain in the repository temporarily for:

- saved scenario compatibility
- old tests and fixtures
- admin migration support

They should not be used as the primary modeling language for:

- new API routes
- new dashboard modules
- new read models
- new article/report integrations

## 5. Compatibility Rule

Until Phase 2 migration is complete:

- legacy route-based scenario payloads may continue to exist
- pathway-based analysis is the source of truth for new product work
- any new feature should prefer `pathway_key` over route-specific ids

If both exist in the same feature:

- pathway vocabulary owns the UI and API contract
- legacy route vocabulary is explicitly treated as persistence compatibility only

## 6. Decision For Next Phase

Next implementation phase should migrate the second price/tipping-point dashboard first.

The migration order should be:

1. shared pathway catalog
2. tipping-point controls and URL state
3. pathway comparison table
4. airline decision matrix
5. scenario cost stack chart
6. article/report reuse
