import assert from 'node:assert/strict';
import test from 'node:test';

import { importWebLib } from './helpers/load-web-lib.mjs';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function installFetchStub(t, handlers) {
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = String(input);
    const handler = handlers.get(url);
    if (!handler) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return handler();
  };
  t.after(() => {
    global.fetch = originalFetch;
  });
}

function installEnv(t, nextEnv) {
  const previous = new Map();
  for (const [key, value] of Object.entries(nextEnv)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test('getDashboardReadModel summarizes live market, scenario, and risk signals for the dashboard', async (t) => {
  installEnv(t, {
    JETSCOPE_API_BASE_URL: 'https://api.example.com',
    JETSCOPE_API_PREFIX: '/v1',
    JETSCOPE_WORKSPACE_SLUG: 'ops'
  });

  const originalDateNow = Date.now;
  Date.now = () => new Date('2026-04-23T12:30:00Z').getTime();
  t.after(() => {
    Date.now = originalDateNow;
  });

  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/market/snapshot',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:00:00Z',
            source_status: { overall: 'ok' },
            values: {
              brent_usd_per_bbl: 82.4,
              jet_usd_per_l: 1.04,
              jet_eu_proxy_usd_per_l: 1.31,
              carbon_proxy_usd_per_t: 97.2
            }
          })
      ],
      [
        'https://api.example.com/v1/workspaces/ops/scenarios',
        () =>
          jsonResponse([
            { id: 'scenario-1', name: 'Base case', saved_at: '2026-04-22T12:00:00Z' },
            { id: 'scenario-2', name: 'EU shock', saved_at: '2026-04-22T10:00:00Z' },
            { id: 'scenario-3', name: 'High carbon', saved_at: '2026-04-21T10:00:00Z' },
            { id: 'scenario-4', name: 'Extra', saved_at: '2026-04-20T10:00:00Z' }
          ])
      ],
      [
        'https://api.example.com/v1/market/history',
        () =>
          jsonResponse({
            metrics: {
              brent_usd_per_bbl: {
                metric_key: 'brent_usd_per_bbl',
                unit: 'USD/bbl',
                latest_as_of: '2026-04-23T12:00:00Z',
                change_pct_1d: 12.5,
                change_pct_7d: 9.1,
                change_pct_30d: 2.2,
                points: [{ as_of: '2026-04-22T12:00:00Z', value: 74 }]
              },
              jet_usd_per_l: {
                metric_key: 'jet_usd_per_l',
                unit: 'USD/L',
                latest_as_of: '2026-04-23T12:00:00Z',
                change_pct_1d: 4.5,
                change_pct_7d: 8.1,
                change_pct_30d: 9.9,
                points: [{ as_of: '2026-04-22T12:00:00Z', value: 0.98 }]
              }
            }
          })
      ],
      [
        'https://api.example.com/v1/reserves/eu',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:00:00Z',
            region: 'eu',
            coverage_days: 18,
            coverage_weeks: 2.6,
            stress_level: 'tight',
            estimated_supply_gap_pct: 9.8,
            source_type: 'model',
            source_name: 'Reserve Monitor',
            confidence_score: 0.79
          })
      ],
      [
        'https://api.example.com/v1/analysis/tipping-point?fossil_jet_usd_per_l=1.30&carbon_price_eur_per_t=95&subsidy_usd_per_l=0&blend_rate_pct=6',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:00:00Z',
            effective_fossil_jet_usd_per_l: 1.33,
            signal: 'watch',
            inputs: {
              fossil_jet_usd_per_l: 1.3,
              carbon_price_eur_per_t: 95,
              subsidy_usd_per_l: 0,
              blend_rate_pct: 6
            },
            pathways: []
          })
      ],
      [
        'https://api.example.com/v1/analysis/airline-decision?fossil_jet_usd_per_l=1.30&reserve_weeks=3&carbon_price_eur_per_t=95&pathway_key=hefa',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:00:00Z',
            signal: 'watch',
            probabilities: {
              raise_fares: 0.4,
              cut_capacity: 0.2,
              buy_spot_saf: 0.15,
              sign_long_term_offtake: 0.2,
              ground_routes: 0.05
            }
          })
      ],
      [
        'https://api.example.com/v1/sources/coverage',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:00:00Z',
            metrics: [
              {
                metric_key: 'jet_usd_per_l',
                source_name: 'ICE Jet',
                source_type: 'market_primary',
                confidence_score: 0.93,
                lag_minutes: 30,
                fallback_used: false,
                status: 'ok',
                region: 'global',
                market_scope: 'benchmark'
              }
            ]
          })
      ]
    ])
  );

  const { getDashboardReadModel } = await importWebLib('apps/web/lib/dashboard-read-model.ts');
  assert.equal(typeof getDashboardReadModel, 'function');
  const readModel = await getDashboardReadModel();

  assert.equal(readModel.isFallback, false);
  assert.equal(readModel.market.source_status.overall, 'ok');
  assert.equal(readModel.scenarioCount, 4);
  assert.deepEqual(readModel.recentScenarioNames, ['Base case', 'EU shock', 'High carbon']);
  assert.equal(readModel.freshnessSignal.level, 'fresh');
  assert.equal(readModel.freshnessSignal.minutes, 30);
  assert.equal(readModel.topRiskSignal?.metric, 'Brent');
  assert.equal(readModel.topRiskSignal?.metricKey, 'brent_usd_per_bbl');
  assert.equal(readModel.topRiskSignal?.window, '1d');
  assert.equal(readModel.topRiskSignal?.level, 'watch');
  assert.equal(readModel.topRiskSignal?.sampleCount, 1);
  assert.equal(readModel.reserve?.coverage_weeks, 2.6);
  assert.equal(readModel.sourceCoverage?.metrics[0].source_name, 'ICE Jet');
});

test('getDashboardReadModel falls back to safe dashboard defaults when the market snapshot fails', async (t) => {
  installEnv(t, {
    JETSCOPE_API_BASE_URL: 'https://api.example.com',
    JETSCOPE_API_PREFIX: '/v1',
    JETSCOPE_WORKSPACE_SLUG: 'ops'
  });

  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/market/snapshot',
        () => jsonResponse({ error: 'upstream down' }, 503)
      ]
    ])
  );

  const { getDashboardReadModel } = await importWebLib('apps/web/lib/dashboard-read-model.ts');
  const readModel = await getDashboardReadModel();

  assert.equal(readModel.isFallback, true);
  assert.equal(readModel.market.source_status.overall, 'degraded');
  assert.equal(readModel.scenarioCount, 0);
  assert.equal(readModel.topRiskSignal, null);
  assert.match(readModel.error ?? '', /HTTP 503/);
});

test('getPriceTrendChartReadModel maps live market history into chart-friendly metrics', async (t) => {
  installEnv(t, {
    JETSCOPE_API_BASE_URL: 'https://api.example.com',
    JETSCOPE_API_PREFIX: '/v1'
  });

  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/market/history',
        () =>
          jsonResponse({
            metrics: {
              brent_usd_per_bbl: {
                metric_key: 'brent_usd_per_bbl',
                unit: 'USD/bbl',
                latest_value: 82.4,
                latest_as_of: '2026-04-23T12:00:00Z',
                change_pct_1d: 1.2,
                change_pct_7d: 3.4,
                change_pct_30d: 5.6,
                points: [{ as_of: '2026-04-22T12:00:00Z', value: 80.1 }]
              }
            }
          })
      ]
    ])
  );

  const { getPriceTrendChartReadModel } = await importWebLib(
    'apps/web/lib/price-trend-chart-read-model.ts'
  );
  const readModel = await getPriceTrendChartReadModel();

  assert.equal(readModel.isFallback, false);
  assert.equal(readModel.error, null);
  assert.equal(readModel.metrics.brent_usd_per_bbl.metric_key, 'brent_usd_per_bbl');
  assert.equal(readModel.metrics.brent_usd_per_bbl.latest_value, 82.4);
  assert.equal(readModel.metrics.brent_usd_per_bbl.change_pct_7d, 3.4);
  assert.equal(readModel.metrics.brent_usd_per_bbl.points.length, 1);
});

test('getPriceTrendChartReadModel falls back when market history is unavailable', async (t) => {
  installEnv(t, {
    JETSCOPE_API_BASE_URL: 'https://api.example.com',
    JETSCOPE_API_PREFIX: '/v1'
  });

  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/market/history',
        () => jsonResponse({ error: 'down' }, 503)
      ]
    ])
  );

  const { getPriceTrendChartReadModel } = await importWebLib(
    'apps/web/lib/price-trend-chart-read-model.ts'
  );
  const readModel = await getPriceTrendChartReadModel();

  assert.equal(readModel.isFallback, true);
  assert.deepEqual(readModel.metrics, {});
  assert.match(readModel.error ?? '', /HTTP 503/);
});

test('getGermanyJetFuelReadModel falls back from EU proxy history to global jet history when needed', async (t) => {
  installEnv(t, {
    JETSCOPE_API_BASE_URL: 'https://api.example.com',
    JETSCOPE_API_PREFIX: '/v1'
  });

  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/market/snapshot',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:00:00Z',
            source_status: { overall: 'ok' },
            values: {
              brent_usd_per_bbl: 82.4,
              jet_usd_per_l: 1.04,
              carbon_proxy_usd_per_t: 97.2
            }
          })
      ],
      [
        'https://api.example.com/v1/market/history',
        () =>
          jsonResponse({
            metrics: {
              brent_usd_per_bbl: {
                metric_key: 'brent_usd_per_bbl',
                unit: 'USD/bbl',
                latest_as_of: '2026-04-23T12:00:00Z',
                change_pct_1d: 2.5,
                points: []
              },
              jet_usd_per_l: {
                metric_key: 'jet_usd_per_l',
                unit: 'USD/L',
                latest_as_of: '2026-04-23T12:00:00Z',
                change_pct_1d: 6.2,
                change_pct_7d: 12.1,
                change_pct_30d: 18.4,
                points: []
              },
              carbon_proxy_usd_per_t: {
                metric_key: 'carbon_proxy_usd_per_t',
                unit: 'USD/tCO2',
                latest_as_of: '2026-04-23T12:00:00Z',
                change_pct_1d: 1.5,
                points: []
              }
            }
          })
      ]
    ])
  );

  const { getGermanyJetFuelReadModel } = await importWebLib('apps/web/lib/germany-jet-fuel-read-model.ts');
  const readModel = await getGermanyJetFuelReadModel();
  const euProxyMetric = readModel.metrics.find((metric) => metric.metricKey === 'jet_eu_proxy_usd_per_l');

  assert.equal(readModel.isFallback, false);
  assert.equal(readModel.overallStatus, 'ok');
  assert.equal(euProxyMetric?.value, 1.04);
  assert.equal(euProxyMetric?.sourceMetricKey, 'jet_usd_per_l');
  assert.equal(euProxyMetric?.changePct7d, 12.1);
  assert.equal(euProxyMetric?.note, 'Fallback from 航煤');
});

test('crisis page uses light semantic data cards instead of gray dark boxes', async () => {
  const { readFile } = await import('node:fs/promises');
  const files = [
    'apps/web/app/crisis/page.tsx',
    'apps/web/components/reserves-coverage-strip.tsx',
    'apps/web/components/tipping-event-timeline.tsx',
    'apps/web/components/research-decision-brief.tsx'
  ];

  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(
      source,
      /bg-slate-950|bg-slate-900|border-slate-800|text-white|text-slate-300/,
      `${file} should stay on the light crisis review theme`
    );
  }

  const crisisSource = await readFile(new URL('../apps/web/app/crisis/page.tsx', import.meta.url), 'utf8');
  assert.match(crisisSource, /sourceTypeLabel/);
  assert.match(crisisSource, /confidenceTone/);
  assert.match(crisisSource, /marketConfidence/);
  assert.match(crisisSource, /buildSafWorkbenchHref/);
  assert.match(crisisSource, /reviewSourcesHref/);
  assert.match(crisisSource, /sources\?filter=review/);
  assert.match(crisisSource, /fuel: fallbackFossil\.toFixed\(3\)/);
  assert.match(crisisSource, /reserve: reserveWeeks\?\.toFixed\(2\)/);
  assert.match(crisisSource, /border-emerald-200 bg-emerald-50/);
  assert.match(crisisSource, /border-amber-200 bg-amber-50/);
  assert.match(crisisSource, /border-sky-200 bg-sky-50/);
});

test('reserve price trends guard finite chart coordinates and highlight the current SAF breakpoint', async () => {
  const { readFile } = await import('node:fs/promises');
  const reserveSource = await readFile(new URL('../apps/web/app/crisis/eu-jet-reserves/page.tsx', import.meta.url), 'utf8');
  const chartSource = await readFile(new URL('../apps/web/components/price-trends-chart.tsx', import.meta.url), 'utf8');

  assert.match(reserveSource, /CurrentSafBreakpointRow/);
  assert.match(reserveSource, /当前拐点/);
  assert.match(reserveSource, /ring-2 ring-amber-300/);
  assert.match(reserveSource, /历史价格趋势/);
  assert.match(reserveSource, /本地 market_snapshots 历史库/);
  assert.match(chartSource, /finitePoints/);
  assert.match(chartSource, /Number\.isFinite\(point\.value\)/);
  assert.match(chartSource, /safeYRange/);
  assert.doesNotMatch(chartSource, /const yRange = yMax - yMin;/);
});
