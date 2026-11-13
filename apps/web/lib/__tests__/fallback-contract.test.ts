import { describe, expect, it } from 'vitest';
import { buildGermanyJetFuelReadModelFromPayload } from '@/lib/germany-jet-fuel-read-model';
import type { MarketSnapshot } from '@/lib/product-read-model';

const AT = '2026-09-23T16:18:51Z';

describe('fallbackKey contract', () => {
  it('does not substitute a number when the direct key and its fallbackKey are null', () => {
    const snapshot: MarketSnapshot = {
      generated_at: AT,
      fetched_at: AT,
      source_status: { overall: 'degraded', is_fallback: true, fallback_rate: 100 },
      values: {
        jet_eu_proxy_usd_per_l: null,
        jet_usd_per_l: null
      },
      source_details: {
        jet_eu_proxy: {
          source: 'test',
          status: 'missing',
          quality: 'missing',
          value: null,
          observed_at: null,
          fetched_at: AT
        },
        jet: {
          source: 'test',
          status: 'missing',
          quality: 'missing',
          value: null,
          observed_at: null,
          fetched_at: AT
        }
      }
    };

    const model = buildGermanyJetFuelReadModelFromPayload(snapshot, { metrics: {} }, 'zh');
    const metric = model.metrics.find((item) => item.metricKey === 'jet_eu_proxy_usd_per_l');

    expect(metric?.value).toBeNull();
    expect(metric?.quality).toBe('missing');
    expect(metric?.sourceMetricKey).toBe('jet_eu_proxy_usd_per_l');
  });
});
