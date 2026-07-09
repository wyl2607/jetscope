# JetScope API Contract v1

**Status:** Active v1 contract  
**Last updated:** 2026-04-24  
**Stability:** Stable for current product surfaces

## Purpose

This document describes the public API shape used by the JetScope web product. It supersedes earlier project wording while preserving compatibility where existing routes or environment variables still use legacy names.

JetScope API responses should make provenance explicit. Product surfaces must be able to distinguish live data, derived proxies, cached values, and deterministic fallback values.

For EU ETS/carbon-cost interpretation assumptions tied to this contract, see [EU_ETS_CARBON_ASSUMPTIONS.md](./EU_ETS_CARBON_ASSUMPTIONS.md).

## Contract Principles

1. API responses should expose source health, freshness, confidence, or fallback state wherever the product decision depends on data quality.
2. Read endpoints should degrade safely instead of failing the whole product surface when one upstream source is unavailable.
3. Write endpoints must be protected by `x-admin-token` and `JETSCOPE_ADMIN_TOKEN`.
4. New work should use JetScope naming. Legacy `SAFVSOIL_*` configuration remains compatibility-only.
5. The API must not claim authoritative paid feeds unless that integration exists in code and is operationally configured.

## Implemented Source Posture

The current market pipeline uses public sources and explicit proxies:

| Source key | Role | Notes |
| --- | --- | --- |
| `brent_fred` | Brent public time series | FRED CSV feed, daily publication cadence. |
| `jet_fred_proxy` | Jet-fuel public proxy | FRED Gulf Coast series, converted to USD/L. |
| `brent_eia` | Brent fallback source | EIA public benchmark page parser. |
| `cbam_proxy` | Carbon proxy | European Commission CBAM certificate price plus ECB EUR/USD. |
| `eu_ets_eex` | EU ETS price where available | Public EEX market page parsing. |
| `jet_ara_rotterdam_public` | ARA/Rotterdam aligned quote | Public Investing.com CIF NWE quote parsing where available. |
| `germany_premium` | Regional premium | Static/regulatory configuration in the market model. |
| deterministic defaults | Safe fallback | Used only when live or parsed data is unavailable. |

## Core Endpoints

### `GET /v1/health`

Returns service health and capability metadata.

The web application also exposes `GET /api/health` as a dynamic liveness
proxy to this endpoint. It is intentionally lightweight and must not be treated
as a launch-readiness or dependency-readiness gate.

### `GET /v1/readiness`

Returns launch-prerequisite checks. This endpoint may report `not_ready` in a
local quickstart when protected admin writes or AI research are intentionally
not configured. It reports configuration presence and status, not secret values.

Response shape:

```json
{
  "ready": false,
  "status": "not_ready",
  "generated_at": "2026-06-03T12:00:00Z",
  "service": "api",
  "environment": "development",
  "api_prefix": "/v1",
  "schema_bootstrap_mode": "alembic",
  "degraded": true,
  "checks": {
    "database": { "ok": true, "status": "ok", "detail": null },
    "market_snapshot": { "ok": true, "status": "degraded", "detail": "7 metrics available" },
    "source_coverage": { "ok": true, "status": "degraded", "detail": "completeness=1.000; metrics=7" },
    "admin_token": { "ok": false, "status": "missing", "detail": "JETSCOPE_ADMIN_TOKEN is not configured; protected writes and market refresh are locked" },
    "ai_research_pipeline": { "ok": false, "status": "disabled", "detail": "JETSCOPE_AI_RESEARCH_ENABLED is false; research signal generation is disabled" }
  }
}
```

### `GET /v1/market/snapshot`

Returns current market values and source metadata.

Response shape:

```json
{
  "generated_at": "2026-04-24T12:00:00Z",
  "source_status": {
    "overall": "live",
    "confidence": 0.82,
    "freshness_minutes": 22,
    "fallback_rate": 14.3,
    "is_fallback": true
  },
  "values": {
    "brent_usd_per_bbl": 84.25,
    "jet_usd_per_l": 0.99,
    "carbon_proxy_usd_per_t": 88.79,
    "jet_eu_proxy_usd_per_l": 0.86,
    "rotterdam_jet_fuel_usd_per_l": 0.85,
    "eu_ets_price_eur_per_t": 92.5,
    "germany_premium_pct": 2.5
  },
  "source_details": {
    "brent_eia": {
      "source": "eia",
      "status": "ok",
      "value": 84.25,
      "region": "global",
      "market_scope": "physical_spot_benchmark",
      "lag_minutes": 1440,
      "confidence_score": 0.88,
      "fallback_used": false,
      "note": "Daily benchmark page; parser depends on HTML shape."
    }
  }
}
```

### `GET /v1/market/history`

Returns historical market points grouped by metric.

### `POST /v1/market/refresh`

Admin-protected route that refreshes market snapshots.

Required header:

```text
x-admin-token: <JETSCOPE_ADMIN_TOKEN>
```

### `GET /v1/analysis/tipping-point`

Calculates SAF/fossil competitiveness.

Query parameters:

| Parameter | Type | Rule |
| --- | --- | --- |
| `fossil_jet_usd_per_l` | number | Required, greater than 0. |
| `carbon_price_eur_per_t` | number | Optional, default `0`, non-negative. |
| `subsidy_usd_per_l` | number | Optional, default `0`, non-negative. |
| `blend_rate_pct` | number | Optional, default `0`, between 0 and 100. |

### `GET /v1/analysis/airline-decision`

Returns airline-style procurement decision signals.

Query parameters:

| Parameter | Type | Rule |
| --- | --- | --- |
| `fossil_jet_usd_per_l` | number | Required, greater than 0. |
| `reserve_weeks` | number | Required, greater than 0. |
| `carbon_price_eur_per_t` | number | Optional, default `0`, non-negative. |
| `pathway_key` | string | Optional, defaults to the analysis pathway. |

### `GET /v1/analysis/tipping-point/events`

Returns persisted tipping events.

Query parameters:

| Parameter | Type | Rule |
| --- | --- | --- |
| `since` | ISO datetime | Optional lower bound. |
| `limit` | integer | Optional, 1 to 100, default `100`. |

### `GET /v1/analysis/grid-parity`

Compares grid-powered renewable pathways against fossil baseline costs.

Key query parameters:

| Parameter | Type | Rule |
| --- | --- | --- |
| `time_horizon_years` | number | Optional, 1 to 40. |
| `discount_rate_pct` | number | Optional, 0 to 100. |
| `carbon_price_eur_per_t` | number | Optional, default `0`. |

### `GET /v1/analysis/grid-parity/history`

Returns calibration and historical inputs used by grid parity calculations.

Key query parameters:

| Parameter | Type | Rule |
| --- | --- | --- |
| `years_back` | integer | Optional, 1 to 20, default `10`. |

### `POST /v1/analysis/grid-parity/history/seed`

Admin-protected idempotent seed for `MarketSnapshot` history inputs used by grid parity calculations.

Required header:

```text
x-admin-token: <JETSCOPE_ADMIN_TOKEN>
```

No request body is required; the route is safe to call repeatedly in local bootstrap and CI.

### `GET /v1/analysis/grid-parity/lcoe-sensitivity`

Returns a sensitivity sweep for grid LCOE assumptions.

Key query parameters:

| Parameter | Type | Rule |
| --- | --- | --- |
| `capex_shock_pct` | number | Optional, default `0`. |
| `wacc_delta_pct` | number | Optional, default `0`. |
| `load_factor_delta_pct` | number | Optional, default `0`. |

### `GET /v1/analysis/heat-parity`

Compares fossil and heat-pump/electrified pathways under local energy policy assumptions.

Key query parameters:

| Parameter | Type | Rule |
| --- | --- | --- |
| `fossil_heat_price` | number | Required, greater than `0`. |
| `heat_policy_subsidy_usd_per_m2` | number | Optional, default `0`. |
| `insulation_premium_factor` | number | Optional, default `1`. |

### `GET /v1/analysis/heat-parity/sensitivity`

Returns a sensitivity sweep for residential heat assumptions.

Key query parameters:

| Parameter | Type | Rule |
| --- | --- | --- |
| `climate_band` | string | Optional, defaults to current assumptions (`temperate`). |
| `energy_price_shock_pct` | number | Optional, default `0`. |
| `carbon_price_eur_per_t` | number | Optional, default `0`. |

### `GET /v1/analysis/crisis-brief`

Returns a read-only operating brief for the crisis monitor. The endpoint
aggregates the current market source status, EU reserve stress signal, recent
tipping events, research posture, and review actions so localized web pages do
not duplicate backend aggregation logic.

Query parameters:

| Parameter | Type | Rule |
| --- | --- | --- |
| `since` | ISO datetime | Optional lower bound for tipping events; defaults to the last 42 days. |
| `limit` | integer | Optional, 1 to 50, default `20`. |

Response shape:

```json
{
  "generated_at": "2026-06-04T12:00:00Z",
  "market_generated_at": "2026-06-04T11:58:00Z",
  "fossil_jet_usd_per_l": 0.845,
  "source_status": {
    "overall": "degraded",
    "confidence": 0.72,
    "freshness_minutes": 2,
    "fallback_rate": 14.0,
    "is_fallback": true
  },
  "reserve": {
    "generated_at": "2026-06-04T11:55:00Z",
    "region": "eu",
    "coverage_days": 24,
    "coverage_weeks": 3.43,
    "stress_level": "elevated",
    "estimated_supply_gap_pct": 9.5,
    "source_type": "official",
    "source_name": "IEA Oil Market Report",
    "confidence_score": 0.85
  },
  "tipping_events": [],
  "research": {
    "status": "disabled",
    "signal_count": 0,
    "top_signal_title": null,
    "top_signal_confidence": null,
    "latest_published_at": null
  },
  "actions": [
    {
      "id": "review_sources",
      "label": "Review source evidence",
      "href": "/sources?filter=review",
      "reason": "Check fallback, proxy, degraded, and volatile rows before using crisis signals operationally."
    }
  ]
}
```

### `GET /v1/reserves/eu`

Returns EU reserve coverage and stress signal used by the crisis surface.

### `GET /v1/research/signals`

Returns structured AI research signals from the Phase B pipeline.

Query parameters:

| Parameter | Type | Rule |
| --- | --- | --- |
| `since` | ISO datetime | Optional; defaults to the last 30 days. |
| `limit` | integer | Optional, 1 to 200, default `50`. |
| `signal_type` | enum | Optional: `SUPPLY_DISRUPTION`, `POLICY_CHANGE`, `PRICE_SHOCK`, `CAPACITY_ANNOUNCEMENT`, `OTHER`. |

Response item shape:

```json
{
  "id": "uuid",
  "created_at": "2026-04-24T12:00:00Z",
  "updated_at": "2026-04-24T12:00:00Z",
  "source_url": "https://example.com/article",
  "signal_type": "POLICY_CHANGE",
  "entities": ["EU"],
  "impact_direction": "BULLISH_SAF",
  "confidence": 0.82,
  "summary_en": "Policy expansion affecting SAF demand.",
  "summary_cn": "影响 SAF 需求的政策扩张。",
  "raw_title": "Article title",
  "raw_excerpt": "Article excerpt",
  "published_at": "2026-04-24T10:00:00Z",
  "claude_model": "claude-sonnet-4-6",
  "prompt_cache_hit": true
}
```

### `POST /v1/research/refresh`

Admin-protected route that manually runs the AI research pipeline after the
environment is configured.

Required header:

```text
x-admin-token: <JETSCOPE_ADMIN_TOKEN>
```

The route returns HTTP `409` when `JETSCOPE_AI_RESEARCH_ENABLED=false`, or when
live extraction is requested without `JETSCOPE_ANTHROPIC_API_KEY`.

Response shape:

```json
{
  "accepted": true,
  "message": "AI research refresh completed: fetched=3, extracted=2, persisted=2, skipped_budget=1",
  "fetched": 3,
  "extracted": 2,
  "persisted": 2,
  "skipped_budget": 1
}
```

### `GET /v1/sources/coverage`

Returns source quality and coverage metadata for the Sources page.

### Scenario And Preference Routes

| Endpoint | Methods | Notes |
| --- | --- | --- |
| `/v1/workspaces/{workspace_slug}/scenarios` | GET, POST | POST requires admin token. |
| `/v1/workspaces/{workspace_slug}/scenarios/{scenario_id}` | PUT, DELETE | Requires admin token. |
| `/v1/workspaces/{workspace_slug}/preferences` | GET, PUT, DELETE | Write operations require admin token. |

Workspace preference and scenario write routes are route-protected with `x-admin-token` and must return `401` when the token is absent or invalid in shared integration tests. Route tests also enforce workspace isolation so scenario and preference mutations only affect their explicit `workspace_slug` and cannot bleed across workspaces.

Scenario `name` values are trimmed by the API and must remain non-empty with a
maximum length of 120 characters. This keeps the protected scenario registry
usable for reviewers and API clients, not only browser users.

## Confidence Semantics

| Range | Meaning | Product behavior |
| --- | --- | --- |
| `0.90-1.00` | High confidence, live or strong source. | Display as current/source-backed. |
| `0.70-0.89` | Good public source or reliable proxy. | Display normally with source detail available. |
| `0.50-0.69` | Derived proxy or cached fallback. | Display with provenance/fallback note. |
| `0.30-0.49` | Weak fallback or stale source. | Display warning state. |
| `0.00-0.29` | Deterministic fallback only. | Display degraded/offline state. |

## Error Semantics

| Code | HTTP Status | Meaning | Expected consumer behavior |
| --- | --- | --- | --- |
| `DATA_SOURCE_ERROR` | 503 | Upstream data source unavailable. | Use degraded read model if possible. |
| `TIMEOUT` | 504 | Upstream request exceeded timeout. | Retry later; avoid blocking SSR. |
| `AUTH_ERROR` | 401 | Missing or invalid admin token. | Prompt for operational configuration. |
| `RATE_LIMITED` | 429 | Upstream or API rate limit. | Back off and use cached state. |
| validation error | 422 | FastAPI request validation failed. | Fix request parameters. |

## Compatibility Notes

- Older docs and scripts may still mention earlier project names. Treat that as legacy branding.
- Some environment variables still accept `SAFVSOIL_*` names for compatibility. Prefer `JETSCOPE_*` for new deployments.
- Earlier contract drafts referenced Bloomberg, PLATTS, or SENDX as primary feeds. Those should be considered aspirational unless implemented in code and configured in the deployment.
