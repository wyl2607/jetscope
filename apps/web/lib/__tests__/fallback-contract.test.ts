import { describe, expect, it } from 'vitest';
import { buildGermanyJetFuelReadModelFromPayload } from '@/lib/germany-jet-fuel-read-model';
import {
  toTippingPointReadModel,
  type MarketSnapshot,
  type TippingPointResponse
} from '@/lib/product-read-model';

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

describe('tipping-point missing-input contract', () => {
  it('keeps a null effective fossil price null instead of synthesizing zero', () => {
    const response = {
      generated_at: AT,
      inputs: {
        fossil_jet_usd_per_l: 1.092,
        carbon_price_eur_per_t: 85,
        subsidy_usd_per_l: 0,
        blend_rate_pct: 0
      },
      effective_fossil_jet_usd_per_l: null,
      pathways: [],
      signal: 'fossil_still_advantaged'
    } as unknown as TippingPointResponse;

    const model = toTippingPointReadModel(response)!;

    expect(model.effectiveFossilJetUsdPerL).toBeNull();
    expect(model.inputs.fossilJetUsdPerL).toBe(1.092);
    expect(model.inputs.carbonPriceEurPerT).toBe(85);
    // Legitimate zero inputs stay zero; only absent values become null.
    expect(model.inputs.subsidyUsdPerL).toBe(0);
    expect(model.inputs.blendRatePct).toBe(0);
  });

  it('leaves every absent input null for a partial response', () => {
    const response = {
      generated_at: AT,
      effective_fossil_jet_usd_per_l: null,
      pathways: [],
      signal: 'fossil_still_advantaged'
    } as unknown as TippingPointResponse;

    const model = toTippingPointReadModel(response)!;

    expect(model.effectiveFossilJetUsdPerL).toBeNull();
    expect(model.inputs).toEqual({
      fossilJetUsdPerL: null,
      carbonPriceEurPerT: null,
      subsidyUsdPerL: null,
      blendRatePct: null
    });
  });
});
