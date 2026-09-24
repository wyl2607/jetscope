import { describe, expect, it } from 'vitest';
import { buildGermanyJetFuelReadModelFromPayload } from '@/lib/germany-jet-fuel-read-model';
import type { MarketSnapshot, MarketSourceDetail } from '@/lib/product-read-model';

const AT = '2026-09-23T16:18:51Z';

function detail(status: string, quality: string, value: number | null): MarketSourceDetail {
  return { source: 'test', status, quality, value, observed_at: AT, fetched_at: AT };
}

// Shape of the live /v1/market/snapshot on 2026-09-23: 4 live, 3 estimated, 1 missing.
function degradedSnapshot(): MarketSnapshot {
  return {
    generated_at: AT,
    fetched_at: AT,
    source_status: { overall: 'degraded', fallback_rate: 50, is_fallback: true },
    values: {
      brent_usd_per_bbl: 114.89,
      jet_usd_per_l: 1.05,
      rotterdam_jet_fuel_usd_per_l: 1.08,
      jet_eu_proxy_usd_per_l: 1.092,
      carbon_proxy_usd_per_t: 95,
      usd_per_eur: 1.1,
      eu_ets_price_eur_per_t: 80
    },
    source_details: {
      brent: detail('live', 'observed', 114.89),
      jet: detail('live', 'observed', 1.05),
      ecb: detail('live', 'observed', 1.1),
      eu_ets: detail('live', 'observed', 80),
      germany_premium: detail('missing', 'missing', null),
      rotterdam_jet_fuel: detail('estimated', 'derived', 1.08),
      jet_eu_proxy: detail('estimated', 'derived', 1.092),
      carbon: detail('estimated', 'derived', 95)
    }
  };
}

describe('buildGermanyJetFuelReadModelFromPayload source health', () => {
  it('treats a partly live snapshot as degraded, not as a fallback', () => {
    const model = buildGermanyJetFuelReadModelFromPayload(degradedSnapshot(), { metrics: {} }, 'zh');

    expect(model.isFallback).toBe(false);
    expect(model.sourceHealth).toEqual({ live: 4, total: 8 });
    expect(model.error).toBeNull();
    // Display is not a fallback, but the API flag still blocks the decision signal.
    expect(model.decision).toBe('insufficient');
    const byKey = Object.fromEntries(model.metrics.map((metric) => [metric.metricKey, metric]));
    expect(byKey.brent_usd_per_bbl.sourceStatus).toBe('live');
    expect(byKey.jet_eu_proxy_usd_per_l.sourceStatus).toBe('estimated');
    expect(byKey.jet_eu_proxy_usd_per_l.value).toBe(1.092);
  });

  it('is a fallback when no source is live', () => {
    const snapshot = degradedSnapshot();
    snapshot.source_details = Object.fromEntries(
      Object.entries(snapshot.source_details ?? {}).map(([key, value]) => [key, { ...value, status: 'estimated' }])
    );
    const model = buildGermanyJetFuelReadModelFromPayload(snapshot, { metrics: {} }, 'zh');

    expect(model.isFallback).toBe(true);
    expect(model.sourceHealth).toEqual({ live: 0, total: 8 });
    expect(model.decision).toBe('insufficient');
  });

  it('falls back to the API flag when the snapshot has no source details', () => {
    const snapshot = { ...degradedSnapshot(), source_details: undefined };
    const model = buildGermanyJetFuelReadModelFromPayload(snapshot, { metrics: {} }, 'zh');

    expect(model.sourceHealth).toBeNull();
    expect(model.isFallback).toBe(true);
  });
});
