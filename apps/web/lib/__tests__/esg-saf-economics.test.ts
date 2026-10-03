import { describe, expect, it } from 'vitest';
import { esgSafEconomicsHref, esgSafJetReference } from '@/lib/esg-saf-economics';
import { assumed } from '@/lib/figure';
import type { MarketSnapshot } from '@/lib/product-read-model';

function market(): MarketSnapshot {
  return {
    generated_at: '2026-10-02T12:00:00Z',
    source_status: { overall: 'live' },
    values: { jet_eu_proxy_usd_per_l: 1.2, usd_per_eur: 1.25, jet_usd_per_l: 2 },
    source_details: {
      jet_eu_proxy: { source: 'brent-derived', status: 'estimated', as_of: '2026-09-30T00:00:00Z' },
      ecb: { source: 'ecb', status: 'live', as_of: '2026-10-01T00:00:00Z' }
    },
    assumptions: { usd_per_eur: { value: 1.1435, unit: 'USD/EUR', kind: 'assumption', as_of: '2026-07-17' } }
  };
}

describe('esg SAF project links', () => {
  it('converts the EU proxy using published FX and preserves both input provenances', () => {
    const reference = esgSafJetReference(market(), 'en');
    expect(reference.value).toBe(0.96);
    expect(reference.unit).toBe('EUR/L');
    expect(reference.basis).toBe('derived');
    expect(reference.asOf).toBe('2026-09-30T00:00:00Z');
    expect(reference.method).toContain('brent-derived (estimated, 2026-09-30T00:00:00Z)');
    expect(reference.method).toContain('ecb (live, 2026-10-01T00:00:00Z)');
    expect(reference.methodHref).toBe('/sources');
  });

  it.each([
    ['hefa', 'HEFA_EU'], ['atj', 'ATJ_Brazil'], ['ft', 'FT_biomass_DE'], ['ptl', 'PtL_EU_2025']
  ])('maps %s to %s, passing only the preset and unadjusted jet price', (pathway, preset) => {
    const url = new URL(esgSafEconomicsHref(pathway, esgSafJetReference(market()))!);
    expect(url.origin + url.pathname).toBe('https://esg.meichen.beauty/saf');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      preset, jet_fuel_price_eur_per_litre: '0.9600'
    });
  });

  it('keeps stale inputs explicit and uses the older source timestamp, never fetch time', () => {
    const input = market();
    input.source_details!.ecb.status = 'stale';
    input.source_details!.ecb.as_of = '2026-09-29T00:00:00Z';
    const reference = esgSafJetReference(input, 'en');
    expect(reference.value).toBe(0.96);
    expect(reference.asOf).toBe('2026-09-29T00:00:00Z');
    expect(reference.method).toContain('ecb (stale, 2026-09-29T00:00:00Z)');
  });

  it.each(['jet_eu_proxy_usd_per_l', 'usd_per_eur'])('does not replace missing %s with seed assumptions or US jet', (key) => {
    const input = market();
    input.values[key] = null;
    const reference = esgSafJetReference(input);
    expect(reference.value).toBeNull();
    expect(reference.asOf).toBeNull();
    expect(reference.reason).toBeTruthy();
    expect(new URL(esgSafEconomicsHref('hefa', reference)!).searchParams.has('jet_fuel_price_eur_per_litre')).toBe(false);
  });

  it.each(['missing', 'seed', 'ok', 'unknown'])('rejects the non-usable status %s even if a numeric value exists', (status) => {
    const input = market();
    input.source_details!.ecb.status = status;
    expect(esgSafJetReference(input).value).toBeNull();
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid price or FX %s', (value) => {
    for (const key of ['jet_eu_proxy_usd_per_l', 'usd_per_eur']) {
      const input = market();
      input.values[key] = value;
      expect(esgSafJetReference(input).value).toBeNull();
    }
  });

  it.each(['as_of', 'source', 'seed_quality'])('requires dated, sourced, non-seed input (%s)', (field) => {
    const input = market();
    const detail = input.source_details!.ecb;
    if (field === 'as_of') detail.as_of = null;
    if (field === 'source') detail.source = '';
    if (field === 'seed_quality') detail.quality = 'seed';
    expect(esgSafJetReference(input).value).toBeNull();
  });

  it('ignores source-detail values when published values are absent', () => {
    const input = market();
    input.values = {};
    input.source_details!.ecb.value = 1.25;
    input.source_details!.jet_eu_proxy.value = 1.2;
    expect(esgSafJetReference(input).value).toBeNull();
  });

  it('links to the preset alone when no reference is provided or it is a scenario assumption', () => {
    expect(esgSafEconomicsHref('hefa')).toBe('https://esg.meichen.beauty/saf?preset=HEFA_EU');
    const seed = assumed({ value: 0.9, unit: 'EUR/L', sourceId: 'test', method: 'seed' });
    expect(esgSafEconomicsHref('hefa', seed)).toBe(esgSafEconomicsHref('hefa'));
  });

  it('does not invent a preset for unknown or fossil rows', () => {
    expect(esgSafEconomicsHref('unknown')).toBeNull();
    expect(esgSafEconomicsHref('fossil_jet_crisis')).toBeNull();
    expect(esgSafEconomicsHref('toString')).toBeNull();
  });
});
