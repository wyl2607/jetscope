import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';

const FORBIDDEN_SEED_TEXT = ['87.01', '0.64', '0.657', '91.91', '92.5', '80.38', '1.1435'];

describe('getDashboardReadModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns only missing market and analysis inputs when the API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API unavailable')));

    const model = await getDashboardReadModel('zh');

    expect(model.market.values).toEqual({
      brent_usd_per_bbl: null,
      jet_usd_per_l: null,
      rotterdam_jet_fuel_usd_per_l: null,
      jet_eu_proxy_usd_per_l: null,
      carbon_proxy_usd_per_t: null
    });
    expect(model.analysisInputs).toEqual({
      fossilJetUsdPerL: null,
      carbonPriceEurPerT: null,
      reserveWeeks: null,
      jetSourceKey: 'unavailable',
      missingReason: 'API unavailable'
    });
    for (const forbidden of FORBIDDEN_SEED_TEXT) {
      expect(JSON.stringify(model)).not.toContain(forbidden);
    }
  });

  it('fetches user-created scenarios without the shared revalidation cache', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === '/market/snapshot') {
        return Response.json({
          generated_at: '2026-09-23T08:00:00Z',
          source_status: { overall: 'ok' },
          values: {},
          source_details: {}
        });
      }
      return Response.json(path.includes('/scenarios') ? [] : { metrics: {} });
    });
    vi.stubGlobal('fetch', fetchMock);

    await getDashboardReadModel('zh');

    const scenarioCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/scenarios'));
    expect(scenarioCall?.[1]).toMatchObject({ cache: 'no-store' });
    expect(scenarioCall?.[1]).not.toHaveProperty('next');
  });
});
