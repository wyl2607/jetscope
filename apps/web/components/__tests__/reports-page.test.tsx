import { render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardReadModel } from '@/lib/dashboard-read-model';
import { messagesFor, type Locale } from '@/lib/i18n';

const { getDashboardReadModel } = vi.hoisted(() => ({
  getDashboardReadModel: vi.fn<(locale?: Locale) => Promise<DashboardReadModel>>()
}));

vi.mock('@/lib/dashboard-read-model', () => ({
  getDashboardReadModel
}));

import { ReportsPage } from '@/components/reports-page';

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];

function fakeReadModel(overrides: Partial<DashboardReadModel> = {}): DashboardReadModel {
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
      values: {}
    },
    reserve: null,
    tippingPoint: null,
    airlineDecision: null,
    sourceCoverage: null,
    aviationEvent: null,
    marketHealth: null,
    analysisInputs: {
      fossilJetUsdPerL: 0.7,
      carbonPriceEurPerT: 90,
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

async function renderReports(locale: Locale, readModel: DashboardReadModel = fakeReadModel()) {
  getDashboardReadModel.mockResolvedValue(readModel);
  const ui = await ReportsPage({ locale });
  return render(ui);
}

describe('ReportsPage', () => {
  beforeEach(() => {
    getDashboardReadModel.mockReset();
  });

  it.each(LOCALES)('renders %s title and question from the locale file', async (locale) => {
    const copy = messagesFor(locale).reports;
    await renderReports(locale);

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(getDashboardReadModel).toHaveBeenCalledWith(locale);
  });

  it('keeps the zh action set: tipping-point in, admin out', async () => {
    const copy = messagesFor('zh').reports;
    await renderReports('zh');

    expect(screen.getByText(copy.actions.tipping_point.label)).toBeInTheDocument();
    expect(screen.getByText(copy.catalog.tipping_point.title)).toBeInTheDocument();
    expect(screen.queryByText(copy.actions.admin.label)).toBeNull();
    expect(screen.getByRole('link', { name: new RegExp(copy.actions.tipping_point.label) })).toHaveAttribute(
      'href',
      '/reports/tipping-point-analysis'
    );
    expect(screen.getByRole('link', { name: new RegExp(copy.actions.review_sources.label) })).toHaveAttribute(
      'href',
      '/sources?filter=review'
    );
    expect(screen.getByRole('link', { name: new RegExp(copy.actions.dashboard.label) })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('keeps the de action set: admin in, tipping-point action out, catalog card present', async () => {
    const copy = messagesFor('de').reports;
    await renderReports('de');

    expect(screen.getByText(copy.actions.admin.label)).toBeInTheDocument();
    expect(screen.getByText(copy.catalog.tipping_point.title)).toBeInTheDocument();
    expect(screen.queryByText(copy.actions.tipping_point.label)).toBeNull();
    expect(screen.getByRole('link', { name: new RegExp(copy.actions.admin.label) })).toHaveAttribute(
      'href',
      '/de/admin'
    );
    expect(screen.getByRole('link', { name: new RegExp(copy.catalog.tipping_point.title) })).toHaveAttribute(
      'href',
      '/de/reports/tipping-point-analysis'
    );
  });

  it('keeps the en action set: research in, admin out', async () => {
    const copy = messagesFor('en').reports;
    await renderReports('en');

    expect(screen.getByText(copy.actions.research.label)).toBeInTheDocument();
    expect(screen.getByText(copy.catalog.tipping_point.title)).toBeInTheDocument();
    expect(screen.queryByText(copy.actions.admin.label)).toBeNull();
    expect(screen.getByRole('link', { name: new RegExp(copy.actions.research.label) })).toHaveAttribute(
      'href',
      '/en/research'
    );
  });

  it('substitutes a CJK scenario name for en and de readers', async () => {
    const readModel = fakeReadModel({
      scenarioCount: 1,
      recentScenarioNames: ['临界点情景']
    });

    const { unmount } = await renderReports('en', readModel);
    expect(screen.getByText(messagesFor('en').reports.scenarios.placeholder.replace('{n}', '1'))).toBeInTheDocument();
    expect(screen.queryByText('临界点情景')).toBeNull();
    unmount();

    await renderReports('de', readModel);
    expect(screen.getByText(messagesFor('de').reports.scenarios.placeholder.replace('{n}', '1'))).toBeInTheDocument();
    expect(screen.queryByText('临界点情景')).toBeNull();
  });

  it('does not invent a data timestamp on fallback', async () => {
    await renderReports(
      'zh',
      fakeReadModel({
        isFallback: true,
        error: 'api down',
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
      })
    );
    expect(screen.queryByTestId('page-as-of')).toBeNull();
  });

  it('does not use middleware or a [locale] rewrite', () => {
    const webRoot = existsSync(resolve(process.cwd(), 'components/reports-page.tsx'))
      ? process.cwd()
      : resolve(process.cwd(), 'apps/web');
    const source = readFileSync(resolve(webRoot, 'components/reports-page.tsx'), 'utf8');

    expect(existsSync(resolve(webRoot, 'middleware.ts'))).toBe(false);
    expect(existsSync(resolve(webRoot, 'app/[locale]'))).toBe(false);
    expect(source).not.toMatch(/middleware/);
    expect(source).not.toMatch(/\/\[locale\]/);
    expect(source).not.toMatch(/['"`]\/de\//);
    expect(source).not.toMatch(/['"`]\/en\//);
  });

  it('does not bleed copy across locale files', () => {
    const zh = JSON.stringify(messagesFor('zh').reports);
    const de = JSON.stringify(messagesFor('de').reports);
    const en = JSON.stringify(messagesFor('en').reports);

    expect(en).not.toMatch(/报告工作台|来源状态|上线姿态|Häufige Fragen|Berichtswerkstatt/);
    expect(de).not.toMatch(/Report Workbench|Report catalog|Pre-launch actions|报告工作台|来源状态/);
    expect(zh).toMatch(/报告工作台/);
    expect(en).toMatch(/Report Workbench/);
    expect(de).toMatch(/Berichtswerkstatt/);
  });
});
