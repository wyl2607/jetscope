import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

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

function installEnv(t) {
  const previousBase = process.env.JETSCOPE_API_BASE_URL;
  const previousPrefix = process.env.JETSCOPE_API_PREFIX;
  process.env.JETSCOPE_API_BASE_URL = 'https://api.example.com';
  process.env.JETSCOPE_API_PREFIX = '/v1';
  t.after(() => {
    if (previousBase === undefined) {
      delete process.env.JETSCOPE_API_BASE_URL;
    } else {
      process.env.JETSCOPE_API_BASE_URL = previousBase;
    }
    if (previousPrefix === undefined) {
      delete process.env.JETSCOPE_API_PREFIX;
    } else {
      process.env.JETSCOPE_API_PREFIX = previousPrefix;
    }
  });
}

async function importSourcesReadModel() {
  const source = await readFile(new URL('../apps/web/lib/sources-read-model.ts', import.meta.url), 'utf8');
  const contractUrl = new URL('../apps/web/lib/source-coverage-contract.ts', import.meta.url).href;
  const apiConfigUrl = new URL('../apps/web/lib/api-config.ts', import.meta.url).href;
  const rewritten = source
    .replaceAll("'@/lib/api-config'", `'${apiConfigUrl}'`)
    .replaceAll("'./source-coverage-contract'", `'${contractUrl}'`);
  const tempDir = await mkdtemp(path.join(tmpdir(), 'jetscope-sources-read-model-'));
  const tempPath = path.join(tempDir, 'sources-read-model.ts');
  await writeFile(tempPath, rewritten, 'utf8');
  return import(`${pathToFileURL(tempPath).href}?ts=${Date.now()}-${Math.random()}`);
}

test('source coverage contract owns trust-state and lag formatting helpers', async () => {
  const contract = await import('../apps/web/lib/source-coverage-contract.ts');
  assert.equal(typeof contract.getSourceCoverageTrustState, 'function');
  assert.equal(typeof contract.formatSourceCoverageLag, 'function');

  assert.equal(
    contract.getSourceCoverageTrustState({
      metric_key: 'jet_usd_per_l',
      source_name: 'FRED',
      source_type: 'market_primary',
      confidence_score: 0.91,
      lag_minutes: 45,
      fallback_used: false,
      status: 'ok',
      region: 'us',
      market_scope: 'statistical_series'
    }),
    'live'
  );
  assert.equal(
    contract.getSourceCoverageTrustState({
      metric_key: 'jet_eu_proxy_usd_per_l',
      source_name: 'Brent-derived',
      source_type: 'derived',
      confidence_score: 0.65,
      lag_minutes: null,
      fallback_used: false,
      status: 'ok',
      region: 'eu',
      market_scope: 'derived_proxy'
    }),
    'proxy'
  );
  assert.equal(contract.formatSourceCoverageLag(59), '59m');
  assert.equal(contract.formatSourceCoverageLag(60), '1h');
  assert.equal(contract.formatSourceCoverageLag(1440), '1d');
  assert.equal(contract.formatSourceCoverageLag(null), 'n/a');

  const [readModelSource, panelSource] = await Promise.all([
    readFile(new URL('../apps/web/lib/sources-read-model.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/components/source-coverage-panel.tsx', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(readModelSource, /function trustStateFor\(/);
  assert.doesNotMatch(readModelSource, /function formatLagMinutes\(/);
  assert.doesNotMatch(panelSource, /function trustState\(/);
  assert.doesNotMatch(panelSource, /function formatLag\(/);
});

test('sources page keeps a light data-review theme', async () => {
  const files = [
    new URL('../apps/web/app/sources/page.tsx', import.meta.url),
    new URL('../apps/web/components/provenance-summary.tsx', import.meta.url),
    new URL('../apps/web/components/source-coverage-panel.tsx', import.meta.url)
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(
      source,
      /bg-slate-950(?!\/)|bg-slate-950\/|bg-slate-900\/70|from-slate-900|to-black|text-white/,
      `${file.pathname} should not hard-code dark sources surfaces`
    );
  }
});

test('sources page exposes click-through filters and row focus actions', async () => {
  const source = await readFile(new URL('../apps/web/app/sources/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /filterRaw/);
  assert.match(source, /rowMatchesSourceFilter/);
  assert.match(source, /visibleRows/);
  assert.match(source, /key: 'review', label: '需复核'/);
  assert.match(source, /key: 'fallback', label: '回退'/);
  assert.match(source, /key: 'proxy', label: '代理'/);
  assert.match(source, /key: 'live', label: '实时'/);
  assert.match(source, /href=\{sourceFilterHref\(filter\.key\)\}/);
  assert.match(source, /href=\{sourceFocusHref\(row\.metricKey\)\}/);
  assert.ok(source.includes('正在显示 {visibleRows.length} / {readModel.rows.length}'));
});

test('sources read model keeps summary aggregation centralized', async () => {
  const readModelSource = await readFile(new URL('../apps/web/lib/sources-read-model.ts', import.meta.url), 'utf8');

  assert.match(readModelSource, /function summarizeCoverageTrust\(/);
  assert.match(readModelSource, /function averageFinite\(/);
  assert.match(readModelSource, /function freshestLagMinutes\(/);
  assert.doesNotMatch(readModelSource, /rows\.filter\(\(row\) => row\.trustState === /);
  assert.doesNotMatch(readModelSource, /confidenceScores\.reduce\(/);
});

test('getSourcesReadModel maps live coverage, volatility levels, and notes for the sources page', async (t) => {
  installEnv(t);
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
              brent_usd_per_bbl: 81.25,
              jet_usd_per_l: 1.043,
              carbon_proxy_usd_per_t: 96.1,
              rotterdam_jet_fuel_usd_per_l: 0.845
            },
            source_details: {
              carbon: {
                source: 'cbam+ecb',
                status: 'ok',
                note: 'FX refreshed',
                cbam_eur: 88,
                usd_per_eur: 1.0923
              },
              rotterdam_jet_fuel: {
                source: 'rotterdam-jet-direct',
                status: 'ok',
                note: 'ARA direct quote',
                lag_minutes: 20,
                confidence_score: 0.82
              }
            }
          })
      ],
      [
        'https://api.example.com/v1/market/history',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:00:00Z',
            windows_days: [1, 7, 30],
            metrics: {
              brent_usd_per_bbl: {
                metric_key: 'brent_usd_per_bbl',
                unit: 'USD/bbl',
                latest_value: 81.25,
                latest_as_of: '2026-04-23T12:00:00Z',
                change_pct_1d: 3.2,
                change_pct_7d: 4.8,
                change_pct_30d: 8.1,
                points: [
                  { as_of: '2026-04-22T00:00:00Z', value: 80 },
                  { as_of: '2026-04-23T00:00:00Z', value: 81.25 }
                ]
              },
              jet_usd_per_l: {
                metric_key: 'jet_usd_per_l',
                unit: 'USD/L',
                latest_value: 1.043,
                latest_as_of: '2026-04-23T12:00:00Z',
                change_pct_1d: 5.1,
                change_pct_7d: 12.4,
                change_pct_30d: 21.7,
                points: [
                  { as_of: '2026-04-22T00:00:00Z', value: 0.96 },
                  { as_of: '2026-04-23T00:00:00Z', value: 1.043 }
                ]
              },
              carbon_proxy_usd_per_t: {
                metric_key: 'carbon_proxy_usd_per_t',
                unit: 'USD/tCO2',
                latest_value: 96.1,
                latest_as_of: '2026-04-23T12:00:00Z',
                change_pct_1d: null,
                change_pct_7d: 9.4,
                change_pct_30d: 11.8,
                points: [
                  { as_of: '2026-04-22T00:00:00Z', value: 91 },
                  { as_of: '2026-04-23T00:00:00Z', value: 96.1 }
                ]
              },
              rotterdam_jet_fuel_usd_per_l: {
                metric_key: 'rotterdam_jet_fuel_usd_per_l',
                unit: 'USD/L',
                latest_value: 0.845,
                latest_as_of: '2026-04-23T12:00:00Z',
                change_pct_1d: 1.2,
                change_pct_7d: 2.4,
                change_pct_30d: 3.6,
                points: [
                  { as_of: '2026-04-22T00:00:00Z', value: 0.836 },
                  { as_of: '2026-04-23T00:00:00Z', value: 0.845 }
                ]
              }
            }
          })
      ],
      [
        'https://api.example.com/v1/sources/coverage',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:05:00Z',
            completeness: 4 / 7,
            degraded: true,
            metrics: [
              {
                metric_key: 'jet_usd_per_l',
                source_name: 'fred',
                source_type: 'market_primary',
                confidence_score: 0.91,
                lag_minutes: 150,
                fallback_used: false,
                status: 'ok',
                region: 'us',
                market_scope: 'statistical_series'
              },
              {
                metric_key: 'carbon_proxy_usd_per_t',
                source_name: 'cbam+ecb',
                source_type: 'derived',
                confidence_score: 0.73,
                lag_minutes: 15,
                fallback_used: true,
                status: 'ok',
                region: 'eu',
                market_scope: 'regulatory_proxy',
                cbam_eur: 88,
                usd_per_eur: 1.0923
              },
              {
                metric_key: 'brent_usd_per_bbl',
                source_name: 'eia',
                source_type: 'market_primary',
                confidence_score: 0.95,
                lag_minutes: 45,
                fallback_used: false,
                status: 'ok',
                region: 'global',
                market_scope: 'benchmark'
              },
              {
                metric_key: 'rotterdam_jet_fuel_usd_per_l',
                source_name: 'rotterdam-jet-direct',
                source_type: 'public_proxy',
                confidence_score: 0.82,
                lag_minutes: 20,
                fallback_used: false,
                status: 'ok',
                region: 'eu',
                market_scope: 'physical_spot_rotterdam',
                note: 'ARA direct quote'
              },
              // Backfilled by backend because upstream source_details is partial
              {
                metric_key: 'jet_eu_proxy_usd_per_l',
                source_name: 'Derived from Brent',
                source_type: 'derived',
                confidence_score: 0.65,
                lag_minutes: null,
                fallback_used: true,
                status: 'seed',
                region: 'eu',
                market_scope: 'derived_proxy'
              },
              {
                metric_key: 'eu_ets_price_eur_per_t',
                source_name: 'EEX EU ETS',
                source_type: 'official',
                confidence_score: 0.85,
                lag_minutes: null,
                fallback_used: true,
                status: 'seed',
                region: 'eu',
                market_scope: 'compliance_market'
              },
              {
                metric_key: 'germany_premium_pct',
                source_name: 'Derived comparison',
                source_type: 'derived',
                confidence_score: 0.6,
                lag_minutes: null,
                fallback_used: true,
                status: 'seed',
                region: 'de',
                market_scope: 'price_differential'
              }
            ]
          })
      ]
    ])
  );

  const { getSourcesReadModel } = await importSourcesReadModel();
  const readModel = await getSourcesReadModel();

  assert.equal(readModel.isFallback, false);
  assert.equal(readModel.generatedAt, '2026-04-23T12:05:00Z');
  // Backend now backfills missing metrics, so we always get the full
  // canonical set of 7 even when upstream only provides 4.
  assert.equal(readModel.coverageMetrics.length, 7);
  assert.deepEqual(
    readModel.coverageMetrics.map((metric) => metric.metric_key),
    [
      'brent_usd_per_bbl',
      'jet_usd_per_l',
      'carbon_proxy_usd_per_t',
      'jet_eu_proxy_usd_per_l',
      'rotterdam_jet_fuel_usd_per_l',
      'eu_ets_price_eur_per_t',
      'germany_premium_pct'
    ]
  );
  // The 3 missing metrics should be backfilled as seed with fallback_used=true
  const backfilled = readModel.coverageMetrics.filter((m) => m.fallback_used && m.status === 'seed');
  assert.ok(backfilled.length >= 3, `expected at least 3 backfilled seed metrics, got ${backfilled.length}`);
  assert.equal(readModel.degraded, true);
  assert.ok(readModel.completeness < 1.0);
  assert.equal(readModel.rows[0].source, 'EIA Daily Prices');
  assert.equal(readModel.rows[0].trustState, 'live');
  assert.equal(readModel.rows[0].sourceType, '市场主来源');
  assert.match(readModel.rows[0].degradedReason, /实时主来源/);
  assert.equal(readModel.rows[0].lag, '45m');
  assert.equal(readModel.rows[1].source, 'FRED');
  assert.equal(readModel.rows[1].value, '1.043 USD/L');
  assert.equal(readModel.rows[1].alertLevel, 'alert');
  assert.equal(readModel.rows[1].change30d, '+21.70%');
  assert.equal(readModel.rows[2].trustState, 'fallback');
  assert.equal(readModel.rows[2].note, 'CBAM 88.00 EUR × FX 1.0923');
  assert.equal(readModel.rows[4].surface, 'Rotterdam 航煤');
  assert.equal(readModel.rows[4].source, 'rotterdam-jet-direct');
  assert.equal(readModel.rows[4].trustState, 'proxy');
  assert.equal(readModel.rows[4].note, 'ARA direct quote');
  assert.equal(readModel.coverageMetrics[2].source_type, 'derived');
  assert.equal(readModel.summary.liveCount, 2);
  assert.equal(readModel.summary.proxyCount, 1);
  assert.equal(readModel.summary.fallbackCount, 4);
  assert.match(readModel.summary.trustLabel, /核验降级输入/);
  assert.notEqual(readModel.rows[1].sparkline, '');
});

test('getSourcesReadModel falls back to a generic degraded state when coverage API is unavailable', async (t) => {
  installEnv(t);
  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/market/snapshot',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:00:00Z',
            source_status: { overall: 'degraded' },
            values: {
              brent_usd_per_bbl: 82,
              jet_usd_per_l: 1.01,
              carbon_proxy_usd_per_t: 90.5,
              jet_eu_proxy_usd_per_l: 1.08
            },
            source_details: {
              brent: {
                source: 'eia',
                status: 'ok',
                region: 'global',
                market_scope: 'benchmark',
                lag_minutes: 50,
                confidence_score: 0.94
              },
              jet: {
                source: 'fred',
                status: 'ok',
                region: 'us',
                market_scope: 'statistical_series',
                lag_minutes: 90,
                confidence_score: 0.89
              },
              carbon: {
                source: 'cbam+ecb',
                status: 'seed',
                region: 'eu',
                market_scope: 'regulatory_proxy',
                lag_minutes: null,
                confidence_score: 0.7,
                fallback_used: true,
                note: 'ECB closed'
              },
              jet_eu_proxy: {
                source: 'brent-derived',
                status: 'seed',
                region: 'eu',
                market_scope: 'derived_proxy',
                lag_minutes: null,
                confidence_score: 0.65,
                fallback_used: true
              }
            }
          })
      ],
      [
        'https://api.example.com/v1/market/history',
        () => jsonResponse({ generated_at: '2026-04-23T12:00:00Z', windows_days: [1], metrics: {} })
      ],
      [
        'https://api.example.com/v1/sources/coverage',
        () => jsonResponse({ error: 'coverage unavailable' }, 503)
      ]
    ])
  );

  const { getSourcesReadModel } = await importSourcesReadModel();
  const readModel = await getSourcesReadModel();

  assert.equal(readModel.isFallback, true);
  assert.equal(readModel.overallStatus, 'degraded');
  assert.match(readModel.error ?? '', /来源覆盖合约缺少指标/);
  assert.equal(readModel.coverageMetrics.length, 7);
  assert.equal(readModel.rows.length, 7);
  assert.deepEqual(
    readModel.coverageMetrics.map((metric) => metric.metric_key),
    [
      'brent_usd_per_bbl',
      'jet_usd_per_l',
      'carbon_proxy_usd_per_t',
      'jet_eu_proxy_usd_per_l',
      'rotterdam_jet_fuel_usd_per_l',
      'eu_ets_price_eur_per_t',
      'germany_premium_pct'
    ]
  );
  assert.equal(readModel.rows[0].source, '覆盖不可用');
  assert.equal(readModel.rows[0].status, 'unknown');
  assert.equal(readModel.rows[0].trustState, 'fallback');
  assert.match(readModel.rows[0].degradedReason, /回退路径/);
  assert.equal(readModel.rows[0].scope, 'unknown · coverage_unavailable');
  assert.equal(readModel.rows[0].note, '回退');
  assert.equal(readModel.rows[1].value, '1.010 USD/L');
  assert.equal(readModel.rows[2].value, '90.50 USD/tCO2');
  assert.equal(readModel.rows[3].value, '1.080 USD/L');
  assert.equal(readModel.rows[4].value, '无数据');
  assert.equal(readModel.degraded, true);
  assert.equal(readModel.completeness, 0.0);
  assert.equal(readModel.summary.fallbackCount, 7);
  assert.match(readModel.summary.degradedReason, /覆盖完整度 0%/);
});

test('getSourcesReadModel backfills missing metrics when coverage is partial (5 of 7)', async (t) => {
  installEnv(t);
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
              brent_usd_per_bbl: 81.25,
              jet_usd_per_l: 1.043,
              carbon_proxy_usd_per_t: 96.1,
              jet_eu_proxy_usd_per_l: 1.08,
              rotterdam_jet_fuel_usd_per_l: 0.845
            },
            source_details: {}
          })
      ],
      [
        'https://api.example.com/v1/market/history',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:00:00Z',
            windows_days: [1, 7, 30],
            metrics: {}
          })
      ],
      [
        'https://api.example.com/v1/sources/coverage',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:05:00Z',
            completeness: 5 / 7,
            degraded: true,
            metrics: [
              {
                metric_key: 'brent_usd_per_bbl',
                source_name: 'eia',
                source_type: 'market_primary',
                confidence_score: 0.95,
                lag_minutes: 45,
                fallback_used: false,
                status: 'ok',
                region: 'global',
                market_scope: 'benchmark'
              },
              {
                metric_key: 'jet_usd_per_l',
                source_name: 'fred',
                source_type: 'market_primary',
                confidence_score: 0.91,
                lag_minutes: 150,
                fallback_used: false,
                status: 'ok',
                region: 'us',
                market_scope: 'statistical_series'
              },
              {
                metric_key: 'carbon_proxy_usd_per_t',
                source_name: 'cbam+ecb',
                source_type: 'derived',
                confidence_score: 0.73,
                lag_minutes: 15,
                fallback_used: true,
                status: 'ok',
                region: 'eu',
                market_scope: 'regulatory_proxy'
              },
              {
                metric_key: 'jet_eu_proxy_usd_per_l',
                source_name: 'brent-derived',
                source_type: 'derived',
                confidence_score: 0.65,
                lag_minutes: null,
                fallback_used: true,
                status: 'seed',
                region: 'eu',
                market_scope: 'derived_proxy'
              },
              {
                metric_key: 'rotterdam_jet_fuel_usd_per_l',
                source_name: 'rotterdam-jet-direct',
                source_type: 'public_proxy',
                confidence_score: 0.82,
                lag_minutes: 20,
                fallback_used: false,
                status: 'ok',
                region: 'eu',
                market_scope: 'physical_spot_rotterdam'
              },
              // Backfilled by backend
              {
                metric_key: 'eu_ets_price_eur_per_t',
                source_name: 'EEX EU ETS',
                source_type: 'official',
                confidence_score: 0.85,
                lag_minutes: null,
                fallback_used: true,
                status: 'seed',
                region: 'eu',
                market_scope: 'compliance_market'
              },
              {
                metric_key: 'germany_premium_pct',
                source_name: 'Derived comparison',
                source_type: 'derived',
                confidence_score: 0.6,
                lag_minutes: null,
                fallback_used: true,
                status: 'seed',
                region: 'de',
                market_scope: 'price_differential'
              }
            ]
          })
      ]
    ])
  );

  const { getSourcesReadModel } = await importSourcesReadModel();
  const readModel = await getSourcesReadModel();

  assert.equal(readModel.isFallback, false);
  assert.equal(readModel.coverageMetrics.length, 7);
  assert.equal(readModel.degraded, true);
  assert.ok(Math.abs(readModel.completeness - 5 / 7) < 0.01);

  // The 2 missing metrics (eu_ets, germany_premium) should have been
  // backfilled by the backend with seed status and fallback_used=true.
  const euEts = readModel.coverageMetrics.find((m) => m.metric_key === 'eu_ets_price_eur_per_t');
  const germany = readModel.coverageMetrics.find((m) => m.metric_key === 'germany_premium_pct');
  assert.ok(euEts, 'expected eu_ets to be backfilled');
  assert.equal(euEts?.status, 'seed');
  assert.equal(euEts?.fallback_used, true);
  assert.ok(germany, 'expected germany_premium to be backfilled');
  assert.equal(germany?.status, 'seed');
  assert.equal(germany?.fallback_used, true);
});

test('getSourcesReadModel uses coverage metric supplements instead of snapshot source_details', async (t) => {
  installEnv(t);
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
              brent_usd_per_bbl: 81.25
            },
            source_details: {
              brent: {
                source: 'totally-different-source',
                status: 'seed',
                region: 'mars',
                market_scope: 'made_up_scope',
                lag_minutes: 9999,
                confidence_score: 0.01,
                fallback_used: true,
                note: 'Ignored snapshot note',
                error: 'Ignored snapshot error'
              }
            }
          })
      ],
      [
        'https://api.example.com/v1/market/history',
        () => jsonResponse({ generated_at: '2026-04-23T12:00:00Z', windows_days: [1], metrics: {} })
      ],
      [
        'https://api.example.com/v1/sources/coverage',
        () =>
          jsonResponse({
            generated_at: '2026-04-23T12:05:00Z',
            completeness: 1,
            degraded: false,
            metrics: [
              {
                metric_key: 'brent_usd_per_bbl',
                source_name: 'eia',
                source_type: 'market_primary',
                confidence_score: 0.95,
                lag_minutes: 45,
                fallback_used: false,
                status: 'ok',
                region: 'global',
                market_scope: 'benchmark',
                note: 'Coverage note only',
                error: 'Coverage error only'
              }
            ]
          })
      ]
    ])
  );

  const { getSourcesReadModel } = await importSourcesReadModel();
  const readModel = await getSourcesReadModel();

  assert.equal(readModel.rows.length, 1);
  assert.equal(readModel.rows[0].source, 'EIA Daily Prices');
  assert.equal(readModel.rows[0].scope, 'global · benchmark');
  assert.equal(readModel.rows[0].confidence, '0.95');
  assert.equal(readModel.rows[0].lag, '45m');
  assert.equal(readModel.rows[0].status, 'ok');
  assert.equal(readModel.rows[0].note, 'Coverage error only');
  assert.equal(readModel.rows[0].degradedReason, 'Coverage error only');
});
