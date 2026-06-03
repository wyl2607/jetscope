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
  const readModel = await getGermanyJetFuelReadModel('de');
  const euProxyMetric = readModel.metrics.find((metric) => metric.metricKey === 'jet_eu_proxy_usd_per_l');

  assert.equal(readModel.isFallback, false);
  assert.equal(readModel.overallStatus, 'ok');
  assert.equal(euProxyMetric?.value, 1.04);
  assert.equal(euProxyMetric?.sourceMetricKey, 'jet_usd_per_l');
  assert.equal(euProxyMetric?.changePct7d, 12.1);
  assert.equal(euProxyMetric?.note, 'Fallback von Jet-Fuel');
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
  const reserveSource = await readFile(new URL('../apps/web/app/crisis/eu-jet-reserves/page.tsx', import.meta.url), 'utf8');
  const chartSource = await readFile(new URL('../apps/web/components/price-trends-chart.tsx', import.meta.url), 'utf8');

  assert.match(reserveSource, /CurrentSafBreakpointRow/);
  assert.match(reserveSource, /当前拐点/);
  assert.match(reserveSource, /ring-2 ring-amber-300/);
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
  assert.doesNotMatch(
    `${scenariosSource}\n${registrySource}\n${readinessSource}`,
    /FastAPI \+ PostgreSQL|第二页|第二页面|canonical|contracts|demo route|\/v1\/policies\/refuel-eu|开发分层|后续接真实数据的接口位|text-slate-300|bg-slate-950|border-slate-800|text-white/
  );
});

test('reports landing page is a live report workbench instead of a static index', async () => {
  const reportsSource = await readFile(new URL('../apps/web/app/reports/page.tsx', import.meta.url), 'utf8');

  assert.match(reportsSource, /getDashboardReadModel/);
  assert.match(reportsSource, /dynamic = 'force-dynamic'/);
  assert.match(reportsSource, /报告工作台/);
  assert.match(reportsSource, /来源状态/);
  assert.match(reportsSource, /情景数量/);
  assert.match(reportsSource, /复核来源/);
  assert.match(reportsSource, /topRiskSignal/);
  assert.match(reportsSource, /reports\/tipping-point-analysis/);
  assert.doesNotMatch(reportsSource, /bg-slate-900|border-slate-800|text-white|text-slate-300/);
});

test('English reports page exposes report readiness without Chinese UI copy', async () => {
  const englishReportsSource = await readFile(new URL('../apps/web/app/en/reports/page.tsx', import.meta.url), 'utf8');

  assert.match(englishReportsSource, /Report Workbench/);
  assert.match(englishReportsSource, /getDashboardReadModel\('en'\)/);
  assert.match(englishReportsSource, /Source status/);
  assert.match(englishReportsSource, /Scenario count/);
  assert.match(englishReportsSource, /Launch posture/);
  assert.match(englishReportsSource, /en\/sources\?filter=review/);
  assert.match(englishReportsSource, /en\/dashboard/);
  assert.doesNotMatch(
    englishReportsSource,
    /报告工作台|来源状态|情景数量|上线姿态|复核来源|暂无|需复核|可发布候选/
  );
  assert.doesNotMatch(englishReportsSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('English admin page exposes launch readiness without protected write controls', async () => {
  const englishAdminSource = await readFile(new URL('../apps/web/app/en/admin/page.tsx', import.meta.url), 'utf8');

  assert.match(englishAdminSource, /Launch Readiness/);
  assert.match(englishAdminSource, /getLaunchReadinessReadModel/);
  assert.match(englishAdminSource, /Admin token/);
  assert.match(englishAdminSource, /AI research pipeline/);
  assert.match(englishAdminSource, /Protected operations/);
  assert.match(englishAdminSource, /en\/sources\?filter=review/);
  assert.match(englishAdminSource, /en\/research/);
  assert.doesNotMatch(englishAdminSource, /AdminDataOps/);
  assert.doesNotMatch(
    englishAdminSource,
    /管理台|上线前置状态|假设与数据接入管理|管理令牌|缺少配置|未启用|打开研究工作台/
  );
  assert.doesNotMatch(englishAdminSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
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
  const germanSourcesSource = await readFile(new URL('../apps/web/app/de/sources/page.tsx', import.meta.url), 'utf8');

  assert.match(germanSourcesSource, /Quellenprüfung/);
  assert.match(germanSourcesSource, /getSourcesReadModel/);
  assert.match(germanSourcesSource, /Wiederherstellungsaktionen/);
  assert.match(germanSourcesSource, /Quellenmatrix/);
  assert.match(germanSourcesSource, /key: 'review', label: 'Prüfen'/);
  assert.match(germanSourcesSource, /de\/sources\?filter=review/);
  assert.match(germanSourcesSource, /\/de\/dashboard/);
  assert.doesNotMatch(germanSourcesSource, /from '@\/app\/sources|from '@\/app\/en\/sources/);
  assert.doesNotMatch(
    germanSourcesSource,
    /数据来源|来源复核|恢复步骤|需复核|回退|代理|实时|打开 Admin 刷新|正在显示|暂无|管理令牌/
  );
  assert.doesNotMatch(germanSourcesSource, /Source Review|Recovery actions|Market input matrix|Needs review|Show review rows/);
  assert.doesNotMatch(germanSourcesSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('research page is an honest signal workbench with disabled-state actions', async () => {
  const researchSource = await readFile(new URL('../apps/web/app/research/page.tsx', import.meta.url), 'utf8');

  assert.match(researchSource, /研究工作台/);
  assert.match(researchSource, /AI_RESEARCH_ENABLED/);
  assert.match(researchSource, /ResearchDecisionBriefCard/);
  assert.match(researchSource, /showLink=\{false\}/);
  assert.match(researchSource, /信号总数/);
  assert.match(researchSource, /开启研究流水线/);
  assert.match(researchSource, /reports\/tipping-point-analysis/);
  assert.match(researchSource, /sources\?filter=review/);
  assert.doesNotMatch(researchSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('English research page exposes research pipeline boundaries without Chinese UI copy', async () => {
  const englishResearchSource = await readFile(new URL('../apps/web/app/en/research/page.tsx', import.meta.url), 'utf8');

  assert.match(englishResearchSource, /Research Workbench/);
  assert.match(englishResearchSource, /AI_RESEARCH_ENABLED/);
  assert.match(englishResearchSource, /research pipeline is disabled/i);
  assert.match(englishResearchSource, /reports\/tipping-point-analysis/);
  assert.match(englishResearchSource, /en\/sources\?filter=review/);
  assert.doesNotMatch(
    englishResearchSource,
    /研究工作台|开启研究流水线|信号总数|复核来源|正向|负向|中性|暂无/
  );
  assert.doesNotMatch(englishResearchSource, /bg-slate-900|border-slate-800|text-white|text-slate-300|text-slate-200/);
});

test('dashboard and admin avoid leaking raw implementation labels into UI copy', async () => {
  const dashboardSource = await readFile(new URL('../apps/web/app/dashboard/page.tsx', import.meta.url), 'utf8');
  const adminSource = await readFile(new URL('../apps/web/app/admin/page.tsx', import.meta.url), 'utf8');

  assert.match(dashboardSource, /sourceStatusLabel/);
  assert.match(dashboardSource, /freshnessLabel/);
  assert.match(dashboardSource, /riskLevelLabel/);
  assert.doesNotMatch(dashboardSource, /来源状态： \$\{readModel\.market\.source_status\.overall\}/);
  assert.doesNotMatch(dashboardSource, /新鲜度=\$\{readModel\.freshnessSignal\.level\}/);
  assert.match(adminSource, /<code className=/);
  assert.doesNotMatch(adminSource, /<p>`route_catalog`/);
});
