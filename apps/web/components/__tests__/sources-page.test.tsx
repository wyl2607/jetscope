import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourcesPage, type MarketHealth } from '@/components/sources-page';
import { observed } from '@/lib/figure';
import { messagesFor, type Locale } from '@/lib/i18n';
import type { SourcesReadModel } from '@/lib/sources-read-model';

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];

function makeReadModel(overrides: Partial<SourcesReadModel> = {}): SourcesReadModel {
  const row: SourcesReadModel['rows'][number] = {
    surface: '航煤',
    metricKey: 'jet_usd_per_l',
    source: '覆盖不可用',
    sourceType: '未知',
    scope: 'eu · jet',
    confidence: '0.40',
    confidenceScore: 0.4,
    lag: '无数据',
    lagMinutes: null,
    status: 'unknown',
    fallback: 'yes',
    asOf: 'n/a',
    trustState: 'fallback',
    degradedReason: '实时覆盖不可用，已使用种子回退值',
    value: '无数据',
    change1d: '无数据',
    change7d: '无数据',
    change30d: '无数据',
    alertLevel: 'normal',
    sparkline: '',
    note: '回退',
    reviewAction: {
      label: '刷新并复核回退',
      detail: '配置 JETSCOPE_ADMIN_TOKEN 后触发刷新。',
      href: '/admin',
      priority: 'critical'
    }
  };

  return {
    generatedAt: '2026-08-05T09:00:00Z',
    overallStatus: 'degraded',
    coverageMetrics: [],
    summary: {
      liveCount: 1,
      proxyCount: 0,
      fallbackCount: 1,
      degradedCount: 0,
      averageConfidence: 0.8,
      freshnessLabel: '新鲜度未知',
      trustLabel: '决策支持：请核验降级输入',
      degradedReason: '1 个指标使用回退值'
    },
    rows: [row],
    isFallback: false,
    error: null,
    completeness: observed({
      value: 80,
      unit: '%',
      asOf: '2026-08-05T09:00:00Z',
      sourceId: 'sources-read-model',
      precision: 0
    }),
    degraded: true,
    ...overrides
  };
}

const HEALTH: MarketHealth = {
  healthy: true,
  refresh_interval_seconds: 300,
  age_seconds: 45,
  next_refresh_eta_seconds: 120,
  runs_total: 10,
  runs_ok: 9,
  success_rate: 0.9,
  latest_status: 'ok',
  note: 'refresh loop mocked',
  recent_runs: []
};

describe('SourcesPage', () => {
  it.each(LOCALES)('renders %s filter labels from the locale file', (locale) => {
    const copy = messagesFor(locale).sources;
    render(<SourcesPage locale={locale} readModel={makeReadModel()} />);

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    for (const filter of Object.values(copy.filters)) {
      expect(screen.getByTitle(filter.hint)).toHaveTextContent(filter.label);
    }
  });

  it('shows market-health and provenance on zh when those panels are mocked', () => {
    const copy = messagesFor('zh').sources;
    render(
      <SourcesPage locale="zh" readModel={makeReadModel()} marketHealth={HEALTH} />
    );

    expect(screen.getByRole('heading', { name: copy.panels.provenance.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.panels.coverage.title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: copy.panels.market_health.title })).toBeInTheDocument();
    expect(screen.getByText('refresh loop mocked')).toBeInTheDocument();
  });

  it('does not render the zh-only Trust Center panels on de or en', () => {
    const zh = messagesFor('zh').sources;
    const { rerender } = render(<SourcesPage locale="de" readModel={makeReadModel()} marketHealth={HEALTH} />);

    expect(screen.queryByRole('heading', { name: zh.panels.provenance.title })).toBeNull();
    expect(screen.queryByRole('heading', { name: zh.panels.coverage.title })).toBeNull();
    expect(screen.queryByRole('heading', { name: zh.panels.market_health.title })).toBeNull();
    expect(screen.queryByText('refresh loop mocked')).toBeNull();

    rerender(<SourcesPage locale="en" readModel={makeReadModel()} marketHealth={HEALTH} />);
    expect(screen.queryByRole('heading', { name: zh.panels.provenance.title })).toBeNull();
    expect(screen.queryByRole('heading', { name: zh.panels.coverage.title })).toBeNull();
    expect(screen.queryByRole('heading', { name: zh.panels.market_health.title })).toBeNull();
    expect(screen.queryByText('refresh loop mocked')).toBeNull();
  });

  it('does not render a Chinese read-model string raw on en or de', () => {
    const model = makeReadModel();
    const { rerender } = render(<SourcesPage locale="en" readModel={model} />);

    expect(screen.queryByText('覆盖不可用')).toBeNull();
    expect(screen.queryByText('无数据')).toBeNull();
    expect(screen.queryByText('实时覆盖不可用，已使用种子回退值')).toBeNull();
    expect(screen.getByText(messagesFor('en').sources.read_model_literals['覆盖不可用'])).toBeInTheDocument();
    expect(screen.getAllByText(messagesFor('en').sources.read_model_literals['无数据']).length).toBeGreaterThan(0);

    rerender(<SourcesPage locale="de" readModel={model} />);
    expect(screen.queryByText('覆盖不可用')).toBeNull();
    expect(screen.queryByText('无数据')).toBeNull();
    expect(screen.getByText(messagesFor('de').sources.read_model_literals['覆盖不可用'])).toBeInTheDocument();
  });

  it('renders trend marks with a series token and keeps fallback keys out of TSX', () => {
    const model = makeReadModel();
    model.rows[0].sparkline = '20,40,60';
    const { container } = render(<SourcesPage locale="en" readModel={model} />);

    expect(container.querySelector('svg[aria-label] .stroke-series-1')).not.toBeNull();
    expect(container.querySelector('img[src^="data:image/svg+xml"]')).toBeNull();

    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../sources-page.tsx'), 'utf8');
    expect(source).not.toMatch(/rgb\(/);
    expect(source).not.toMatch(/literals\[['"](?:无数据|覆盖不可用)/);
  });

  it('does not introduce middleware or a /[locale] rewrite', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      join(here, '../sources-page.tsx'),
      join(here, '../../app/sources/page.tsx'),
      join(here, '../../app/de/sources/page.tsx'),
      join(here, '../../app/en/sources/page.tsx')
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/middleware/);
      expect(source).not.toMatch(/app\/\[locale\]|\/\[locale\]/);
    }
  });
});
