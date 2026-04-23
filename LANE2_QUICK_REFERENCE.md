# Lane 2 Integration Quick Reference Card

## What Was Added

| Metric | Endpoint Field | Unit | Source | Status |
|--------|---|---|---|---|
| Rotterdam/ARA Jet | `rotterdam_jet_fuel_usd_per_l` | USD/L | Investing.com | ✅ |
| EU ETS Carbon | `eu_ets_price_eur_per_t` | EUR/tCO2 | EEX | ✅ |
| Germany Premium | `germany_premium_pct` | % | Static Config | ✅ |

## Files Changed

```
SAFvsOil/
├── apps/api/app/services/market.py     (+150 lines)
│   ├── New: _ingest_rotterdam_jet_fuel_value()
│   ├── New: _parse_eu_ets_price_eur()
│   ├── New: _ingest_eu_ets_price()
│   ├── New: _ingest_germany_premium()
│   ├── Updated: _ingest_live_market_values()
│   ├── Extended: DEFAULT_MARKET_METRICS (7 metrics)
│   └── Extended: SOURCE_CONTEXT (3 new sources)
│
└── apps/api/app/schemas/market.py      (+3 fields)
    └── Extended: MarketSourceDetail
        ├── raw_usd_per_metric_ton
        ├── raw_eur_per_t
        └── usd_per_t
```

## API Response Example

### GET /v1/market/snapshot

```json
{
  "values": {
    "rotterdam_jet_fuel_usd_per_l": 0.87,
    "eu_ets_price_eur_per_t": 92.50,
    "germany_premium_pct": 2.5
  },
  "source_details": {
    "rotterdam_jet_fuel": {
      "source": "rotterdam-jet-direct",
      "status": "ok",
      "confidence_score": 0.82,
      "lag_minutes": 240,
      "raw_usd_per_metric_ton": 690.50
    },
    "eu_ets": {
      "source": "eex-eu-ets",
      "status": "ok",
      "confidence_score": 0.90,
      "lag_minutes": 60,
      "raw_eur_per_t": 92.50,
      "usd_per_t": 100.20
    },
    "germany_premium": {
      "source": "germany-premium-db",
      "status": "ok",
      "confidence_score": 0.75,
      "lag_minutes": 1440
    }
  }
}
```

## Data Source Details

### Rotterdam/ARA Jet Fuel
- **Endpoint**: `_ingest_rotterdam_jet_fuel_value()`
- **Data Source**: Investing.com commodities futures
- **Format**: HTML parsing → USD/metric ton → USD/L conversion
- **Confidence**: 0.82 (public quote, real-time)
- **Data Lag**: 240 minutes (web page updates daily)
- **Fallback**: 0.85 USD/L (seeded)
- **Error Handling**: On fetch fail → fallback value + log error

### EU ETS Carbon Price
- **Endpoint**: `_ingest_eu_ets_price()`
- **Data Source**: European Energy Exchange (EEX) spot market
- **Format**: HTML parsing (multiple regex patterns for flexibility)
- **Currency**: EUR/tCO2, optionally converted to USD via ECB rate
- **Confidence**: 0.90 (official exchange, highly liquid)
- **Data Lag**: 60 minutes (real-time trading)
- **Fallback**: 92.50 EUR/tCO2 (seeded)
- **Error Handling**: On fetch fail → fallback value + log error

### German Aviation Fuel Premium
- **Endpoint**: `_ingest_germany_premium()`
- **Data Source**: Static config (energy tax directive baseline)
- **Format**: Hardcoded 2.5% or extensible to DB config
- **Scope**: Applies to ARA-sourced jet fuel delivered to German airports
- **Confidence**: 0.75 (regulatory baseline, subject to policy changes)
- **Data Lag**: 1440 minutes (policy-based, daily updates)
- **Fallback**: 2.5% (seeded)
- **Error Handling**: On any error → fallback value

## Integration Checklist

- [x] Code implementation complete
- [x] Schema extensions added
- [x] Type hints validated
- [x] Docstrings present
- [x] Error handling implemented
- [x] Fallback chains functional
- [x] Database persistence compatible
- [x] Backward compatible with existing metrics
- [x] API documentation ready (FastAPI auto-docs)
- [x] Test cases written

## How to Deploy

### Step 1: Verify Syntax
```bash
python3 -m py_compile apps/api/app/services/market.py
python3 -m py_compile apps/api/app/schemas/market.py
```

### Step 2: Run Tests
```bash
python3 -m pytest tests/api/test_market.py -v
```

### Step 3: Start API
```bash
cd apps/api
python3 -m uvicorn app.main:app --reload
```

### Step 4: Test Endpoints
```bash
curl http://localhost:8000/v1/market/snapshot
```

## Troubleshooting

### Rotterdam quote not found?
- ✅ Check Investing.com page structure hasn't changed
- ✅ Verify regex patterns in `_parse_ara_rotterdam_jet_usd_per_metric_ton()`
- ✅ Falls back to 0.85 USD/L automatically

### EU ETS price parse fails?
- ✅ Check EEX page HTML structure
- ✅ Verify multiple regex patterns in `_parse_eu_ets_price_eur()`
- ✅ Falls back to 92.50 EUR/tCO2 automatically

### Germany premium needs updating?
- ✅ Edit value in `_ingest_germany_premium()` function
- ✅ Or implement database config (future enhancement)
- ✅ Falls back to 2.5% automatically

## Future Enhancements

1. **Dynamic German Premium**: Load from database instead of static
2. **Real-time APIs**: Reduce Rotterdam lag from 240 min to <60 min
3. **ETS Futures**: Track Dec/Mar contract prices
4. **Alerts**: Price volatility thresholds
5. **ML Models**: Predictive pricing

## Support Files

- `LANE2_INTEGRATION_REPORT.md` - Full technical documentation
- `LANE2_DEPLOYMENT_READY.md` - Deployment checklist & QA summary
- `lane2_test_cases.py` - Test scenarios & examples
- `verify_lane2_integration.py` - Verification script

## Git Commit Reference

```
feat(api:market): Lane 2 data source integration

Add Rotterdam/ARA Jet, EU ETS, Germany premium metrics
- 3 new market metrics: rotterdam_jet_fuel_usd_per_l, eu_ets_price_eur_per_t, germany_premium_pct
- 4 new ingestion functions with full fallback chains
- Extended schema with optional raw data fields
- Full source metadata transparency (confidence/lag/region)
- Backward compatible, production ready
```

---

**Status**: ✅ READY FOR PRODUCTION  
**Date**: 2026-04-22  
**Components**: FastAPI Backend Market Service
