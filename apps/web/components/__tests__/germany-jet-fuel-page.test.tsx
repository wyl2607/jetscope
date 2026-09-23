import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@/lib/i18n';

const getGermanyJetFuelReadModel = vi.fn();
const getPriceTrendChartReadModel = vi.fn();

vi.mock('@/lib/germany-jet-fuel-read-model', async () => {
  const actual = await vi.importActual<typeof import('@/lib/germany-jet-fuel-read-model')>(
    '@/lib/germany-jet-fuel-read-model'
  );
  return {
    ...actual,
    getGermanyJetFuelReadModel: (...args: unknown[]) => getGermanyJetFuelReadModel(...args)
  };
});

vi.mock('@/lib/price-trend-chart-read-model', () => ({
  getPriceTrendChartReadModel: (...args: unknown[]) => getPriceTrendChartReadModel(...args)
}));

vi.mock('@/components/price-trends-chart', () => ({
  PriceTrendsChart: () => <div data-testid="price-trends-chart">chart</div>
}));

import { GermanyJetFuelPage } from '@/components/germany-jet-fuel-page';

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];

function metric(
  metricKey: string,
  label: string,
  value: number,
  changePct30d: number
) {
  return {
    metricKey,
    label,
    unit: metricKey === 'brent_usd_per_bbl' ? 'USD/bbl' : 'USD/L',
    value,
    digits: 2,
    sourceMetricKey: metricKey,
    latestAsOf: '2026-08-01T00:00:00Z',
    changePct1d: 0.1,
    changePct7d: 1.2,
    changePct30d,
    note: null
  };
}

function liveReadModel() {
  return {
    generatedAt: '2026-08-01T00:00:00Z',
    overallStatus: 'ok',
    isFallback: false,
    error: null,
    metrics: [
      metric('brent_usd_per_bbl', 'Brent', 80, 2),
      metric('jet_usd_per_l', 'Jet fuel', 1.1, 3),
      metric('jet_eu_proxy_usd_per_l', 'EU jet proxy', 1.04, 5),
      metric('carbon_proxy_usd_per_t', 'Carbon proxy', 90, 1)
    ]
  };
}

describe('GermanyJetFuelPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getGermanyJetFuelReadModel.mockReset();
    getPriceTrendChartReadModel.mockReset();
    getGermanyJetFuelReadModel.mockResolvedValue(liveReadModel());
    getPriceTrendChartReadModel.mockResolvedValue({
      metrics: {},
      generatedAt: '2026-08-01T00:00:00Z',
      isFallback: false,
      error: null
    });
  });

  it.each(LOCALES)('renders %s copy from the locale file', async (locale) => {
    const copy = messagesFor(locale).prices;
    const ui = await GermanyJetFuelPage({ locale });
    render(ui);

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(screen.getByText(copy.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(copy.decision_hold)).toBeInTheDocument();
    expect(getGermanyJetFuelReadModel).toHaveBeenCalledWith(locale);
  });

  it('keeps the trend chart only on zh', async () => {
    render(await GermanyJetFuelPage({ locale: 'zh' }));
    expect(screen.getByTestId('price-trends-chart')).toBeInTheDocument();
    expect(getPriceTrendChartReadModel).toHaveBeenCalledOnce();

    cleanup();
    getPriceTrendChartReadModel.mockClear();
    render(await GermanyJetFuelPage({ locale: 'en' }));
    expect(screen.queryByTestId('price-trends-chart')).toBeNull();
    expect(getPriceTrendChartReadModel).not.toHaveBeenCalled();

    cleanup();
    render(await GermanyJetFuelPage({ locale: 'de' }));
    expect(screen.queryByTestId('price-trends-chart')).toBeNull();
  });

  it('uses locale-specific source hrefs from navigation.ts', async () => {
    render(await GermanyJetFuelPage({ locale: 'zh' }));
    expect(screen.getByRole('link', { name: messagesFor('zh').prices.source_jet_eu })).toHaveAttribute(
      'href',
      '/sources?focus=jet_eu_proxy_usd_per_l'
    );

    render(await GermanyJetFuelPage({ locale: 'de' }));
    expect(screen.getByRole('link', { name: messagesFor('de').prices.source_jet_eu })).toHaveAttribute(
      'href',
      '/de/sources?focus=jet_eu_proxy_usd_per_l'
    );

    render(await GermanyJetFuelPage({ locale: 'en' }));
    expect(screen.getByRole('link', { name: messagesFor('en').prices.source_jet_eu })).toHaveAttribute(
      'href',
      '/en/sources?focus=jet_eu_proxy_usd_per_l'
    );
  });

  it('suppresses the as-of stamp on fallback data', async () => {
    getGermanyJetFuelReadModel.mockResolvedValue({
      ...liveReadModel(),
      isFallback: true,
      generatedAt: '2026-08-12T12:00:00Z',
      error: 'timeout'
    });
    render(await GermanyJetFuelPage({ locale: 'zh' }));
    expect(screen.queryByTestId('page-as-of')).toBeNull();
    expect(screen.getByText(messagesFor('zh').prices.decision_review_source)).toBeInTheDocument();
  });

  it('renders no market numbers when the API is unavailable', async () => {
    getGermanyJetFuelReadModel.mockResolvedValue({
      ...liveReadModel(),
      generatedAt: null,
      isFallback: true,
      error: 'API unavailable',
      metrics: liveReadModel().metrics.map((item) => ({
        ...item,
        value: null,
        changePct1d: null,
        changePct7d: null,
        changePct30d: null,
        quality: 'missing'
      }))
    });

    render(await GermanyJetFuelPage({ locale: 'zh' }));

    const rendered = document.body.textContent ?? '';
    for (const forbidden of ['87.01', '0.64', '0.657', '91.91', '92.5', '80.38', '1.1435']) {
      expect(rendered).not.toContain(forbidden);
    }
  });

  it('labels a reachable but degraded read model with its live-source count', async () => {
    const copy = messagesFor('zh').prices;
    const live = liveReadModel();
    getGermanyJetFuelReadModel.mockResolvedValue({
      ...live,
      overallStatus: 'degraded',
      sourceHealth: { live: 4, total: 8 },
      metrics: live.metrics.map((item) => ({
        ...item,
        quality: item.metricKey.includes('proxy') ? 'derived' : 'observed',
        sourceStatus: item.metricKey.includes('proxy') ? 'estimated' : 'live'
      }))
    });
    render(await GermanyJetFuelPage({ locale: 'zh' }));

    const footer = screen.getByRole('contentinfo');
    const text = footer.textContent ?? '';
    expect(text).toContain('德国航油价格读模型已加载：4/8 个来源为实时数据');
    expect(text).not.toContain(copy.source_unknown_error);
    expect(screen.getByTestId('page-as-of')).toBeInTheDocument();

    const basisOf = (label: string) =>
      screen.getByRole('link', { name: label }).closest('li')?.textContent ?? '';
    expect(basisOf(copy.source_brent)).toContain('实测');
    expect(basisOf(copy.source_jet_eu)).toContain('推导');
    expect(basisOf(copy.source_brent)).not.toContain('情景假设');
  });

  it('keeps the fetch-failure copy with its error when the API is unreachable', async () => {
    getGermanyJetFuelReadModel.mockResolvedValue({
      ...liveReadModel(),
      isFallback: true,
      sourceHealth: null,
      error: 'HTTP 502'
    });
    render(await GermanyJetFuelPage({ locale: 'en' }));

    const text = screen.getByRole('contentinfo').textContent ?? '';
    expect(text).toContain('Germany jet-fuel read model unavailable; fallback estimates are in use (HTTP 502)');
  });

  it('does not bleed copy across locale files', () => {
    const zh = JSON.stringify(messagesFor('zh').prices);
    const de = JSON.stringify(messagesFor('de').prices);
    const en = JSON.stringify(messagesFor('en').prices);

    expect(en).not.toMatch(/德国航油|价格 · 德国|先复核来源|Preis-Monitor|Entscheidungsdruck/);
    expect(de).not.toMatch(/Germany Jet-Fuel|Decision pressure|德国航油|先复核来源/);
    expect(zh).toMatch(/德国航油价格监测/);
    expect(en).toMatch(/Germany Jet-Fuel Price Monitor/);
    expect(de).toMatch(/Deutschland Jet-Fuel Preis-Monitor/);
    expect(messagesFor('zh').prices.show_trend_chart).toBe(true);
    expect(messagesFor('en').prices.show_trend_chart).toBe(false);
    expect(messagesFor('de').prices.show_trend_chart).toBe(false);
  });
});
