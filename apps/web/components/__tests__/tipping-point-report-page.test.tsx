import { existsSync, readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TippingPointReportPage } from '@/components/tipping-point-report-page';
import { messagesFor, type Locale } from '@/lib/i18n';

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];

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

  it('renders missing probability and confidence as unavailable, not zero', async () => {
    const copy = messagesFor('en').tipping_point_report;
    await renderReport('en');

    expect(screen.getAllByText(copy.number_unavailable).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/^0(?:[.,]0)?%$/)).toBeNull();
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
