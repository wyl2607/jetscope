import { describe, expect, it } from 'vitest';
import { evaluateThresholdAlerts, SAF_REFERENCE_MAX_AGE_DAYS } from '@/lib/threshold-alerts';
import type { DashboardReadModel, MarketSourceDetail } from '@/lib/product-read-model';

const now = new Date('2026-10-02T12:00:00Z');
function fixture(): Pick<DashboardReadModel, 'market' | 'tippingPoint' | 'isFallback' | 'analysisInputs'> {
  const detail = (source: string): MarketSourceDetail => ({
    source, status: 'live', quality: 'observed', freshness: 'current',
    observed_at: '2026-10-02T00:00:00Z', lag_minutes: 1440
  });
  return {
    isFallback: false,
    analysisInputs: { fossilJetUsdPerL: 1, carbonPriceEurPerT: 100, reserveWeeks: null, jetSourceKey: 'jet_usd_per_l', missingReason: null },
    market: { generated_at: now.toISOString(), source_status: { overall: 'ok' },
      values: { jet_usd_per_l: 1, eu_ets_price_eur_per_t: 100, usd_per_eur: 1 },
      source_details: { jet: detail('EIA'), eu_ets: detail('EUA'), ecb: detail('ECB') } },
    tippingPoint: {
      generated_at: now.toISOString(), inputs: { fossil_jet_usd_per_l: 1, carbon_price_eur_per_t: 100, subsidy_usd_per_l: 0, blend_rate_pct: 6 },
      effective_fossil_jet_usd_per_l: 1.25, pathways: [], signal: 'switch_window_opening',
      market_check: { reference_id: 'easa', kind: 'realized_average', region: 'EU', period: '2025', published_at: '2026-09-17',
        source_name: 'EASA', source_url: 'https://example.com/easa', pathway_key: 'hefa', saf_eur_per_t: 1796.875,
        saf_usd_per_l: 99, fossil_with_ets_usd_per_l: 99, premium_pct: 99, status: 'premium', statutory_allowance_coverage_pct: 50 }
    }
  };
}

describe('threshold alert eligibility', () => {
  it('calculates an exact 15% boundary with current FX, ignoring seed-converted API numbers', () => {
    const result = evaluateThresholdAlerts(fixture(), now);
    expect(result.jetSaf.suppression).toBeNull();
    expect(result.jetSaf.check?.premium_pct).toBe(15);
    expect(result.jetSaf.check?.status).toBe('inflection');
    expect(result.eua.triggered).toBe(true);
  });

  it.each([99.99, 100, 100.01])('EUA threshold is inclusive at %s EUR/t', (value) => {
    const model = fixture();
    model.market.values.eu_ets_price_eur_per_t = value;
    expect(evaluateThresholdAlerts(model, now).eua.triggered).toBe(value >= 100);
  });

  it.each([14.99, 15, 15.01, 0, -5])('classifies current spread at %s%%', (premium) => {
    const model = fixture();
    model.tippingPoint!.market_check!.saf_eur_per_t = 1.25 * (1 + premium / 100) * 1250;
    expect(evaluateThresholdAlerts(model, now).jetSaf.check?.status)
      .toBe(premium <= 0 ? 'competitive' : premium <= 15 ? 'inflection' : 'premium');
  });

  it('retains the statutory allowance what-if independently of the headline', () => {
    const model = fixture();
    model.tippingPoint!.market_check!.saf_eur_per_t = 1.25 * 1.3 * 1250;
    const check = evaluateThresholdAlerts(model, now).jetSaf.check!;
    expect(check.status).toBe('premium');
    expect(check.statutory_allowance_premium_pct).toBe(15);
  });

  it.each(['jet', 'eu_ets', 'ecb'] as const)('suppresses seed %s even when snapshot values cross thresholds', (key) => {
    const model = fixture();
    model.market.source_details![key].quality = 'seed';
    const result = evaluateThresholdAlerts(model, now);
    expect(result.jetSaf.check).toBeNull();
    expect(result.jetSaf.suppression?.reason).toBe('seed');
    expect(result.eua.triggered).toBe(key !== 'eu_ets');
  });

  it.each(['jet', 'eu_ets', 'ecb'] as const)('suppresses stale %s despite a fresh fetch and freshness label', (key) => {
    const model = fixture();
    model.market.source_details![key].observed_at = '2026-09-30T00:00:00Z';
    model.market.source_details![key].fetched_at = now.toISOString();
    const result = evaluateThresholdAlerts(model, now);
    expect(result.jetSaf.check).toBeNull();
    expect(result.jetSaf.suppression?.reason).toBe('stale');
    expect(result.eua.triggered).toBe(key !== 'eu_ets');
  });

  it.each(['seed', 'unknown', 'legacy', 'unverified', 'missing', 'stale'])('rejects %s EUA quality', (quality) => {
    const model = fixture();
    model.market.source_details!.eu_ets.quality = quality;
    const result = evaluateThresholdAlerts(model, now);
    expect(result.eua.triggered).toBe(false);
    expect(result.jetSaf.check).toBeNull();
  });

  it.each([null, NaN, Infinity, 0, -1])('rejects invalid EUA value %s', (value) => {
    const model = fixture();
    model.market.values.eu_ets_price_eur_per_t = value;
    expect(evaluateThresholdAlerts(model, now).eua.triggered).toBe(false);
  });

  it.each([undefined, 'invalid', '2026-10-03T00:00:00Z'])('rejects absent, invalid or future observation %s', (date) => {
    const model = fixture();
    model.market.source_details!.eu_ets.observed_at = date;
    expect(evaluateThresholdAlerts(model, now).eua.suppression?.reason).toBe('date');
  });

  it('rejects missing source evidence', () => {
    const model = fixture();
    delete model.market.source_details!.eu_ets;
    expect(evaluateThresholdAlerts(model, now).eua.suppression?.reason).toBe('missing');
  });

  it('allows a current derived jet proxy and rejects its stale input date', () => {
    const model = fixture();
    const detail = model.market.source_details!.jet;
    detail.quality = 'derived';
    detail.fallback_used = true;
    detail.observed_at = null;
    detail.input_observed_at = { brent: '2026-10-02T00:00:00Z', fx: '2026-10-02T01:00:00Z' };
    expect(evaluateThresholdAlerts(model, now).jetSaf.check).not.toBeNull();
    detail.input_observed_at.brent = '2026-09-01T00:00:00Z';
    expect(evaluateThresholdAlerts(model, now).jetSaf.suppression?.reason).toBe('stale');
  });

  it.each([null, 'invalid', '2026-10-03T00:00:00Z', '2026-09-01T00:00:00Z'])('rejects a derived constituent dated %s despite a current direct date', (date) => {
    const model = fixture();
    model.market.source_details!.jet.quality = 'derived';
    model.market.source_details!.jet.input_observed_at = { brent: '2026-10-02T00:00:00Z', fx: date };
    expect(evaluateThresholdAlerts(model, now).jetSaf.check).toBeNull();
  });

  it('uses the selected jet source when a seed candidate has the same value', () => {
    const model = fixture();
    model.market.values.rotterdam_jet_fuel_usd_per_l = 1;
    model.market.source_details!.rotterdam_jet_fuel = { source: 'seed-baseline', status: 'seed' };
    expect(evaluateThresholdAlerts(model, now).jetSaf.check).not.toBeNull();
    model.analysisInputs.jetSourceKey = 'rotterdam_jet_fuel_usd_per_l';
    expect(evaluateThresholdAlerts(model, now).jetSaf.suppression?.reason).toBe('seed');
  });

  it('rejects a report benchmark that no longer matches the selected source', () => {
    const model = fixture();
    model.tippingPoint!.inputs.fossil_jet_usd_per_l = 2;
    expect(evaluateThresholdAlerts(model, now).jetSaf.suppression).toEqual({ input: 'jet', reason: 'missing' });
  });

  it.each(['missing', 'error', 'fallback'])('rejects contradictory %s status on an observed EUA quote', (status) => {
    const model = fixture();
    model.market.source_details!.eu_ets.status = status;
    expect(evaluateThresholdAlerts(model, now).eua.triggered).toBe(false);
  });

  it('rejects a quote without a named source', () => {
    const model = fixture();
    model.market.source_details!.eu_ets.source = '';
    expect(evaluateThresholdAlerts(model, now).eua.suppression?.reason).toBe('missing');
  });

  it('keeps a negative statutory premium when SAF is already cheaper, as the API does', () => {
    const model = fixture();
    model.tippingPoint!.market_check!.saf_eur_per_t = 1.25 * 0.8 * 1250;
    expect(evaluateThresholdAlerts(model, now).jetSaf.check?.statutory_allowance_premium_pct).toBeCloseTo(-20);
  });

  it('suppresses fallback observations and fallback read models', () => {
    const model = fixture();
    model.market.source_details!.eu_ets.fallback_used = true;
    expect(evaluateThresholdAlerts(model, now).eua.suppression?.reason).toBe('fallback');
    model.isFallback = true;
    expect(evaluateThresholdAlerts(model, now).jetSaf.suppression).toEqual({ input: 'market', reason: 'fallback' });
  });

  it.each(['production_cost', 'forecast', 'seed'])('rejects SAF reference kind %s', (kind) => {
    const model = fixture();
    model.tippingPoint!.market_check!.kind = kind;
    expect(evaluateThresholdAlerts(model, now).jetSaf.suppression).toEqual({ input: 'saf', reason: 'unverified' });
    expect(evaluateThresholdAlerts(model, now).eua.triggered).toBe(true);
  });

  it('suppresses absent SAF reference', () => {
    const model = fixture();
    model.tippingPoint!.market_check = null;
    expect(evaluateThresholdAlerts(model, now).jetSaf.suppression?.reason).toBe('missing');
  });

  it('expires an annual SAF reference immediately beyond 400 days, independently of EUA', () => {
    const model = fixture();
    model.tippingPoint!.market_check!.published_at = new Date(now.getTime() - SAF_REFERENCE_MAX_AGE_DAYS * 86400000).toISOString();
    expect(evaluateThresholdAlerts(model, now).jetSaf.check).not.toBeNull();
    model.tippingPoint!.market_check!.published_at = new Date(now.getTime() - SAF_REFERENCE_MAX_AGE_DAYS * 86400000 - 1).toISOString();
    expect(evaluateThresholdAlerts(model, now).jetSaf.suppression?.reason).toBe('stale');
    expect(evaluateThresholdAlerts(model, now).eua.triggered).toBe(true);
  });
});
