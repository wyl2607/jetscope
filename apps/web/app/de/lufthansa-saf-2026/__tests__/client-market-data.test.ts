import { describe, it, expect } from 'vitest';
import { formatMarketValue } from '../client-market-data';

describe('formatMarketValue', () => {
  it('renders — for undefined value', () => {
    const result = formatMarketValue(undefined, String);
    expect(result.value).toBe('—');
    expect(result.detailText).toBe('fehlt');
  });

  it('keeps existing coverage detail text when missing', () => {
    const result = formatMarketValue(undefined, String, {
      metric_key: 'brent_usd_per_bbl',
      source_name: 'EIA',
      source_type: 'official',
      confidence_score: 0.8,
      status: 'ok',
      region: 'global',
      market_scope: 'benchmark',
      fallback_used: false,
      error: null,
      note: null,
      lag_minutes: 30,
      cbam_eur: null,
      usd_per_eur: null
    } as any);
    expect(result.value).toBe('—');
    expect(result.detailText).toBe('fehlt · EIA');
  });

  it('renders — for null value from the API', () => {
    expect(formatMarketValue(null, (n) => n.toFixed(2))).toEqual({ value: '—', detailText: 'fehlt' });
  });

  it('returns defined value without detail', () => {
    const result = formatMarketValue(1.23, (n) => `$${n.toFixed(2)}`);
    expect(result.value).toBe('$1.23');
    expect(result.detailText).toBeUndefined();
  });
});
