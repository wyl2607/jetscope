import { render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrisisBriefReadModel } from '@/lib/crisis-brief-read-model';
import type { DashboardReadModel } from '@/lib/dashboard-read-model';
import { messagesFor, type Locale } from '@/lib/i18n';

const { getDashboardReadModel } = vi.hoisted(() => ({
  getDashboardReadModel: vi.fn<(locale?: Locale) => Promise<DashboardReadModel>>()
}));
const { getEuReserveCoverage, getTippingPointEvents } = vi.hoisted(() => ({
  getEuReserveCoverage: vi.fn(),
  getTippingPointEvents: vi.fn()
}));
const { getResearchSignals, buildResearchDecisionBrief } = vi.hoisted(() => ({
  getResearchSignals: vi.fn(),
  buildResearchDecisionBrief: vi.fn()
}));
const { getCrisisBriefReadModel } = vi.hoisted(() => ({
  getCrisisBriefReadModel: vi.fn<(locale?: Locale) => Promise<CrisisBriefReadModel>>()
}));

vi.mock('@/lib/product-read-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/product-read-model')>();
  return {
    ...actual,
    getDashboardReadModel
  };
});

vi.mock('@/lib/portfolio-read-model', () => ({
  getEuReserveCoverage,
  getTippingPointEvents
}));

vi.mock('@/lib/research-signals-read-model', () => ({
  getResearchSignals,
  buildResearchDecisionBrief
}));

vi.mock('@/lib/crisis-brief-read-model', () => ({
  getCrisisBriefReadModel
}));

vi.mock('@/components/tipping-point-simulator', () => ({
  TippingPointSimulator: () => <div data-testid="tipping-point-simulator" />
}));

vi.mock('@/components/fuel-vs-saf-price-chart', () => ({
  FuelVsSafPriceChart: ({
    effectiveFossilJetUsdPerL
  }: {
    effectiveFossilJetUsdPerL: { basis: string };
  }) => (
    <div
      data-testid="fuel-vs-saf-price-chart"
      data-effective-basis={effectiveFossilJetUsdPerL.basis}
    />
  )
}));

vi.mock('@/components/reserves-coverage-strip', () => ({
  ReservesCoverageStrip: () => <div data-testid="reserves-coverage-strip" />
}));

vi.mock('@/components/tipping-event-timeline', () => ({
  TippingEventTimeline: () => <div data-testid="tipping-event-timeline" />
}));

vi.mock('@/components/research-decision-brief', () => ({
  ResearchDecisionBriefCard: () => <div data-testid="research-decision-brief" />
}));

import { CrisisPage } from '@/components/crisis-page';

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];

function fakeDashboard(overrides: Partial<DashboardReadModel> = {}): DashboardReadModel {
  return {
    market: {
      generated_at: '2026-08-01T12:00:00Z',
      source_status: {
        overall: 'ok',
        confidence: 0.9,
        freshness_minutes: 12,
        fallback_rate: 5,
        is_fallback: false
      },
      values: {
        jet_eu_proxy_usd_per_l: 0.72,
        carbon_proxy_usd_per_t: 108
      }
    },
    reserve: {
      generated_at: '2026-08-01T12:00:00Z',
      region: 'eu',
      coverage_days: 28,
      coverage_weeks: 4,
      stress_level: 'normal',
      estimated_supply_gap_pct: 5,
      source_type: 'official',
      source_name: 'mock reserve',
      confidence_score: 0.9
    },
    tippingPoint: null,
    airlineDecision: null,
    sourceCoverage: null,
    aviationEvent: null,
    marketHealth: null,
    analysisInputs: {
      fossilJetUsdPerL: 0.72,
      carbonPriceEurPerT: 100,
      reserveWeeks: 4,
      jetSourceKey: 'test'
    },
    scenarioCount: 0,
    recentScenarioNames: [],
    freshnessSignal: {
      minutes: 12,
      level: 'fresh',
      freshMaxMinutes: 60,
      staleMaxMinutes: 1440
    },
    topRiskSignal: null,
    isFallback: false,
    error: null,
    ...overrides
  };
}

function fakeBrief(overrides: Partial<CrisisBriefReadModel> = {}): CrisisBriefReadModel {
  return {
    generatedAt: '2026-08-01T12:00:00Z',
    marketGeneratedAt: '2026-08-01T12:00:00Z',
    fossilJetUsdPerL: 0.72,
    sourceStatus: {
      overall: 'ok',
      confidence: 0.9,
      freshness_minutes: 12,
      fallback_rate: 5,
      is_fallback: false
    },
    reserve: {
      generated_at: '2026-08-01T12:00:00Z',
      region: 'eu',
      coverage_days: 28,
      coverage_weeks: 4,
      stress_level: 'normal',
      estimated_supply_gap_pct: 5,
      source_type: 'official',
      source_name: 'mock reserve',
      confidence_score: 0.9
    },
    tippingEvents: [],
    research: {
      status: 'empty',
      signal_count: 0,
      top_signal_title: null,
      top_signal_confidence: null,
      latest_published_at: null
    },
    actions: [],
    error: null,
    ...overrides
  };
}

async function renderCrisis(
  locale: Locale,
  dashboard: DashboardReadModel = fakeDashboard(),
  brief: CrisisBriefReadModel = fakeBrief()
) {
  getDashboardReadModel.mockResolvedValue(dashboard);
  getEuReserveCoverage.mockResolvedValue(dashboard.reserve);
  getTippingPointEvents.mockResolvedValue([]);
  getResearchSignals.mockResolvedValue({ status: 'error', signals: [], message: 'mocked' });
  buildResearchDecisionBrief.mockReturnValue({
    status: 'empty',
    headline: 'mocked brief',
    whyMatters: 'why',
    action: 'action',
    activeCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
    topSignals: []
  });
  getCrisisBriefReadModel.mockResolvedValue(brief);
  const ui = await CrisisPage({ locale });
  return render(ui);
}

describe('CrisisPage', () => {
  beforeEach(() => {
    getDashboardReadModel.mockReset();
    getEuReserveCoverage.mockReset();
    getTippingPointEvents.mockReset();
    getResearchSignals.mockReset();
    buildResearchDecisionBrief.mockReset();
    getCrisisBriefReadModel.mockReset();
  });

  it.each(LOCALES)('renders %s title and question from the locale file', async (locale) => {
    const copy = messagesFor(locale).crisis;
    await renderCrisis(locale);

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(document.querySelector('.js-kicker')).toHaveTextContent(copy.eyebrow);
  });

  it('zh shows the zh-only monitor artifacts when mocked', async () => {
    await renderCrisis('zh');

    expect(screen.getByTestId('tipping-point-simulator')).toBeInTheDocument();
    expect(screen.getByTestId('fuel-vs-saf-price-chart')).toBeInTheDocument();
    expect(screen.getByTestId('reserves-coverage-strip')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /打开储备详情/ })).toHaveAttribute(
      'href',
      '/crisis/eu-jet-reserves'
    );
    expect(getDashboardReadModel).toHaveBeenCalled();
    expect(getCrisisBriefReadModel).not.toHaveBeenCalled();
  });

  it.each(['de', 'en'] as const)('%s does not show the zh-only monitor artifacts', async (locale) => {
    await renderCrisis(locale);

    expect(screen.queryByTestId('tipping-point-simulator')).toBeNull();
    expect(screen.queryByTestId('fuel-vs-saf-price-chart')).toBeNull();
    expect(screen.queryByTestId('reserves-coverage-strip')).toBeNull();
    expect(screen.queryByTestId('tipping-event-timeline')).toBeNull();
    expect(screen.queryByTestId('research-decision-brief')).toBeNull();
    expect(screen.queryByRole('link', { name: /eu-jet-reserves/ })).toBeNull();
    expect(document.querySelector('a[href="/crisis/eu-jet-reserves"]')).toBeNull();
    expect(document.querySelector('a[href^="/crisis/saf-tipping-point"]')).toBeNull();
    expect(getCrisisBriefReadModel).toHaveBeenCalledWith(locale);
    expect(getDashboardReadModel).not.toHaveBeenCalled();
  });

  it('de/en recover through NAV_ENTRIES, not hardcoded locale prefixes', async () => {
    const deView = await renderCrisis('de');
    expect(
      screen.getByRole('link', { name: new RegExp(messagesFor('de').crisis.recovery.review_sources.title) })
    ).toHaveAttribute('href', '/de/sources?filter=review');
    expect(
      screen.getByRole('link', { name: new RegExp(messagesFor('de').crisis.recovery.open_report.title) })
    ).toHaveAttribute('href', '/de/reports/tipping-point-analysis');
    expect(
      screen.getByRole('link', { name: new RegExp(messagesFor('de').crisis.recovery.review_scenarios.title) })
    ).toHaveAttribute('href', '/de/scenarios');
    deView.unmount();

    await renderCrisis('en');
    expect(
      screen.getByRole('link', { name: new RegExp(messagesFor('en').crisis.recovery.review_sources.title) })
    ).toHaveAttribute('href', '/en/sources?filter=review');
    expect(
      screen.getByRole('link', { name: new RegExp(messagesFor('en').crisis.recovery.open_report.title) })
    ).toHaveAttribute('href', '/en/reports/tipping-point-analysis');
  });

  it('keeps monitor flags true only in zh', () => {
    const zh = messagesFor('zh').crisis;
    const de = messagesFor('de').crisis;
    const en = messagesFor('en').crisis;

    expect(zh.show_price_chart).toBe(true);
    expect(zh.show_reserves_strip).toBe(true);
    expect(zh.show_event_timeline).toBe(true);
    expect(zh.show_simulator).toBe(true);
    expect(zh.show_research_brief).toBe(true);
    expect(zh.show_zh_subpage_links).toBe(true);

    for (const copy of [de, en]) {
      expect(copy.show_price_chart).toBe(false);
      expect(copy.show_reserves_strip).toBe(false);
      expect(copy.show_event_timeline).toBe(false);
      expect(copy.show_simulator).toBe(false);
      expect(copy.show_research_brief).toBe(false);
      expect(copy.show_zh_subpage_links).toBe(false);
    }
  });

  it('does not invent a data timestamp on brief fallback', async () => {
    getCrisisBriefReadModel.mockResolvedValue(
      fakeBrief({
        error: 'crisis brief unavailable',
        generatedAt: '2026-08-01T12:00:00Z',
        marketGeneratedAt: '2026-08-01T12:00:00Z'
      })
    );
    getDashboardReadModel.mockResolvedValue(fakeDashboard());
    getEuReserveCoverage.mockResolvedValue(null);
    getTippingPointEvents.mockResolvedValue([]);
    getResearchSignals.mockResolvedValue({ status: 'error', signals: [], message: 'mocked' });
    buildResearchDecisionBrief.mockReturnValue({
      status: 'empty',
      headline: 'mocked brief',
      whyMatters: 'why',
      action: 'action',
      activeCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      neutralCount: 0,
      topSignals: []
    });

    const ui = await CrisisPage({ locale: 'en' });
    render(ui);
    expect(screen.queryByTestId('page-as-of')).toBeNull();
  });

  it('marks a fallback monitor snapshot as an unstamped assumption', async () => {
    const copy = messagesFor('zh').crisis;
    const dashboard = fakeDashboard({
      isFallback: true,
      error: 'market unavailable',
      market: {
        generated_at: '2026-08-01T12:00:00Z',
        source_status: {
          overall: 'degraded',
          confidence: 0,
          freshness_minutes: null,
          fallback_rate: 100,
          is_fallback: true
        },
        values: {}
      }
    });
    await renderCrisis('zh', dashboard);

    const label = copy.footer.market_snapshot.replace('{price}', '0.66').replace('{carbon}', '95.00');
    const row = screen.getByText(label).closest('li');
    expect(row).toHaveTextContent('情景假设');
    expect(row?.querySelector('time')).toBeNull();
    expect(screen.getByTestId('fuel-vs-saf-price-chart')).toHaveAttribute(
      'data-effective-basis',
      'assumption'
    );
  });

  it('shows unavailable rather than zero confidence on a brief fallback', async () => {
    const copy = messagesFor('en').crisis;
    const base = fakeBrief();
    await renderCrisis(
      'en',
      fakeDashboard(),
      fakeBrief({
        error: 'crisis brief unavailable',
        sourceStatus: { ...base.sourceStatus, overall: 'degraded', confidence: 0 },
        reserve: base.reserve ? { ...base.reserve, confidence_score: 0 } : null
      })
    );

    expect(screen.getByText(copy.confidence.unavailable)).toBeInTheDocument();
    expect(
      screen.getByText(
        copy.brief.source_hint
          .replace('{status}', copy.source_status.degraded)
          .replace('{reserve}', copy.confidence.unavailable)
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/^0(?:[.,]0)?%$/)).toBeNull();
  });

  it('does not bleed copy across locale files', () => {
    const zh = JSON.stringify(messagesFor('zh').crisis);
    const de = JSON.stringify(messagesFor('de').crisis);
    const en = JSON.stringify(messagesFor('en').crisis);

    expect(en).not.toMatch(/危机监测|EU 航油风险简报|Krisenbrief|Reservestress|Quellenvertrauen/);
    expect(de).not.toMatch(/危机监测|EU 航油风险简报|Fuel Stress Brief|Reserve stress|Source confidence/);
    expect(zh).toMatch(/危机监测/);
    expect(zh).toMatch(/EU 航油风险简报/);
    expect(en).toMatch(/Fuel Stress Brief/);
    expect(de).toMatch(/Krisenbrief/);
  });

  it('does not use middleware or a [locale] rewrite', () => {
    const webRoot = existsSync(resolve(process.cwd(), 'components/crisis-page.tsx'))
      ? process.cwd()
      : resolve(process.cwd(), 'apps/web');
    const files = [
      'components/crisis-page.tsx',
      'app/crisis/page.tsx',
      'app/de/crisis/page.tsx',
      'app/en/crisis/page.tsx'
    ];

    expect(existsSync(resolve(webRoot, 'middleware.ts'))).toBe(false);
    expect(existsSync(resolve(webRoot, 'app/[locale]'))).toBe(false);

    for (const file of files) {
      const source = readFileSync(resolve(webRoot, file), 'utf8');
      expect(source).not.toMatch(/\bmiddleware\b/);
      expect(source).not.toMatch(/\/\[locale\]/);
    }
  });
});
