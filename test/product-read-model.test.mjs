import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

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
                change_pct_30d: 22.1,
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
  assert.equal(readModel.topRiskSignal?.metric, '航煤');
  assert.equal(readModel.topRiskSignal?.metricKey, 'jet_usd_per_l');
  assert.equal(readModel.topRiskSignal?.window, '30d');
  assert.equal(readModel.topRiskSignal?.level, 'alert');
  assert.equal(readModel.topRiskSignal?.sampleCount, 1);
  assert.equal(readModel.reserve?.coverage_weeks, 2.6);
  assert.equal(readModel.sourceCoverage?.metrics[0].source_name, 'ICE Jet');

  const germanReadModel = await getDashboardReadModel('de');
  assert.equal(germanReadModel.topRiskSignal?.metric, 'Jet-Fuel');

  const englishReadModel = await getDashboardReadModel('en');
  assert.equal(englishReadModel.topRiskSignal?.metric, 'Jet fuel');
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

test('getCrisisBriefReadModel consumes the crisis brief API and localizes action links', async (t) => {
  installEnv(t, {
    JETSCOPE_API_BASE_URL: 'https://api.example.com',
    JETSCOPE_API_PREFIX: '/v1'
  });

  installFetchStub(
    t,
    new Map([
      [
        'https://api.example.com/v1/analysis/crisis-brief?limit=20',
        () =>
          jsonResponse({
            generated_at: '2026-06-04T12:00:00Z',
            market_generated_at: '2026-06-04T11:58:00Z',
            fossil_jet_usd_per_l: 0.845,
            source_status: {
              overall: 'degraded',
              confidence: 0.72,
              freshness_minutes: 2,
              fallback_rate: 14,
              is_fallback: true
            },
            reserve: {
              generated_at: '2026-06-04T11:55:00Z',
              region: 'eu',
              coverage_days: 24,
              coverage_weeks: 3.43,
              stress_level: 'elevated',
              estimated_supply_gap_pct: 9.5,
              source_type: 'official',
              source_name: 'IEA Oil Market Report',
              confidence_score: 0.85
            },
            tipping_events: [
              {
                id: 'event-1',
                event_type: 'ALERT',
                saf_pathway: 'hefa',
                fossil_price_usd_per_l: 1.12,
                saf_effective_cost_usd_per_l: 1.2,
                gap_usd_per_l: -0.08,
                observed_at: '2026-06-04T10:00:00Z',
                metadata: {}
              }
            ],
            research: {
              status: 'signal_backed',
              signal_count: 2,
              top_signal_title: 'Policy signal',
              top_signal_confidence: 0.91,
              latest_published_at: '2026-06-03T10:00:00Z'
            },
            actions: [
              {
                id: 'review_sources',
                label: 'Review source evidence',
                href: '/sources?filter=review',
                reason: 'review sources'
              },
              {
                id: 'open_report',
                label: 'Open tipping-point report',
                href: '/reports/tipping-point-analysis',
                reason: 'open report'
              },
              {
                id: 'review_scenarios',
                label: 'Review scenarios',
                href: '/scenarios',
                reason: 'review scenarios'
              }
            ]
          })
      ]
    ])
  );

  const { getCrisisBriefReadModel } = await importWebLib('apps/web/lib/crisis-brief-read-model.ts');
  const readModel = await getCrisisBriefReadModel('de');

  assert.equal(readModel.error, null);
  assert.equal(readModel.fossilJetUsdPerL, 0.845);
  assert.equal(readModel.reserve.coverage_weeks, 3.43);
  assert.equal(readModel.tippingEvents[0].event_type, 'ALERT');
  assert.equal(readModel.research.status, 'signal_backed');
  assert.deepEqual(
    readModel.actions.map((action) => action.href),
    ['/de/sources?filter=review', '/de/reports/tipping-point-analysis', '/de/scenarios']
  );
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
  assert.equal(readModel.metrics.brent_usd_per_bbl.latest_value.value, 82.4);
  assert.equal(readModel.metrics.brent_usd_per_bbl.latest_value.basis, 'observed');
  assert.equal(readModel.metrics.brent_usd_per_bbl.change_pct_7d.value, 3.4);
  assert.equal(readModel.metrics.brent_usd_per_bbl.change_pct_7d.basis, 'derived');
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
  const readModel = await getGermanyJetFuelReadModel('de');
  const euProxyMetric = readModel.metrics.find((metric) => metric.metricKey === 'jet_eu_proxy_usd_per_l');

  assert.equal(readModel.isFallback, false);
  assert.equal(readModel.overallStatus, 'ok');
  assert.equal(euProxyMetric?.value, 1.04);
  assert.equal(euProxyMetric?.sourceMetricKey, 'jet_usd_per_l');
  assert.equal(euProxyMetric?.changePct7d, 12.1);
  assert.equal(euProxyMetric?.note, 'Fallback von Jet-Fuel');
});

test('English Germany jet fuel price page exposes localized market review without Chinese or German copy', async () => {
  const page = await readFile(
    new URL('../apps/web/components/germany-jet-fuel-page.tsx', import.meta.url),
    'utf8'
  );
  const enPage = await readFile(
    new URL('../apps/web/app/en/prices/germany-jet-fuel/page.tsx', import.meta.url),
    'utf8'
  );
  const en = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/en.json', import.meta.url), 'utf8')
  ).prices;

  assert.match(en.title, /Germany Jet-Fuel Price Monitor/);
  assert.match(en.limitations.join(' '), /Decision support, not a trading feed/);
  assert.match(en.source_read_model, /Source Review/);
  assert.equal(en.show_trend_chart, false);
  assert.match(enPage, /locale="en"/);
  assert.match(page, /getGermanyJetFuelReadModel\(locale\)/);
  assert.match(page, /sourcesHref\(locale, key\)/);
  assert.doesNotMatch(
    JSON.stringify(en),
    /德国航油价格|价格 · 德国|来源状态|风险说明|Deutschland|Risikohinweis|Quellenstatus/
  );
  assert.doesNotMatch(page, /text-white|text-slate-300|bg-slate-900|border-slate-800/);
});

test('German Germany jet fuel price page keeps source review in the German locale', async () => {
  const page = await readFile(
    new URL('../apps/web/components/germany-jet-fuel-page.tsx', import.meta.url),
    'utf8'
  );
  const dePage = await readFile(
    new URL('../apps/web/app/de/prices/germany-jet-fuel/page.tsx', import.meta.url),
    'utf8'
  );
  const de = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/de.json', import.meta.url), 'utf8')
  ).prices;

  assert.match(dePage, /locale="de"/);
  assert.match(de.source_jet_eu, /EU-Jet-Proxy-Quellenstatus/);
  assert.equal(de.show_trend_chart, false);
  assert.match(page, /id === 'sources'/);
  assert.doesNotMatch(page, /href: '\/sources\?focus=/);
});

test('English Lufthansa SAF analysis page is a localized light review surface', async () => {
  const englishLufthansaSource = await readFile(
    new URL('../apps/web/app/en/lufthansa-saf-2026/page.tsx', import.meta.url),
    'utf8'
  );

  assert.match(englishLufthansaSource, /Lufthansa SAF Inflection Review/);
  assert.match(englishLufthansaSource, /locale="en"/);
  assert.match(englishLufthansaSource, /\/en\/prices\/germany-jet-fuel/);
  assert.match(englishLufthansaSource, /\/en\/sources\?filter=review/);
  assert.match(englishLufthansaSource, /\/en\/scenarios/);
  assert.match(englishLufthansaSource, /\/analysis\/lufthansa-flight-cuts-2026-04/);
  assert.match(englishLufthansaSource, /\/de\/lufthansa-saf-2026/);
  assert.doesNotMatch(
    englishLufthansaSource,
    /汉莎|削减|航油|德国制造|事件概述|Lufthansa kürzt|Wendepunkt|Kerosin|Deutschland|Chinesische Vollversion/
  );
  assert.doesNotMatch(englishLufthansaSource, /text-white|text-slate-300|bg-slate-900|bg-slate-950|border-slate-800/);
  assert.doesNotMatch(englishLufthansaSource, /<input|AdminDataOps|ScenarioRegistry|x-admin-token/i);
});

test('localized FAQ pages explain launch boundaries without write controls', async () => {
  // One shared view, copy in the dictionaries, three real route files. These
  // assertions keep the four guarantees this test always had: the copy exists,
  // it links to admin and sources, the locales do not bleed into each other,
  // and nothing on the page can write.
  const page = await readFile(new URL('../apps/web/components/faq-page.tsx', import.meta.url), 'utf8');
  const zhPage = await readFile(new URL('../apps/web/app/faq/page.tsx', import.meta.url), 'utf8');
  const enPage = await readFile(new URL('../apps/web/app/en/faq/page.tsx', import.meta.url), 'utf8');
  const dePage = await readFile(new URL('../apps/web/app/de/faq/page.tsx', import.meta.url), 'utf8');
  const dictionary = async (locale) =>
    JSON.parse(
      await readFile(new URL(`../apps/web/src/locales/${locale}.json`, import.meta.url), 'utf8')
    ).faq;

  const zh = await dictionary('zh');
  const en = await dictionary('en');
  const de = await dictionary('de');

  assert.match(zh.title, /常见问题/);
  assert.match(zh.questions.readiness.action, /上线前置状态/);
  assert.match(zh.questions.sources.action, /数据来源/);
  assert.match(zh.questions.research.action, /研究信号/);

  assert.match(en.title, /Frequently Asked Questions/);
  assert.match(en.questions.readiness.action, /Launch readiness/);
  assert.match(en.questions.sources.action, /Source review/);
  assert.match(en.questions.research.action, /Research workbench/);

  assert.match(de.title, /Häufige Fragen/);
  assert.match(de.questions.readiness.action, /Startbereitschaft/);
  assert.match(de.questions.sources.action, /Quellenprüfung/);
  assert.match(de.questions.research.action, /Forschungswerkstatt/);

  assert.match(page, /navId: 'admin'/);
  assert.match(page, /navId: 'sources'/);
  assert.match(zhPage, /locale="zh"/);
  assert.match(enPage, /locale="en"/);
  assert.match(dePage, /locale="de"/);

  assert.doesNotMatch(
    JSON.stringify(en),
    /上线前置状态|数据来源|研究信号|Häufige Fragen|Startbereitschaft/
  );
  assert.doesNotMatch(
    JSON.stringify(de),
    /Frequently Asked Questions|Launch readiness|Source review|上线前置状态|数据来源/
  );

  for (const source of [page, zhPage, enPage, dePage]) {
    assert.doesNotMatch(source, /<input|<textarea|AdminDataOps|ScenarioRegistry|x-admin-token/i);
    assert.doesNotMatch(source, /text-white|text-slate-300|bg-slate-900|bg-slate-950|border-slate-800/);
  }
});

test('crisis page uses light semantic data cards instead of gray dark boxes', async () => {
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
  assert.match(crisisSource, /confidenceTextTone/);
  assert.match(crisisSource, /marketConfidence/);
  assert.match(crisisSource, /buildSafWorkbenchHref/);
  assert.match(crisisSource, /reviewSourcesHref/);
  assert.match(crisisSource, /sources\?filter=review/);
  assert.match(crisisSource, /fuel: fallbackFossil\.toFixed\(3\)/);
  assert.match(crisisSource, /reserve: reserveWeeks\?\.toFixed\(2\)/);
  // Asserted through the design tokens rather than palette literals, which any
  // migration necessarily breaks. See docs/UI_CONTRACT.md section 1.
  //
  // The tints used to sit on chip backgrounds. On the template they sit on the
  // signal-row values instead, and the navigation cards went neutral on
  // purpose: a link to the sources page tinted warning was decoration, and
  // section 1 rule 5 says a semantic colour has to mean something.
  assert.match(crisisSource, /text-success/);
  assert.match(crisisSource, /text-warning/);
  assert.match(crisisSource, /text-accent/);
  assert.match(crisisSource, /text-danger/);

  // A style migration must not quietly downgrade what the page communicates:
  // unknown provenance, missing confidence, and an unrecognised signal all stay
  // problem-coloured rather than fading to neutral grey.
  assert.match(
    crisisSource,
    /if \(value == null\) return 'text-danger/,
    'missing confidence must stay a problem tone, not neutral grey'
  );
  // The tone helpers were renamed to *TextTone when the page moved to the
  // template: the signal row tints the value, it no longer paints a whole tinted
  // chip. The guarantee is unchanged and is what is asserted here - an
  // unrecognised value must not fall through to a calm colour.
  //
  // The body slice matches an optional CR so the assertion still inspects the
  // helper if a file ever lands with CRLF endings. Without it the terminator is
  // not found, the slice runs to end of file, and the check quietly starts
  // reading the JSX instead - passing while verifying nothing.
  const helperBody = (name) => {
    const start = crisisSource.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} must exist in the crisis page`);
    const rest = crisisSource.slice(start);
    const end = rest.search(/\r?\n\}/);
    assert.ok(end > 0, `${name} body must terminate`);
    return rest.slice(0, end);
  };

  for (const helper of ['signalTextTone', 'stressTextTone', 'confidenceTextTone']) {
    const body = helperBody(helper);
    assert.match(
      body.slice(body.lastIndexOf('return')),
      /danger|warning/,
      `${helper} fallthrough must stay a problem tone, not neutral grey`
    );
  }

  // Provenance used to be a tinted chip on the page. It now rides in the source
  // footer, where an unrecognised source_type must land on 'assumption' - the
  // basis the footer renders in warning - rather than being passed off as
  // observed.
  const basisBody = helperBody('reserveBasis');
  assert.match(
    basisBody.slice(basisBody.lastIndexOf('return')),
    /assumption/,
    'an unrecognised reserve source must default to assumption, never to observed'
  );
});

test('localized crisis pages are source-backed and stay in their locale', async () => {
  const englishCrisisSource = await readFile(new URL('../apps/web/app/en/crisis/page.tsx', import.meta.url), 'utf8');
  const germanCrisisSource = await readFile(new URL('../apps/web/app/de/crisis/page.tsx', import.meta.url), 'utf8');
  const shellSource = await readFile(new URL('../apps/web/components/shell.tsx', import.meta.url), 'utf8');

  assert.match(englishCrisisSource, /Fuel Stress Brief/);
  assert.match(englishCrisisSource, /getCrisisBriefReadModel\('en'\)/);
  assert.match(englishCrisisSource, /FastAPI crisis-brief contract/);
  assert.match(englishCrisisSource, /Reserve stress/);
  assert.match(englishCrisisSource, /Source confidence/);
  assert.match(englishCrisisSource, /Tipping events/);
  assert.match(englishCrisisSource, /Research posture/);
  assert.match(englishCrisisSource, /en\/sources\?filter=review/);
  assert.match(englishCrisisSource, /en\/reports\/tipping-point-analysis/);
  assert.match(englishCrisisSource, /en\/scenarios/);
  assert.doesNotMatch(englishCrisisSource, /getDashboardReadModel|getEuReserveCoverage|getTippingPointEvents|getResearchSignals/);
  assert.doesNotMatch(
    englishCrisisSource,
    /危机监测|储备压力|来源可信度|研究姿态|Krisenbrief|Reservestress|Quellenvertrauen|Forschungsstatus/
  );

  assert.match(germanCrisisSource, /Krisenbrief/);
  assert.match(germanCrisisSource, /getCrisisBriefReadModel\('de'\)/);
  assert.match(germanCrisisSource, /FastAPI-Crisis-Brief-Vertrag/);
  assert.match(germanCrisisSource, /Reservestress/);
  assert.match(germanCrisisSource, /Quellenvertrauen/);
  assert.match(germanCrisisSource, /Kippereignisse/);
  assert.match(germanCrisisSource, /Forschungsstatus/);
  assert.match(germanCrisisSource, /de\/sources\?filter=review/);
  assert.match(germanCrisisSource, /de\/reports\/tipping-point-analysis/);
  assert.match(germanCrisisSource, /de\/scenarios/);
  assert.doesNotMatch(germanCrisisSource, /getDashboardReadModel|getEuReserveCoverage|getTippingPointEvents|getResearchSignals/);
  assert.doesNotMatch(
    germanCrisisSource,
    /危机监测|储备压力|来源可信度|研究姿态|Fuel Stress Brief|Reserve stress|Source confidence|Research posture/
  );

  // Navigation moved to a single source of truth (docs/UI_CONTRACT.md section 4).
  // The shell must no longer carry literal routes; navigation.ts owns them.
  const navigationSource = await readFile(new URL('../apps/web/lib/navigation.ts', import.meta.url), 'utf8');
  assert.match(navigationSource, /\/en\/crisis/);
  assert.match(navigationSource, /Crisis Monitor/);
  assert.match(navigationSource, /\/de\/crisis/);
  assert.match(navigationSource, /Krisenmonitor/);
  assert.doesNotMatch(shellSource, /navByLocale/);
  assert.doesNotMatch(shellSource, /'\/(de|en)\//);
  assert.match(shellSource, /navigationFor\(locale\)/);
  assert.doesNotMatch(
    `${englishCrisisSource}\n${germanCrisisSource}`,
    /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/
  );

  const crisisBriefSource = await readFile(new URL('../apps/web/lib/crisis-brief-read-model.ts', import.meta.url), 'utf8');
  assert.match(crisisBriefSource, /analysis\/crisis-brief/);
  assert.match(crisisBriefSource, /localizeHref/);
});

test('reserve price trends guard finite chart coordinates and highlight the current SAF breakpoint', async () => {
  const reserveSource = await readFile(new URL('../apps/web/app/crisis/eu-jet-reserves/page.tsx', import.meta.url), 'utf8');
  const chartSource = await readFile(new URL('../apps/web/components/price-trends-chart.tsx', import.meta.url), 'utf8');

  assert.match(reserveSource, /CurrentSafBreakpointRow/);
  assert.match(reserveSource, /当前拐点/);
  assert.match(reserveSource, /ring-2 ring-warning/);
  assert.match(reserveSource, /历史价格趋势/);
  assert.match(reserveSource, /本地 market_snapshots 历史库/);
  assert.match(reserveSource, /阅读方式/);
  assert.match(reserveSource, /拐点行/);
  assert.match(reserveSource, /第一性原理证据链/);
  assert.match(reserveSource, /事实层/);
  assert.match(reserveSource, /机制层/);
  assert.match(reserveSource, /置信层/);
  assert.match(reserveSource, /行动层/);
  assert.match(reserveSource, /模型边界/);
  assert.match(reserveSource, /NREL SAF/);
  assert.match(reserveSource, /IATA Fuel/);
  assert.match(reserveSource, /EU ETS aviation/);
  assert.match(reserveSource, /IEA Aviation/);
  assert.match(chartSource, /finitePoints/);
  assert.match(chartSource, /Number\.isFinite\(point\.value\)/);
  assert.match(chartSource, /safeYRange/);
  assert.match(chartSource, /timeWindow/);
  assert.match(chartSource, /TIME_WINDOWS/);
  assert.match(chartSource, /近1天/);
  assert.match(chartSource, /近7天/);
  assert.match(chartSource, /近30天/);
  assert.match(chartSource, /filterPointsByWindow/);
  assert.match(chartSource, /METRIC_META/);
  assert.match(chartSource, /左轴/);
  assert.match(chartSource, /横轴/);
  assert.match(chartSource, /当前窗口/);
  assert.match(chartSource, /欧盟航油代理价/);
  assert.match(chartSource, /coverageDaysFor/);
  assert.match(chartSource, /formatCoverageDays/);
  assert.match(chartSource, /数据覆盖/);
  assert.match(chartSource, /积累中/);
  assert.match(chartSource, /未用模拟数据补齐/);
  assert.match(chartSource, /localCoverageDays < item\.days/);
  assert.doesNotMatch(chartSource, /Brent Crude/);
  assert.doesNotMatch(chartSource, /eu_ets_price_eur_per_t/);
  assert.doesNotMatch(chartSource, /const yRange = yMax - yMin;/);
});

test('scenarios workbench exposes a global language switch and stays product-facing', async () => {
  const shellSource = await readFile(new URL('../apps/web/components/shell.tsx', import.meta.url), 'utf8');
  const languageSwitcherSource = await readFile(
    new URL('../apps/web/components/language-switcher.tsx', import.meta.url),
    'utf8'
  );
  const scenariosSource = await readFile(new URL('../apps/web/app/scenarios/page.tsx', import.meta.url), 'utf8');
  const registrySource = await readFile(new URL('../apps/web/components/scenario-registry.tsx', import.meta.url), 'utf8');
  const readinessSource = await readFile(
    new URL('../apps/web/components/transition-readiness-dashboard.tsx', import.meta.url),
    'utf8'
  );

  assert.match(shellSource, /LanguageSwitcher/);
  assert.match(languageSwitcherSource, /aria-label=\{controlLabel\}/);
  assert.match(languageSwitcherSource, /Sprache/);
  assert.match(languageSwitcherSource, /中文/);
  assert.match(languageSwitcherSource, /Deutsch/);
  assert.match(languageSwitcherSource, /English/);
  assert.match(languageSwitcherSource, /usePathname/);
  assert.match(scenariosSource, /页面职责/);
  assert.match(scenariosSource, /实时价格在决策驾驶舱/);
  assert.match(scenariosSource, /来源复核在数据来源/);
  assert.match(scenariosSource, /情景工作区/);
  assert.match(registrySource, /高级 JSON 设置/);
  assert.match(registrySource, /SCENARIO_NAME_MAX_LENGTH = 120/);
  assert.match(registrySource, /scenario-name-limit/);
  assert.match(readinessSource, /min-w-0/);
  assert.doesNotMatch(
    `${scenariosSource}\n${registrySource}\n${readinessSource}`,
    /FastAPI \+ PostgreSQL|第二页|第二页面|canonical|contracts|demo route|\/v1\/policies\/refuel-eu|开发分层|后续接真实数据的接口位|text-slate-300|bg-slate-950|border-slate-800|text-white/
  );
});

test('reports landing page is a live report workbench instead of a static index', async () => {
  const page = await readFile(new URL('../apps/web/components/reports-page.tsx', import.meta.url), 'utf8');
  const zhPage = await readFile(new URL('../apps/web/app/reports/page.tsx', import.meta.url), 'utf8');
  const zh = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/zh.json', import.meta.url), 'utf8')
  ).reports;

  assert.match(zh.title, /报告工作台/);
  assert.match(zh.source.label, /来源状态/);
  assert.match(zh.scenarios.label, /情景数量/);
  assert.match(zh.actions.review_sources.label, /复核来源/);
  assert.match(zhPage, /dynamic = 'force-dynamic'/);
  assert.match(zhPage, /报告工作台/);
  assert.match(zhPage, /locale="zh"/);
  assert.match(page, /getDashboardReadModel\(locale\)/);
  assert.match(page, /topRiskSignal/);
  assert.match(page, /tipping-point-analysis/);
  assert.doesNotMatch(page, /bg-slate-900|border-slate-800|text-white|text-slate-300/);
});

test('English reports page exposes report readiness without Chinese UI copy', async () => {
  const page = await readFile(new URL('../apps/web/components/reports-page.tsx', import.meta.url), 'utf8');
  const enPage = await readFile(new URL('../apps/web/app/en/reports/page.tsx', import.meta.url), 'utf8');
  const en = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/en.json', import.meta.url), 'utf8')
  ).reports;

  assert.match(en.title, /Report Workbench/);
  assert.match(en.source.label, /Source status/);
  assert.match(en.scenarios.label, /Scenario count/);
  assert.match(en.readiness.label, /Launch posture/);
  assert.match(enPage, /Report Workbench/);
  assert.match(enPage, /locale="en"/);
  assert.match(page, /getDashboardReadModel\(locale\)/);
  assert.match(page, /navId: 'research'/);
  assert.match(page, /navId: 'dashboard'/);
  assert.match(page, /\?filter=review/);
  assert.match(page, /tipping-point-analysis/);
  assert.doesNotMatch(page, /['"`]\/en\//);
  assert.doesNotMatch(
    JSON.stringify(en),
    /报告工作台|来源状态|情景数量|上线姿态|复核来源|暂无|需复核|可发布候选/
  );
  assert.doesNotMatch(page, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('English tipping-point report detail stays localized and source-backed', async () => {
  const englishReportSource = await readFile(
    new URL('../apps/web/app/en/reports/tipping-point-analysis/page.tsx', import.meta.url),
    'utf8'
  );

  assert.match(englishReportSource, /Tipping-Point Report/);
  assert.match(englishReportSource, /getDashboardReadModel\('en'\)/);
  assert.match(englishReportSource, /getEuReserveCoverage/);
  assert.match(englishReportSource, /getTippingPointEvents/);
  assert.match(englishReportSource, /getResearchSignals/);
  assert.match(englishReportSource, /Source confidence/);
  assert.match(englishReportSource, /Research posture/);
  assert.match(englishReportSource, /en\/sources\?filter=review/);
  assert.match(englishReportSource, /en\/scenarios/);
  assert.match(englishReportSource, /en\/reports/);
  assert.match(englishReportSource, /reports\/tipping-point-analysis/);
  assert.doesNotMatch(
    englishReportSource,
    /临界点报告|核心论点|来源状态|情景数量|上线姿态|复核来源|暂无|需复核|可发布候选|Bericht|Kipppunkt|Quellenstatus/
  );
  assert.doesNotMatch(englishReportSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('German reports page exposes report readiness without Chinese or English report copy', async () => {
  const page = await readFile(new URL('../apps/web/components/reports-page.tsx', import.meta.url), 'utf8');
  const dePage = await readFile(new URL('../apps/web/app/de/reports/page.tsx', import.meta.url), 'utf8');
  const de = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/de.json', import.meta.url), 'utf8')
  ).reports;

  assert.match(de.title, /Berichtswerkstatt/);
  assert.match(de.source.label, /Quellenstatus/);
  assert.match(de.catalog.title, /Berichtskatalog/);
  assert.match(de.actions.title, /Vor dem Start/);
  assert.match(dePage, /Berichtswerkstatt/);
  assert.match(dePage, /locale="de"/);
  assert.match(page, /getDashboardReadModel\(locale\)/);
  assert.match(page, /navId: 'admin'/);
  assert.match(page, /navId: 'dashboard'/);
  assert.match(page, /navId: 'sources'/);
  assert.match(page, /\?filter=review/);
  assert.match(page, /tipping-point-analysis/);
  assert.doesNotMatch(page, /['"`]\/de\//);
  assert.doesNotMatch(
    JSON.stringify(de),
    /报告工作台|来源状态|情景数量|上线姿态|复核来源|暂无|需复核|可发布候选/
  );
  assert.doesNotMatch(
    JSON.stringify(de),
    /Report Workbench|Report catalog|Pre-launch actions|Review source evidence|Publish candidate|Review needed/
  );
  assert.doesNotMatch(page, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('German tipping-point report detail stays localized and source-backed', async () => {
  const germanReportSource = await readFile(
    new URL('../apps/web/app/de/reports/tipping-point-analysis/page.tsx', import.meta.url),
    'utf8'
  );

  assert.match(germanReportSource, /Kipppunktbericht/);
  assert.match(germanReportSource, /getDashboardReadModel\('de'\)/);
  assert.match(germanReportSource, /getEuReserveCoverage/);
  assert.match(germanReportSource, /getTippingPointEvents/);
  assert.match(germanReportSource, /getResearchSignals/);
  assert.match(germanReportSource, /Quellenvertrauen/);
  assert.match(germanReportSource, /Forschungsstatus/);
  assert.match(germanReportSource, /de\/sources\?filter=review/);
  assert.match(germanReportSource, /de\/scenarios/);
  assert.match(germanReportSource, /de\/reports/);
  assert.match(germanReportSource, /reports\/tipping-point-analysis/);
  assert.doesNotMatch(
    germanReportSource,
    /临界点报告|核心论点|来源状态|情景数量|上线姿态|复核来源|暂无|需复核|可发布候选|Tipping-Point Report|Source confidence|Research posture/
  );
  assert.doesNotMatch(germanReportSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('English admin page exposes launch readiness without protected write controls', async () => {
  const page = await readFile(new URL('../apps/web/components/admin-page.tsx', import.meta.url), 'utf8');
  const englishAdminSource = await readFile(new URL('../apps/web/app/en/admin/page.tsx', import.meta.url), 'utf8');
  const en = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/en.json', import.meta.url), 'utf8')
  ).admin;

  assert.match(englishAdminSource, /Launch Readiness/);
  assert.match(englishAdminSource, /locale="en"/);
  assert.match(page, /getLaunchReadinessReadModel/);
  assert.equal(en.show_admin_ops, false);
  assert.match(en.check_labels.admin_token, /Admin token/);
  assert.match(en.check_labels.ai_research_pipeline, /AI research pipeline/);
  assert.match(en.scope_title, /Protected operations/);
  assert.match(page, /check\.blocking/);
  assert.match(page, /check\.severity/);
  assert.match(page, /check\.configKeys/);
  assert.match(en.impact_blocking, /Blocks launch/);
  assert.match(en.impact_review, /Review needed/);
  assert.match(en.config_keys_label, /Related config/);
  assert.equal(en.actions.source_coverage.nav_id, 'sources');
  assert.match(en.actions.source_coverage.query, /filter=review/);
  assert.equal(en.actions.ai_research_pipeline.nav_id, 'research');
  assert.match(page, /NAV_ENTRIES/);
  assert.doesNotMatch(englishAdminSource, /AdminDataOps/);
  assert.doesNotMatch(
    englishAdminSource,
    /管理台|上线前置状态|假设与数据接入管理|管理令牌|缺少配置|未启用|打开研究工作台/
  );
  assert.doesNotMatch(
    JSON.stringify(en),
    /管理台|上线前置状态|假设与数据接入管理|管理令牌|缺少配置|未启用|打开研究工作台/
  );
  assert.doesNotMatch(englishAdminSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
  assert.doesNotMatch(page, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('English scenarios page reviews saved assumptions without Chinese editor UI', async () => {
  const englishScenariosSource = await readFile(new URL('../apps/web/app/en/scenarios/page.tsx', import.meta.url), 'utf8');

  assert.match(englishScenariosSource, /Scenario Workbench/);
  assert.match(englishScenariosSource, /getDashboardReadModel\('en'\)/);
  assert.match(englishScenariosSource, /Saved scenarios/);
  assert.match(englishScenariosSource, /Scenario assumptions/);
  assert.match(englishScenariosSource, /Protected write boundary/);
  assert.match(englishScenariosSource, /en\/dashboard/);
  assert.match(englishScenariosSource, /en\/sources\?filter=review/);
  assert.doesNotMatch(englishScenariosSource, /ScenarioRegistry/);
  assert.doesNotMatch(
    englishScenariosSource,
    /情景工作区|情景管理|保存假设|管理令牌|创建|更新|删除|高级 JSON 设置|暂无/
  );
  assert.doesNotMatch(englishScenariosSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('German sources page exposes source review without Chinese UI copy', async () => {
  const page = await readFile(new URL('../apps/web/components/sources-page.tsx', import.meta.url), 'utf8');
  const dePage = await readFile(new URL('../apps/web/app/de/sources/page.tsx', import.meta.url), 'utf8');
  const de = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/de.json', import.meta.url), 'utf8')
  ).sources;

  assert.match(de.title, /Quellenprüfung/);
  assert.match(de.panels.recovery.title, /Wiederherstellungsaktionen/);
  assert.match(de.panels.matrix.title, /Quellenmatrix/);
  assert.match(de.filters.review.label, /Prüfen/);
  assert.match(de.recovery.show_review, /Prüfzeilen/);
  assert.match(page, /NAV_ENTRIES/);
  assert.match(page, /getSourcesReadModel/);
  assert.match(page, /filter=review|set\('filter', filter\)/);
  assert.match(page, /hrefFor\(locale, 'dashboard'\)/);
  assert.match(dePage, /loadSourcesPageProps\('de'/);
  assert.match(dePage, /Quellenprüfung/);
  assert.doesNotMatch(dePage, /from '@\/app\/sources|from '@\/app\/en\/sources/);
  assert.doesNotMatch(
    JSON.stringify(de),
    /数据来源|来源复核|恢复步骤|需复核|打开 Admin 刷新|正在显示|暂无|管理令牌/
  );
  assert.doesNotMatch(
    JSON.stringify(de),
    /Source Review|Recovery actions|Market input matrix|Needs review|Show review rows/
  );
  assert.doesNotMatch(page, /if \(value === ['']覆盖不可用['']\)/);
  assert.doesNotMatch(dePage, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('German dashboard keeps source drill-through in the German locale', async () => {
  const page = await readFile(new URL('../apps/web/components/dashboard-page.tsx', import.meta.url), 'utf8');
  const germanDashboardSource = await readFile(new URL('../apps/web/app/de/dashboard/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /hrefFor\(locale, 'sources'\)\}\?focus=/);
  assert.match(page, /hrefFor\(locale, 'sources'\)/);
  assert.match(germanDashboardSource, /locale="de"/);
  assert.doesNotMatch(page, /`\/sources\?focus=/);
});

test('localized dashboard pages share one view without middleware', async () => {
  const page = await readFile(new URL('../apps/web/components/dashboard-page.tsx', import.meta.url), 'utf8');
  const zhPage = await readFile(new URL('../apps/web/app/dashboard/page.tsx', import.meta.url), 'utf8');
  const enPage = await readFile(new URL('../apps/web/app/en/dashboard/page.tsx', import.meta.url), 'utf8');
  const dePage = await readFile(new URL('../apps/web/app/de/dashboard/page.tsx', import.meta.url), 'utf8');
  const dictionary = async (locale) =>
    JSON.parse(
      await readFile(new URL(`../apps/web/src/locales/${locale}.json`, import.meta.url), 'utf8')
    ).dashboard;

  const zh = await dictionary('zh');
  const en = await dictionary('en');
  const de = await dictionary('de');

  assert.equal(zh.show_provenance, true);
  assert.equal(zh.show_price_trends, true);
  assert.equal(zh.show_pathways, true);
  assert.equal(zh.show_ets, true);
  assert.equal(zh.show_policy_timeline, true);
  assert.equal(zh.show_status_banners, true);
  assert.equal(zh.show_sources_matrix, false);

  assert.equal(de.show_provenance, false);
  assert.equal(de.show_price_trends, false);
  assert.equal(de.show_pathways, false);
  assert.equal(de.show_ets, false);
  assert.equal(de.show_policy_timeline, true);
  assert.equal(de.show_status_banners, false);
  assert.equal(de.show_sources_matrix, false);

  assert.equal(en.show_provenance, false);
  assert.equal(en.show_price_trends, false);
  assert.equal(en.show_pathways, false);
  assert.equal(en.show_ets, false);
  assert.equal(en.show_policy_timeline, false);
  assert.equal(en.show_status_banners, false);
  assert.equal(en.show_sources_matrix, true);

  assert.match(zh.title, /决策驾驶舱/);
  assert.match(de.title, /Entscheidungscockpit/);
  assert.match(en.title, /Decision Cockpit/);

  assert.match(zhPage, /locale="zh"/);
  assert.match(enPage, /locale="en"/);
  assert.match(dePage, /locale="de"/);

  for (const source of [page, zhPage, enPage, dePage]) {
    assert.doesNotMatch(source, /middleware/i);
    assert.doesNotMatch(source, /app\/\[locale\]/);
    assert.doesNotMatch(source, /text-white|text-slate-300|bg-slate-900|bg-slate-950|border-slate-800/);
  }
});

test('German scenarios page reviews saved assumptions without Chinese editor UI', async () => {
  const germanScenariosSource = await readFile(new URL('../apps/web/app/de/scenarios/page.tsx', import.meta.url), 'utf8');

  assert.match(germanScenariosSource, /Szenario-Workbench/);
  assert.match(germanScenariosSource, /getDashboardReadModel\('de'\)/);
  assert.match(germanScenariosSource, /Gespeicherte Szenarien/);
  assert.match(germanScenariosSource, /Szenarioannahmen/);
  assert.match(germanScenariosSource, /Geschützte Schreibgrenze/);
  assert.match(germanScenariosSource, /de\/dashboard/);
  assert.match(germanScenariosSource, /de\/sources\?filter=review/);
  assert.match(germanScenariosSource, /de\/admin/);
  assert.doesNotMatch(germanScenariosSource, /ScenarioRegistry|<input|type="password"/);
  assert.doesNotMatch(
    germanScenariosSource,
    /情景工作区|情景管理|保存假设|管理令牌|创建|更新|删除|高级 JSON 设置|暂无/
  );
  assert.doesNotMatch(
    germanScenariosSource,
    /Scenario Workbench|Saved scenarios|Scenario assumptions|Protected write boundary|No saved assumptions/
  );
  assert.doesNotMatch(germanScenariosSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('German admin page exposes launch readiness without protected write controls', async () => {
  const page = await readFile(new URL('../apps/web/components/admin-page.tsx', import.meta.url), 'utf8');
  const germanAdminSource = await readFile(new URL('../apps/web/app/de/admin/page.tsx', import.meta.url), 'utf8');
  const de = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/de.json', import.meta.url), 'utf8')
  ).admin;

  assert.match(germanAdminSource, /Startbereitschaft/);
  assert.match(germanAdminSource, /locale="de"/);
  assert.match(page, /getLaunchReadinessReadModel/);
  assert.equal(de.show_admin_ops, false);
  assert.match(de.check_labels.admin_token, /Admin-Token/);
  assert.match(de.check_labels.ai_research_pipeline, /AI-Research-Pipeline/);
  assert.match(de.scope_title, /Geschützte Operationen/);
  assert.match(page, /check\.blocking/);
  assert.match(page, /check\.severity/);
  assert.match(page, /check\.configKeys/);
  assert.match(de.impact_blocking, /Blockiert Start/);
  assert.match(de.impact_review, /Prüfung nötig/);
  assert.match(de.config_keys_label, /Relevante Konfiguration/);
  assert.equal(de.actions.source_coverage.nav_id, 'sources');
  assert.match(de.actions.source_coverage.query, /filter=review/);
  assert.equal(de.actions.default.nav_id, 'dashboard');
  assert.match(page, /NAV_ENTRIES/);
  assert.doesNotMatch(germanAdminSource, /AdminDataOps|<input|type="password"/);
  assert.doesNotMatch(
    germanAdminSource,
    /管理台|上线前置状态|假设与数据接入管理|管理令牌|缺少配置|未启用|打开研究工作台/
  );
  assert.doesNotMatch(
    JSON.stringify(de),
    /管理台|上线前置状态|假设与数据接入管理|管理令牌|缺少配置|未启用|打开研究工作台/
  );
  assert.doesNotMatch(
    germanAdminSource,
    /Launch Readiness|Protected operations|Missing configuration|Open sources|Open research|Not ready/
  );
  assert.doesNotMatch(
    JSON.stringify(de),
    /Launch Readiness|Protected operations|Missing configuration|Open sources|Open research/
  );
  assert.doesNotMatch(germanAdminSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
  assert.doesNotMatch(page, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('research page is an honest signal workbench with disabled-state actions', async () => {
  // One shared view, copy in the dictionaries, three real route files. Locale
  // differences (actions, decision brief, signal-script rules) stay data.
  const page = await readFile(new URL('../apps/web/components/research-page.tsx', import.meta.url), 'utf8');
  const zhPage = await readFile(new URL('../apps/web/app/research/page.tsx', import.meta.url), 'utf8');
  const zh = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/zh.json', import.meta.url), 'utf8')
  ).research;

  assert.match(zh.title, /研究工作台/);
  assert.match(zh.metrics.signal_count, /信号总数/);
  assert.match(zh.pipeline.disabled.detail, /开启研究流水线/);
  assert.equal(zh.actions[0].suffix, '/tipping-point-analysis');
  assert.equal(zh.actions[1].suffix, '?filter=review');
  assert.ok(!zh.actions.some((action) => action.id === 'admin'));

  assert.match(page, /AI_RESEARCH_ENABLED/);
  assert.match(page, /ResearchDecisionBriefCard/);
  assert.match(page, /showLink=\{false\}/);
  assert.match(page, /NAV_ENTRIES/);
  assert.match(zhPage, /locale="zh"/);
  assert.match(zhPage, /研究信号/);

  assert.doesNotMatch(page, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
  assert.doesNotMatch(zhPage, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('English research page exposes research pipeline boundaries without Chinese UI copy', async () => {
  const page = await readFile(new URL('../apps/web/components/research-page.tsx', import.meta.url), 'utf8');
  const enPage = await readFile(new URL('../apps/web/app/en/research/page.tsx', import.meta.url), 'utf8');
  const en = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/en.json', import.meta.url), 'utf8')
  ).research;

  assert.match(en.title, /Research Workbench/);
  assert.match(en.pipeline.disabled.detail, /research pipeline is disabled/i);
  assert.equal(en.actions.find((action) => action.id === 'tipping_point')?.suffix, '/tipping-point-analysis');
  assert.equal(en.actions.find((action) => action.id === 'sources')?.suffix, '?filter=review');
  assert.equal(en.actions.find((action) => action.id === 'admin')?.nav_id, 'admin');
  assert.match(page, /AI_RESEARCH_ENABLED/);
  assert.match(page, /NAV_ENTRIES/);
  assert.match(enPage, /locale="en"/);
  assert.match(enPage, /Research Workbench/);

  assert.doesNotMatch(
    JSON.stringify(en),
    /研究工作台|开启研究流水线|信号总数|复核来源|正向|负向|中性|暂无/
  );
  assert.doesNotMatch(page, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
  assert.doesNotMatch(enPage, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('German research page exposes research pipeline boundaries without Chinese or English UI copy', async () => {
  const page = await readFile(new URL('../apps/web/components/research-page.tsx', import.meta.url), 'utf8');
  const dePage = await readFile(new URL('../apps/web/app/de/research/page.tsx', import.meta.url), 'utf8');
  const de = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/de.json', import.meta.url), 'utf8')
  ).research;

  assert.match(de.title, /Forschungswerkstatt/);
  assert.match(de.pipeline.disabled.detail, /Forschungspipeline ist deaktiviert/);
  assert.match(de.metrics.signal_count, /Signalanzahl/);
  assert.match(de.panels.decision.title, /Entscheidungsnotiz/);
  assert.equal(de.actions.find((action) => action.id === 'reports')?.nav_id, 'reports');
  assert.equal(de.actions.find((action) => action.id === 'sources')?.suffix, '?filter=review');
  assert.equal(de.actions.find((action) => action.id === 'admin')?.nav_id, 'admin');
  assert.ok(!de.actions.some((action) => action.id === 'tipping_point'));
  assert.match(page, /AI_RESEARCH_ENABLED/);
  assert.match(page, /NAV_ENTRIES/);
  assert.match(dePage, /locale="de"/);
  assert.match(dePage, /Forschungswerkstatt/);

  assert.doesNotMatch(
    JSON.stringify(de),
    /研究工作台|开启研究流水线|信号总数|复核来源|正向|负向|中性|暂无|使用动作/
  );
  assert.doesNotMatch(
    JSON.stringify(de),
    /Research Workbench|Enable research pipeline|Signal count|Decision brief|Evidence actions|No research signals/
  );
  assert.doesNotMatch(page, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
  assert.doesNotMatch(dePage, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('dashboard and admin avoid leaking raw implementation labels into UI copy', async () => {
  const dashboardSource = await readFile(new URL('../apps/web/components/dashboard-page.tsx', import.meta.url), 'utf8');
  const adminSource = await readFile(new URL('../apps/web/components/admin-page.tsx', import.meta.url), 'utf8');
  const zhAdminPage = await readFile(new URL('../apps/web/app/admin/page.tsx', import.meta.url), 'utf8');
  const zh = JSON.parse(
    await readFile(new URL('../apps/web/src/locales/zh.json', import.meta.url), 'utf8')
  ).admin;

  assert.match(dashboardSource, /sourceStatusLabel/);
  assert.match(dashboardSource, /freshnessLabel/);
  assert.match(dashboardSource, /riskLevelLabel/);
  assert.doesNotMatch(dashboardSource, /来源状态： \$\{readModel\.market\.source_status\.overall\}/);
  assert.doesNotMatch(dashboardSource, /新鲜度=\$\{readModel\.freshnessSignal\.level\}/);
  assert.match(adminSource, /<code className=/);
  assert.doesNotMatch(adminSource, /<p>`route_catalog`/);
  assert.match(zhAdminPage, /<AdminPage locale="zh"/);
  assert.equal(zh.show_admin_ops, true);
  assert.match(adminSource, /AdminDataOps/);
});
