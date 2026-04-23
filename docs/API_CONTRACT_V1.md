# Data Contract v1 — API Reference

**Status**: FROZEN v1.0.0  
**Last Updated**: 2026-04-23  
**Stability**: Production-ready

---

## Overview

The Data Contract v1 API provides unified access to SAFvsOil market data with:
- ✅ 7 standardized metrics (market_price, carbon_intensity, germany_premium, rotterdam_port, eu_ets_volume, data_freshness, source_status)
- ✅ Confidence scoring (1.0 = primary source, 0.5 = fallback, 0.3 = error retry, 0.0 = hardcoded)
- ✅ Automatic fallback chain (primary → cached → hardcoded)
- ✅ Real-time data freshness tracking (minutes since last update)
- ✅ Multi-source redundancy with health monitoring

---

## Metrics Definition

### 1. market_price
- **Description**: Brent crude oil price per barrel (USD)
- **Unit**: USD/bbl
- **Source**: Primary (Bloomberg API)
- **Fallback**: 24h cache → hardcoded seed value
- **Update Frequency**: Real-time (every 5 min)
- **Example Value**: 75.42

### 2. carbon_intensity
- **Description**: EU Emissions Trading System (ETS) carbon price per tonne
- **Unit**: EUR/tonne CO2e
- **Source**: Primary (SENDX API)
- **Fallback**: 24h cache → hardcoded seed value
- **Update Frequency**: Every 1h
- **Example Value**: 65.20

### 3. germany_premium
- **Description**: German SAF premium (aviation biofuel surcharge)
- **Unit**: EUR/liter
- **Source**: Primary (Destatis API) or calculated from DB
- **Fallback**: Config value → hardcoded seed
- **Update Frequency**: Daily
- **Example Value**: 0.35

### 4. rotterdam_port
- **Description**: Rotterdam port jet fuel price per liter
- **Unit**: USD/liter
- **Source**: Primary (PLATTS API)
- **Fallback**: 24h cache → hardcoded seed
- **Update Frequency**: Every 30 min
- **Example Value**: 1.82

### 5. eu_ets_volume
- **Description**: Total EU ETS carbon volume traded daily
- **Unit**: Million tonnes CO2e
- **Source**: Primary (SENDX/EEX API)
- **Fallback**: 24h cache → hardcoded seed
- **Update Frequency**: Daily
- **Example Value**: 45.63

### 6. data_freshness
- **Description**: Time since last successful data refresh (in minutes)
- **Unit**: Minutes
- **Calculated**: (NOW - last_update_timestamp) / 60
- **Threshold**: < 60 min = green, < 240 min = yellow, ≥ 240 min = red
- **Example Value**: 12

### 7. source_status
- **Description**: Aggregated data quality and source health
- **Type**: Object with confidence, freshness_minutes, fallback_rate, is_fallback
- **Confidence**: Average confidence across all 6 metrics (weighted)
- **Fallback Rate**: % of metrics currently using fallback (0-100)
- **Is Fallback**: Boolean (true if any metric using fallback chain)
- **Example**:
  ```json
  {
    "confidence": 0.92,
    "freshness_minutes": 12,
    "fallback_rate": 5,
    "is_fallback": false
  }
  ```

---

## Endpoints

### GET /v1/market/snapshot
Returns current snapshot of all 7 metrics with confidence and freshness data.

**Response** (200 OK):
```json
{
  "market_price": {
    "value": 75.42,
    "confidence": 1.0,
    "is_fallback": false
  },
  "carbon_intensity": {
    "value": 65.20,
    "confidence": 1.0,
    "is_fallback": false
  },
  "germany_premium": {
    "value": 0.35,
    "confidence": 0.5,
    "is_fallback": true
  },
  "rotterdam_port": {
    "value": 1.82,
    "confidence": 1.0,
    "is_fallback": false
  },
  "eu_ets_volume": {
    "value": 45.63,
    "confidence": 0.9,
    "is_fallback": false
  },
  "data_freshness": {
    "value": 12,
    "unit": "minutes"
  },
  "source_status": {
    "confidence": 0.92,
    "freshness_minutes": 12,
    "fallback_rate": 16,
    "is_fallback": true
  }
}
```

**Error** (503 Service Unavailable):
```json
{
  "error": "All data sources unavailable",
  "code": "DATA_SOURCE_ERROR",
  "fallback_chain_exhausted": true
}
```

### GET /v1/confidence/score
Returns confidence breakdown per metric and rationale for fallback usage.

**Response** (200 OK):
```json
{
  "market_price": {
    "confidence": 1.0,
    "source": "primary",
    "rationale": "Real-time Bloomberg API feed"
  },
  "carbon_intensity": {
    "confidence": 1.0,
    "source": "primary",
    "rationale": "SENDX API current session"
  },
  "germany_premium": {
    "confidence": 0.5,
    "source": "fallback",
    "rationale": "Using 24h cached value (Destatis API unavailable)"
  },
  "rotterdam_port": {
    "confidence": 1.0,
    "source": "primary",
    "rationale": "PLATTS API current session"
  },
  "eu_ets_volume": {
    "confidence": 0.9,
    "source": "primary_with_cache_supplement",
    "rationale": "Primary source available; partial data from cache"
  },
  "average_confidence": 0.92
}
```

### GET /v1/freshness/check
Returns data freshness status and recommended action.

**Response** (200 OK):
```json
{
  "market_price": {
    "minutes_stale": 5,
    "status": "green",
    "action": "use_data"
  },
  "carbon_intensity": {
    "minutes_stale": 45,
    "status": "green",
    "action": "use_data"
  },
  "germany_premium": {
    "minutes_stale": 480,
    "status": "red",
    "action": "use_with_warning"
  },
  "overall_status": "yellow"
}
```

---

## Confidence Scoring Guide

### Scoring Levels

| Confidence | Status | Meaning | Frontend Badge | Action |
|---|---|---|---|---|
| 1.0 | ✅ Green | Primary source (real-time) | None | Use directly |
| 0.9-0.99 | ✅ Green | Primary + cache supplement | None | Use directly |
| 0.5-0.89 | ⚠️ Yellow | Fallback (cache) being used | "Cached" | Display with warning |
| 0.3-0.49 | ⚠️ Yellow | Error retry fallback | "Retrying" | Display with warning |
| 0.0-0.29 | 🔴 Red | Hardcoded fallback | "Offline" | Display prominently with warning |

### Calculation Logic

```python
confidence = {
  "primary": 1.0,           # Current live data from API
  "fallback": 0.5,          # Using 24h cache (primary unavailable)
  "error_retry": 0.3,       # Using error retry chain
  "hardcoded": 0.0          # Using hardcoded seed value
}

source_status.confidence = sum(individual_confidences) / 6
source_status.fallback_rate = (count_of_fallback_metrics / 6) * 100
source_status.is_fallback = any(confidence < 1.0 for metric in metrics)
```

---

## Error Codes

| Code | HTTP Status | Meaning | Recovery |
|---|---|---|---|
| DATA_SOURCE_ERROR | 503 | All data sources unavailable | Retry after 60s; fallback to hardcoded |
| PARSE_ERROR | 400 | Invalid request parameters | Check API docs; retry with valid params |
| TIMEOUT | 504 | Data source took too long | Automatic retry (5s); fallback to cache |
| AUTH_ERROR | 401 | API authentication failed | Check credentials; contact ops |
| RATE_LIMITED | 429 | Too many requests | Back off; implement exponential retry |

---

## Monitoring Thresholds

### Production Alert Rules

```bash
# 1. Data Freshness
if freshness_minutes > 240:
  alert_level = "red"
elif freshness_minutes > 60:
  alert_level = "yellow"
else:
  alert_level = "green"

# 2. Fallback Rate
if fallback_rate > 50:
  alert_level = "red"
elif fallback_rate > 10:
  alert_level = "yellow"
else:
  alert_level = "green"

# 3. Confidence Score
if confidence < 0.5:
  alert_level = "red"
elif confidence < 0.9:
  alert_level = "yellow"
else:
  alert_level = "green"
```

### Monitoring Script Output

```bash
# Run manually:
curl http://${CLUSTER_NODE}:8000/v1/market/snapshot | jq '.source_status'

# Expected output (green):
{
  "confidence": 0.95,
  "freshness_minutes": 12,
  "fallback_rate": 5,
  "is_fallback": false
}

# If red (alert):
Slack message: "🚨 Data confidence dropped to 0.35; fallback_rate=60%"
```

---

## Frontend Integration Guide

### 1. Display Fallback Badge

```typescript
const ConfidenceBadge = ({ source_status }) => {
  if (source_status.confidence >= 0.9) {
    return <span>✅ Live</span>;
  } else if (source_status.confidence >= 0.5) {
    return <span>⚠️ Cached</span>;
  } else {
    return <span>🔴 Offline</span>;
  }
};
```

### 2. Show Freshness Indicator

```typescript
const FreshnessIndicator = ({ freshness_minutes }) => {
  if (freshness_minutes < 60) {
    return <span className="text-green-600">Fresh ({freshness_minutes}m)</span>;
  } else if (freshness_minutes < 240) {
    return <span className="text-yellow-600">Stale ({freshness_minutes}m)</span>;
  } else {
    return <span className="text-red-600">Very Stale ({freshness_minutes}m)</span>;
  }
};
```

### 3. Handle Confidence-Based UI

```typescript
// In Dashboard component:
const metricValue = metric.value;
const displayStyle = metric.is_fallback 
  ? "opacity-60 line-through" 
  : "font-bold";

<div className={displayStyle}>
  {metricValue}
  {metric.is_fallback && <FallbackBadge confidence={metric.confidence} />}
</div>
```

---

## Backward Compatibility

The API maintains backward compatibility with legacy metric names:

| v1 Metric | Legacy Name | Mapping |
|---|---|---|
| market_price | brent_usd_per_bbl | Same value, different key |
| carbon_intensity | eu_ets_price_eur_per_t | Same value, different key |
| rotterdam_port | rotterdam_jet_fuel_usd_per_l | Same value, different key |

**Response includes both v1 and legacy names**:
```json
{
  "market_price": 75.42,
  "brent_usd_per_bbl": 75.42,
  ...
}
```

---

## Rate Limits

- **Standard**: 100 requests per minute per client
- **Burst**: 500 requests per minute (authenticated)
- **Penalties**: 429 Too Many Requests; retry after 60s

---

## Support

- **Issues**: File PR against apps/api/
- **Questions**: See DEPLOYMENT_GUIDE.md
- **Monitoring**: Check scripts/monitoring/*.sh for examples
- **On-call**: Contact @data-reliability-team

---

**Version History**:
- v1.0.0 (2026-04-23): Frozen for production deployment
