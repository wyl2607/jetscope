import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@/lib/i18n';
import { observed } from '@/lib/figure';

const getDashboardReadModel = vi.fn();
const getSourcesReadModel = vi.fn();
const getPriceTrendChartReadModel = vi.fn();
const loadPathwayComparison = vi.fn();
const loadEuEtsPressure = vi.fn();

vi.mock('@/lib/dashboard-read-model', () => ({
  getDashboardReadModel: () => getDashboardReadModel()
}));

vi.mock('@/lib/sources-read-model', () => ({
  getSourcesReadModel: () => getSourcesReadModel()
}));

vi.mock('@/lib/product-read-model', () => ({
  getPriceTrendChartReadModel: () => getPriceTrendChartReadModel()
}));

vi.mock('@/lib/pathways-read-model', () => ({
  loadPathwayComparison: () => loadPathwayComparison(),
  toPathwayCostRow: () => ({})
}));

vi.mock('@/lib/eu-ets-pressure-read-model', () => ({
  loadEuEtsPressure: () => loadEuEtsPressure()
}));

vi.mock('@/components/provenance-summary', () => ({
  ProvenanceSummary: () => <div data-testid="provenance-summary" />
}));

vi.mock('@/components/price-trends-chart', () => ({
  PriceTrendsChart: () => <div data-testid="price-trends-chart" />
}));

vi.mock('@/components/saf-pathway-comparison-table', () => ({
  SafPathwayComparisonTable: () => <div data-testid="pathway-table" />
}));

vi.mock('@/components/eu-ets-pressure-panel', () => ({
  EuEtsPressurePanel: () => <div data-testid="ets-panel" />
}));

vi.mock('@/components/policy-timeline-with-market-time', () => ({
  PolicyTimelineWithMarketTime: () => <div data-testid="policy-timeline" />
}));

import { DashboardPage } from '@/components/dashboard-page';

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];

function mockReadModel() {
  return {
    market: {
      generated_at: '2026-08-01T12:00:00Z',
      source_status: {
        overall: 'ok',
        confidence: 0.9,
        freshness_minutes: 5,
        fallback_rate: 0,
        is_fallback: false
      },
      values: {
        brent_usd_per_bbl: 80,
        jet_usd_per_l: 0.7,
        jet_eu_proxy_usd_per_l: 0.72,
        carbon_proxy_usd_per_t: 90
      }
    },
    reserve: null,
    tippingPoint: null,
    airlineDecision: null,
    sourceCoverage: null,
    aviationEvent: null,
    marketHealth: null,
    analysisInputs: {
      fossilJetUsdPerL: 0.72,
      carbonPriceEurPerT: 83.33,
      reserveWeeks: 3,
      jetSourceKey: 'jet_eu_proxy_usd_per_l'
    },
    scenarioCount: 2,
    recentScenarioNames: ['Base case', '基准情景'],
    freshnessSignal: {
      minutes: 5,
      level: 'fresh' as const,
      freshMaxMinutes: 60,
      staleMaxMinutes: 1440
    },
    topRiskSignal: {
      metric: 'Brent',
      metricKey: 'brent_usd_per_bbl',
      window: '1d' as const,
      changePct: 1.2,
      level: 'watch' as const,
      latestAsOf: '2026-08-01T12:00:00Z',
      sampleCount: 10
    },
    isFallback: false,
    error: null
  };
}

function mockSources() {
  return {
    summary: {
      liveCount: 3,
      proxyCount: 1,
      fallbackCount: 0,
      degradedCount: 0,
      averageConfidence: 0.8,
      trustLabel: '可信',
      degradedReason: '无',
      freshnessLabel: '新'
    },
    completeness: observed({
      value: 95,
      unit: '%',
      asOf: '2026-08-01T12:00:00Z',
      sourceId: 'sources-read-model',
      precision: 0
    }),
    generatedAt: '2026-08-01T12:00:00Z',
    isFallback: false,
    error: null
  };
}

describe('DashboardPage', () => {
  beforeEach(() => {
    getDashboardReadModel.mockReset().mockResolvedValue(mockReadModel());
    getSourcesReadModel.mockReset().mockResolvedValue(mockSources());
    getPriceTrendChartReadModel.mockReset().mockResolvedValue({ metrics: {}, error: null });
    loadPathwayComparison.mockReset().mockResolvedValue({
      generatedAt: '2026-08-01T12:00:00Z',
      signalLabel: '势均力敌',
      rows: [],
      sourceByKey: {}
    });
    loadEuEtsPressure.mockReset().mockResolvedValue({
      generatedAt: '2026-08-01T12:00:00Z',
      signal: 'low',
      signalLabel: '低压力',
      peakPressurePct: null,
      points: [],
      source: {
        source_type: 'derived',
        confidence_score: 0.8,
        cadence: 'daily',
        updated_at: '2026-08-01T12:00:00Z',
        fallback_used: false
      }
    });
  });

  it.each(LOCALES)('renders %s copy from the locale file', async (locale) => {
    const copy = messagesFor(locale).dashboard;
    render(await DashboardPage({ locale }));

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(screen.getByText(copy.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(copy.work_title)).toBeInTheDocument();
    expect(screen.getByText(copy.capabilities_title)).toBeInTheDocument();
  });

  it('shows zh-only panels when those flags are on', async () => {
    render(await DashboardPage({ locale: 'zh' }));

    expect(screen.getByTestId('provenance-summary')).toBeInTheDocument();
    expect(screen.getByTestId('price-trends-chart')).toBeInTheDocument();
    expect(screen.getByText(messagesFor('zh').dashboard.provenance_title)).toBeInTheDocument();
    expect(getSourcesReadModel).toHaveBeenCalled();
    expect(getPriceTrendChartReadModel).toHaveBeenCalled();
  });

  it('renders the aviation-event summary from the zh locale dictionary', async () => {
    const copy = messagesFor('zh').dashboard;
    const values = {
      profit: '100',
      profitYoy: '5',
      kerosene: '20',
      strikes: '10',
      passThrough: '40',
      fuel: '8'
    };
    getDashboardReadModel.mockResolvedValue({
      ...mockReadModel(),
      aviationEvent: {
        id: 'lh-q2',
        as_of: '2026-08-01',
        entity: { name: 'Lufthansa' },
        source: { title: 'Q2 2026' },
        verified_facts: {
          q2_adjusted_operating_profit_eur_m: 100,
          q2_adjusted_operating_profit_yoy_change_pct: 5,
          q2_extra_kerosene_cost_iran_war_eur_m: 20,
          q2_strike_cost_eur_m_approx: 10,
          kerosene_cost_pass_through_pct_approx: 40,
          fy_fuel_cost_expected_eur_bn: 8
        }
      }
    });

    render(await DashboardPage({ locale: 'zh' }));
    const expected = copy.status_event_summary.replace(
      /\{([a-zA-Z0-9_]+)\}/g,
      (_, key: keyof typeof values) => values[key]
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(screen.queryByText(/Q2 adj\. profit/)).toBeNull();
  });

  it('does not show zh-only panels on de', async () => {
    render(await DashboardPage({ locale: 'de' }));

    expect(screen.queryByTestId('provenance-summary')).toBeNull();
    expect(screen.queryByTestId('price-trends-chart')).toBeNull();
    expect(screen.queryByTestId('pathway-table')).toBeNull();
    expect(screen.queryByTestId('ets-panel')).toBeNull();
    expect(screen.getByTestId('policy-timeline')).toBeInTheDocument();
    expect(screen.getByText(messagesFor('de').dashboard.migration_title)).toBeInTheDocument();
    expect(getSourcesReadModel).not.toHaveBeenCalled();
    expect(getPriceTrendChartReadModel).not.toHaveBeenCalled();
  });

  it('does not show zh-only panels on en and keeps the sources matrix', async () => {
    render(await DashboardPage({ locale: 'en' }));

    expect(screen.queryByTestId('provenance-summary')).toBeNull();
    expect(screen.queryByTestId('price-trends-chart')).toBeNull();
    expect(screen.queryByTestId('pathway-table')).toBeNull();
    expect(screen.queryByTestId('ets-panel')).toBeNull();
    expect(screen.queryByTestId('policy-timeline')).toBeNull();
    expect(screen.getByText(messagesFor('en').dashboard.sources_matrix_title)).toBeInTheDocument();
    expect(getSourcesReadModel).toHaveBeenCalled();
    expect(getPriceTrendChartReadModel).not.toHaveBeenCalled();
  });

  it('uses locale-specific hrefs already encoded in navigation.ts', async () => {
    render(await DashboardPage({ locale: 'zh' }));
    expect(screen.getByRole('link', { name: /打开管理/ })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: messagesFor('zh').dashboard.method_label })).toHaveAttribute(
      'href',
      '/sources'
    );
    expect(screen.getByRole('link', { name: 'Brent 1d +1.20%' })).toHaveAttribute(
      'href',
      '/sources?focus=brent_usd_per_bbl'
    );

    cleanup();
    render(await DashboardPage({ locale: 'de' }));
    expect(screen.getByRole('link', { name: /Erforderlich/ })).toHaveAttribute('href', '/de/admin');
    expect(screen.getByRole('link', { name: messagesFor('de').dashboard.method_label })).toHaveAttribute(
      'href',
      '/de/sources'
    );
    expect(screen.getByRole('link', { name: 'Brent 1d +1.20%' })).toHaveAttribute(
      'href',
      '/de/sources?focus=brent_usd_per_bbl'
    );

    cleanup();
    render(await DashboardPage({ locale: 'en' }));
    expect(screen.getByRole('link', { name: /Required/ })).toHaveAttribute('href', '/en/admin');
    expect(screen.getByRole('link', { name: messagesFor('en').dashboard.method_label })).toHaveAttribute(
      'href',
      '/en/sources'
    );
    expect(screen.queryByRole('link', { name: 'Brent 1d +1.20%' })).toBeNull();
  });

  it('substitutes scenario names whose script does not match the reader locale', async () => {
    render(await DashboardPage({ locale: 'de' }));
    expect(screen.getByText(/Base case/)).toBeInTheDocument();
    expect(screen.getByText(/Gespeichertes Szenario 2/)).toBeInTheDocument();
    expect(screen.queryByText(/基准情景/)).toBeNull();
  });

  it('does not invent a data timestamp on fallback', async () => {
    getDashboardReadModel.mockResolvedValue({
      ...mockReadModel(),
      isFallback: true,
      error: 'api down',
      market: {
        ...mockReadModel().market,
        generated_at: '2026-08-01T12:00:00Z'
      }
    });

    render(await DashboardPage({ locale: 'zh' }));
    expect(screen.queryByTestId('page-as-of')).toBeNull();
  });

  it('does not bleed copy across locale files', () => {
    const zh = JSON.stringify(messagesFor('zh').dashboard);
    const de = JSON.stringify(messagesFor('de').dashboard);
    const en = JSON.stringify(messagesFor('en').dashboard);

    expect(en).not.toMatch(/决策驾驶舱|来源溯源|价格趋势|Häufige Fragen|Entscheidungscockpit/);
    expect(de).not.toMatch(/决策驾驶舱|来源溯源|Decision Cockpit|Source posture/);
    expect(zh).toMatch(/决策驾驶舱/);
    expect(en).toMatch(/Decision Cockpit/);
    expect(de).toMatch(/Entscheidungscockpit/);
  });

  it('does not introduce middleware or a /[locale] rewrite', () => {
    const files = [
      'components/dashboard-page.tsx',
      'app/dashboard/page.tsx',
      'app/de/dashboard/page.tsx',
      'app/en/dashboard/page.tsx'
    ];

    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/middleware/i);
      expect(source).not.toMatch(/app\/\[locale\]/);
    }
  });
});
