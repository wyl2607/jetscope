# JetScope Data Contract v1

**Status:** Active v1 contract  
**Last updated:** 2026-04-24  
**Scope:** Market snapshots, source metadata, reserves, tipping events, scenarios, and AI research signals.

## Purpose

This document defines the data shapes that JetScope product surfaces rely on. It replaces earlier project wording and removes aspirational feed claims that are not currently implemented.

The contract is intentionally source-aware. A value without freshness, confidence, or fallback context is not sufficient for a decision-support product.

## Core Entities

### MarketSnapshot

Represents one market metric observation.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | UUID. |
| `source_key` | string | Internal source identifier. |
| `metric_key` | string | Canonical metric identifier. |
| `value` | number | Metric value. |
| `unit` | string | Display and conversion unit. |
| `as_of` | datetime | Observation timestamp. |
| `payload` | object | Source detail, parser metadata, and fallback context. |

Current metric keys include:

| Metric key | Unit | Meaning |
| --- | --- | --- |
| `brent_usd_per_bbl` | `USD/bbl` | Brent crude benchmark or fallback. |
| `jet_usd_per_l` | `USD/L` | Jet fuel proxy converted to liters. |
| `carbon_proxy_usd_per_t` | `USD/tCO2` | Carbon-cost proxy. |
| `jet_eu_proxy_usd_per_l` | `USD/L` | EU jet fuel proxy derived from Brent/ARA context. |
| `rotterdam_jet_fuel_usd_per_l` | `USD/L` | Rotterdam/ARA jet fuel quote where available. |
| `eu_ets_price_eur_per_t` | `EUR/tCO2` | EU ETS price where available. |
| `germany_premium_pct` | `%` | German regional premium indicator. |

### SourceStatus

Aggregated source quality used by the web read models.

| Field | Type | Notes |
| --- | --- | --- |
| `overall` | string | Overall status such as `live`, `partial`, or `degraded`. |
| `confidence` | number or null | Aggregate confidence in range `0..1`. |
| `freshness_minutes` | integer or null | Age of the newest successful observation. |
| `fallback_rate` | number or null | Percent of metrics using fallback values. |
| `is_fallback` | boolean or null | True when any fallback is active. |

### MarketSourceDetail

Per-source detail exposed to the product for provenance.

| Field | Type | Notes |
| --- | --- | --- |
| `source` | string | Source family, such as `fred`, `eia`, `cbam+ecb`, or `eex-eu-ets`. |
| `status` | string | Source status. |
| `value` | number or null | Parsed or derived value. |
| `error` | string or null | Parser/fetch error if present. |
| `note` | string or null | Human-readable source caveat. |
| `region` | string | Source region. |
| `market_scope` | string | Scope such as `derived_proxy` or `carbon_ets_settlement`. |
| `lag_minutes` | integer or null | Expected source lag. |
| `confidence_score` | number | Source confidence in range `0..1`. |
| `fallback_used` | boolean | Whether this detail depends on fallback. |

### ReservesCoverage

Represents regional reserve coverage observations.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | UUID. |
| `country_iso` | string | Country or regional ISO-like key. |
| `timestamp` | datetime | Observation time. |
| `stock_days` | number | Estimated stock coverage in days. |
| `source` | string | Data source or estimator. |
| `confidence` | number | Confidence in range `0..1`. |
| `fetched_at` | datetime | Fetch time. |

### TippingEvent

Represents a persisted SAF competitiveness or alert event.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | UUID. |
| `timestamp` | datetime | Observation time. |
| `event_type` | enum | `ALERT`, `CRITICAL`, or `CROSSOVER`. |
| `gap_usd_per_litre` | number | SAF effective cost minus fossil price. |
| `fossil_price` | number | Fossil jet fuel price. |
| `saf_effective_price` | number | SAF effective price. |
| `saf_pathway` | string | Pathway identifier. |
| `triggered_by` | string or null | Trigger source. |
| `metadata` | object | Additional event context. |

### ESGSignal

Structured AI research signal.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | UUID. |
| `created_at` | datetime | Ingestion creation time. |
| `updated_at` | datetime | Last upsert time. |
| `source_url` | string | Unique source URL. |
| `signal_type` | enum | `SUPPLY_DISRUPTION`, `POLICY_CHANGE`, `PRICE_SHOCK`, `CAPACITY_ANNOUNCEMENT`, or `OTHER`. |
| `entities` | string[] | Companies, countries, policies, or market entities. |
| `impact_direction` | enum | `BEARISH_SAF`, `BULLISH_SAF`, or `NEUTRAL`. |
| `confidence` | number | Confidence in range `0..1`. |
| `summary_en` | string | English summary. |
| `summary_cn` | string | Chinese summary. |
| `raw_title` | string | Source title. |
| `raw_excerpt` | string | Source excerpt. |
| `published_at` | datetime | Source publication time. |
| `claude_model` | string | Extractor model or `mock`. |
| `prompt_cache_hit` | boolean | Whether Anthropic prompt cache was used. |

### AIResearchBudgetDay

Daily token budget ledger for live AI extraction.

| Field | Type | Notes |
| --- | --- | --- |
| `day` | string | ISO date key. |
| `tokens_used` | integer | Tokens recorded for the day. |
| `exhausted` | boolean | True after the configured budget is reached. |
| `updated_at` | datetime | Last update time. |

## Source Confidence Semantics

| Range | Meaning | UI behavior |
| --- | --- | --- |
| `0.90-1.00` | Strong live/public source. | Display as current/source-backed. |
| `0.70-0.89` | Reliable public source or good proxy. | Display normally with provenance. |
| `0.50-0.69` | Derived proxy or cached fallback. | Display with fallback note. |
| `0.30-0.49` | Weak fallback or stale source. | Display warning. |
| `0.00-0.29` | Deterministic fallback only. | Display degraded/offline state. |

## Database Tables

The active SQLAlchemy model set includes:

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

Alembic migrations in `apps/api/migrations/versions/` are the migration source of truth.

## Refresh And Fallback Rules

1. Market refresh should persist a snapshot set and a refresh run record.
2. Source failures should be represented in source detail metadata instead of hidden.
3. Deterministic fallback values are allowed only when they are labelled through confidence/fallback metadata.
4. Product read models should avoid blocking a full page on a single failed source.
5. Research ingestion is disabled by default and mock-first by default to avoid uncontrolled external spend.

## Versioning Rules

Patch updates may clarify documentation or add examples. Minor updates may add optional fields, new metrics, or new read endpoints. Major updates are required for deleting fields, renaming fields, changing field types, or changing enum semantics.

## Compatibility Notes

- Older contract drafts referenced earlier product branding and non-implemented primary feeds. Those references are now legacy.
- Existing compatibility code may still accept `SAFVSOIL_*` environment variables. New documentation and deployments should prefer `JETSCOPE_*` where supported.
- Historical migration notes are preserved in git history; this document describes the current product contract.
