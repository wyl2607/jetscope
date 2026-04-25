# JetScope API Contract v1

**Status:** Active v1 contract  
**Last updated:** 2026-04-24  
**Stability:** Stable for current product surfaces

## Purpose

This document describes the public API shape used by the JetScope web product. It supersedes earlier project wording while preserving compatibility where existing routes or environment variables still use legacy names.

JetScope API responses should make provenance explicit. Product surfaces must be able to distinguish live data, derived proxies, cached values, and deterministic fallback values.

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

### `GET /v1/sources/coverage`

Returns source quality and coverage metadata for the Sources page.

### Scenario And Preference Routes

| Endpoint | Methods | Notes |
| --- | --- | --- |
| `/v1/workspaces/{workspace_slug}/scenarios` | GET, POST | POST requires admin token. |
| `/v1/workspaces/{workspace_slug}/scenarios/{scenario_id}` | PUT, DELETE | Requires admin token. |
| `/v1/workspaces/{workspace_slug}/preferences` | GET, PUT, DELETE | Write operations require admin token. |

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
