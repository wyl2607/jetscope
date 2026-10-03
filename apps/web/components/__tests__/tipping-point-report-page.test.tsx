import { existsSync, readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { safInflectionAlert, TippingPointReportPage } from '@/components/tipping-point-report-page';
import { messagesFor, type Locale } from '@/lib/i18n';
import type { SafMarketCheck } from '@/lib/product-read-model';
import * as thresholdAlerts from '@/lib/threshold-alerts';

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];

function marketCheck(
  status: SafMarketCheck['status'],
  statutoryAllowancePremiumPct: number | null = null
): SafMarketCheck {
  return {
    reference_id: 'test-reference',
    kind: 'purchase_price',
    region: 'EU',
    period: '2026',
    published_at: '2026-01-01',
    source_name: 'Test source',
    source_url: 'https://example.com',
    pathway_key: 'hefa',
    saf_eur_per_t: 1,
    saf_usd_per_l: 1,
    fossil_with_ets_usd_per_l: 1,
    premium_pct: 26,
    status,
    statutory_allowance_premium_pct: statutoryAllowancePremiumPct
  };
}

async function renderReport(locale: Locale) {
  const ui = await TippingPointReportPage({ locale });
  return render(ui);
}

describe('TippingPointReportPage', () => {
  it.each(LOCALES)('renders %s title and question from the locale file', async (locale) => {
    const copy = messagesFor(locale).tipping_point_report;
    await renderReport(locale);

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(screen.getByText(copy.eyebrow)).toBeInTheDocument();
  });

  it('keeps zh-only artifacts off de and en', async () => {
    const zh = messagesFor('zh').tipping_point_report;
    const de = messagesFor('de').tipping_point_report;
    const en = messagesFor('en').tipping_point_report;

    const zhView = await renderReport('zh');
    expect(zhView.getByRole('heading', { name: zh.chart_title })).toBeInTheDocument();
    expect(zhView.getByRole('heading', { name: zh.reserves_title })).toBeInTheDocument();
    expect(zhView.getByRole('heading', { name: zh.timeline_title })).toBeInTheDocument();
    expect(zhView.getByRole('heading', { name: zh.research_title })).toBeInTheDocument();
    expect(zhView.getByRole('heading', { name: zh.decision_title })).toBeInTheDocument();
    expect(zhView.queryByRole('heading', { name: zh.confidence_title })).toBeNull();
    expect(zhView.queryByRole('heading', { name: zh.next_title })).toBeNull();
    zhView.unmount();

    const deView = await renderReport('de');
    expect(deView.queryByRole('heading', { name: de.chart_title })).toBeNull();
    expect(deView.queryByRole('heading', { name: de.reserves_title })).toBeNull();
    expect(deView.queryByRole('heading', { name: de.timeline_title })).toBeNull();
    expect(deView.queryByRole('heading', { name: de.research_title })).toBeNull();
    expect(deView.queryByRole('heading', { name: de.decision_title })).toBeNull();
    expect(deView.getByRole('heading', { name: de.confidence_title })).toBeInTheDocument();
    expect(deView.getByRole('heading', { name: de.next_title })).toBeInTheDocument();
    deView.unmount();

    const enView = await renderReport('en');
    expect(enView.queryByRole('heading', { name: en.chart_title })).toBeNull();
    expect(enView.queryByRole('heading', { name: en.reserves_title })).toBeNull();
    expect(enView.queryByRole('heading', { name: en.timeline_title })).toBeNull();
    expect(enView.queryByRole('heading', { name: en.research_title })).toBeNull();
    expect(enView.getByRole('heading', { name: en.confidence_title })).toBeInTheDocument();
    expect(enView.getByRole('heading', { name: en.next_title })).toBeInTheDocument();
  });

  it('does not invent a data timestamp on fallback', async () => {
    await renderReport('zh');
    expect(screen.queryByTestId('page-as-of')).toBeNull();
  });

  it('renders missing premium and confidence as unavailable, not zero', async () => {
    const copy = messagesFor('en').tipping_point_report;
    await renderReport('en');

    expect(screen.getAllByText(copy.number_unavailable).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/^0(?:[.,]0)?%$/)).toBeNull();
  });

  it.each(LOCALES)('shows both suppression reasons on fallback in %s', async (locale) => {
    const copy = messagesFor(locale).tipping_point_report.threshold_alerts;
    await renderReport(locale);
    const reason = copy.suppressed.replace('{input}', copy.inputs.market).replace('{reason}', copy.reasons.fallback);
    expect(screen.getByTestId('jet-saf-threshold-status')).toHaveTextContent(reason);
    expect(screen.getByTestId('eua-threshold-status')).toHaveTextContent(reason);
    expect(screen.queryByTestId('saf-inflection-alert')).toBeNull();
  });

  it.each(LOCALES)('renders current Jet–SAF and EUA alerts with assumptions in %s', async (locale) => {
    vi.spyOn(thresholdAlerts, 'evaluateThresholdAlerts').mockReturnValue({
      jetSaf: { check: marketCheck('inflection'), suppression: null },
      eua: { value: 100, triggered: true, suppression: null }
    });
    const copy = messagesFor(locale).tipping_point_report;
    await renderReport(locale);
    expect(screen.getByTestId('saf-inflection-alert')).toHaveTextContent(copy.alert_at_inflection);
    expect(screen.getByTestId('eua-threshold-status')).toHaveTextContent(copy.threshold_alerts.eua_triggered);
    expect(screen.getByText(copy.threshold_alerts.eua_threshold.replace('{threshold}', '100'))).toBeInTheDocument();
    expect(screen.getByText(copy.threshold_alerts.method)).toBeInTheDocument();
  });

  it('retains the allowance-only alert copy', async () => {
    vi.spyOn(thresholdAlerts, 'evaluateThresholdAlerts').mockReturnValue({
      jetSaf: { check: marketCheck('premium', 15), suppression: null },
      eua: { value: 99, triggered: false, suppression: null }
    });
    await renderReport('en');
    expect(screen.getByTestId('saf-inflection-alert')).toHaveTextContent(
      messagesFor('en').tipping_point_report.alert_allowance_inflection.replace('{allowance}', '+15%')
    );
  });

  it('does not introduce middleware or a [locale] rewrite', () => {
    const view = readFileSync('components/tipping-point-report-page.tsx', 'utf8');
    const zhPage = readFileSync('app/reports/tipping-point-analysis/page.tsx', 'utf8');
    const dePage = readFileSync('app/de/reports/tipping-point-analysis/page.tsx', 'utf8');
    const enPage = readFileSync('app/en/reports/tipping-point-analysis/page.tsx', 'utf8');

    for (const source of [view, zhPage, dePage, enPage]) {
      expect(source).not.toMatch(/next\/middleware/);
      expect(source).not.toMatch(/app\/\[locale\]/);
    }
    expect(existsSync('middleware.ts')).toBe(false);
    expect(existsSync('app/[locale]')).toBe(false);
    expect(zhPage).toMatch(/locale="zh"/);
    expect(dePage).toMatch(/locale="de"/);
    expect(enPage).toMatch(/locale="en"/);
    expect(view).not.toMatch(/report page fossil-jet assumed constant|effective fossil jet =/);
    expect(view).toMatch(/asOf: fossilJetIsAssumed \? null : fossilJetAsOf/);
  });

  it('does not bleed copy across locale files', () => {
    const zh = JSON.stringify(messagesFor('zh').tipping_point_report);
    const de = JSON.stringify(messagesFor('de').tipping_point_report);
    const en = JSON.stringify(messagesFor('en').tipping_point_report);

    expect(en).not.toMatch(/临界点报告|核心论点|Kipppunktbericht|Quellenvertrauen/);
    expect(de).not.toMatch(/临界点报告|核心论点|Tipping-Point Report|Source confidence/);
    expect(zh).toMatch(/临界点报告/);
    expect(en).toMatch(/Tipping-Point Report/);
    expect(de).toMatch(/Kipppunktbericht/);
  });
});

describe('safInflectionAlert', () => {
  it('returns no alert when the market check is missing', () => {
    expect(safInflectionAlert(null)).toBeNull();
  });

  it('returns no alert for a premium market check without an allowance value', () => {
    expect(safInflectionAlert(marketCheck('premium'))).toBeNull();
  });

  it.each([13, 15])('returns an allowance alert at %s%% after allowance', (premium) => {
    expect(safInflectionAlert(marketCheck('premium', premium))).toBe('allowance_inflection');
  });

  it('returns no alert above the allowance inflection threshold', () => {
    expect(safInflectionAlert(marketCheck('premium', 16))).toBeNull();
  });

  it('returns an at-inflection alert for inflection status', () => {
    expect(safInflectionAlert(marketCheck('inflection'))).toBe('at_inflection');
  });
});
