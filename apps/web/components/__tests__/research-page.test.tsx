import { readFile } from 'node:fs/promises';
import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@/lib/i18n';
import type { ResearchSignal, ResearchSignalsResult } from '@/lib/research-signals-read-model';

vi.mock('@/lib/research-signals-read-model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/research-signals-read-model')>();
  return {
    ...actual,
    AI_RESEARCH_ENABLED: true,
    getResearchSignals: vi.fn()
  };
});

vi.mock('@/components/research-decision-brief', () => ({
  ResearchDecisionBriefCard: ({ showLink }: { showLink?: boolean }) => (
    <div data-testid="research-decision-brief" data-show-link={showLink === false ? 'false' : 'true'}>
      ResearchDecisionBriefCard
    </div>
  )
}));

import { ResearchPage } from '@/components/research-page';
import { getResearchSignals } from '@/lib/research-signals-read-model';

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];

function signal(overrides: Partial<ResearchSignal> = {}): ResearchSignal {
  return {
    id: 's1',
    signal_type: 'policy',
    title: 'English title',
    impact_direction: 'positive',
    confidence: 0.8,
    summary_cn: '中文摘要',
    summary_en: 'English summary',
    published_at: '2026-07-01T00:00:00Z',
    ...overrides
  };
}

function readyResult(signals: ResearchSignal[]): ResearchSignalsResult {
  return { status: 'ok', signals };
}

function actionLink(label: string) {
  return screen.getByRole('link', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
}

async function renderResearch(locale: Locale, result: ResearchSignalsResult = readyResult([signal()])) {
  vi.mocked(getResearchSignals).mockResolvedValue(result);
  render(await ResearchPage({ locale }));
}

describe('ResearchPage', () => {
  beforeEach(() => {
    vi.mocked(getResearchSignals).mockReset();
  });

  it.each(LOCALES)('renders %s title and question from the locale file', async (locale) => {
    const copy = messagesFor(locale).research;
    await renderResearch(locale, readyResult([]));

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(screen.getByText(copy.eyebrow)).toBeInTheDocument();
  });

  it('shows zh tipping-point and sources actions, not admin', async () => {
    const copy = messagesFor('zh').research;
    await renderResearch('zh', readyResult([]));

    expect(copy.actions.map((action) => action.id)).toEqual(['tipping_point', 'sources']);
    expect(actionLink(copy.actions[0].label)).toHaveAttribute('href', '/reports/tipping-point-analysis');
    expect(actionLink(copy.actions[1].label)).toHaveAttribute('href', '/sources?filter=review');
    expect(screen.queryByRole('link', { name: messagesFor('de').research.actions[2].label })).toBeNull();
    expect(screen.queryByRole('link', { name: messagesFor('en').research.actions[2].label })).toBeNull();
  });

  it('shows de reports, sources and admin actions, not tipping-point', async () => {
    const copy = messagesFor('de').research;
    await renderResearch('de', readyResult([]));

    expect(copy.actions.map((action) => action.id)).toEqual(['reports', 'sources', 'admin']);
    expect(actionLink(copy.actions[0].label)).toHaveAttribute('href', '/de/reports');
    expect(actionLink(copy.actions[1].label)).toHaveAttribute('href', '/de/sources?filter=review');
    expect(actionLink(copy.actions[2].label)).toHaveAttribute('href', '/de/admin');
    expect(
      screen.queryByRole('link', { name: messagesFor('zh').research.actions[0].label })
    ).toBeNull();
    expect(
      screen.queryByRole('link', { name: messagesFor('en').research.actions[0].label })
    ).toBeNull();
  });

  it('shows en tipping-point, sources and admin actions', async () => {
    const copy = messagesFor('en').research;
    await renderResearch('en', readyResult([]));

    expect(copy.actions.map((action) => action.id)).toEqual(['tipping_point', 'sources', 'admin']);
    expect(actionLink(copy.actions[0].label)).toHaveAttribute('href', '/en/reports/tipping-point-analysis');
    expect(actionLink(copy.actions[1].label)).toHaveAttribute('href', '/en/sources?filter=review');
    expect(actionLink(copy.actions[2].label)).toHaveAttribute('href', '/en/admin');
  });

  it('uses ResearchDecisionBriefCard for the zh decision brief', async () => {
    await renderResearch('zh', readyResult([signal()]));

    const card = screen.getByTestId('research-decision-brief');
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute('data-show-link', 'false');
  });

  it('uses the count grid for de and en ready state, not ResearchDecisionBriefCard', async () => {
    await renderResearch('de', readyResult([signal(), signal({ id: 's2', impact_direction: 'negative' })]));
    expect(screen.queryByTestId('research-decision-brief')).toBeNull();
    expect(screen.getByText(/Aktiv:/)).toBeInTheDocument();
    expect(screen.getByText(/Positiv:/)).toBeInTheDocument();

    cleanup();

    await renderResearch('en', readyResult([signal()]));
    expect(screen.queryByTestId('research-decision-brief')).toBeNull();
    expect(screen.getByText(/Active:/)).toBeInTheDocument();
    expect(screen.getByText(/Positive:/)).toBeInTheDocument();
  });

  it('substitutes CJK signal titles for de and en, and keeps the raw title for zh', async () => {
    const cjk = signal({ title: '中文标题', signal_type: 'policy' });

    await renderResearch('zh', readyResult([cjk]));
    expect(screen.getByRole('heading', { level: 3, name: '中文标题' })).toBeInTheDocument();

    cleanup();

    await renderResearch('de', readyResult([cjk]));
    expect(screen.getByRole('heading', { level: 3, name: 'Forschungssignal 1' })).toBeInTheDocument();

    cleanup();

    await renderResearch('en', readyResult([cjk]));
    expect(screen.getByRole('heading', { level: 3, name: 'policy signal 1' })).toBeInTheDocument();
  });

  it('uses the German placeholder summary even when summary_en exists', async () => {
    const copy = messagesFor('de').research;
    await renderResearch(
      'de',
      readyResult([signal({ summary_en: 'A clean English summary that must not appear in German.' })])
    );

    expect(screen.getByText(copy.summary_placeholder)).toBeInTheDocument();
    expect(screen.queryByText('A clean English summary that must not appear in German.')).toBeNull();
  });

  it('uses summary_en for en only when it exists and has no CJK', async () => {
    const copy = messagesFor('en').research;
    await renderResearch('en', readyResult([signal({ summary_en: 'Clean English summary.' })]));
    expect(screen.getByText('Clean English summary.')).toBeInTheDocument();

    cleanup();

    await renderResearch('en', readyResult([signal({ id: 's-cjk', summary_en: '仍是中文摘要' })]));
    expect(screen.getByText(copy.summary_en_cjk)).toBeInTheDocument();

    cleanup();

    await renderResearch('en', readyResult([signal({ id: 's-empty', summary_en: '' })]));
    expect(screen.getByText(copy.summary_en_missing)).toBeInTheDocument();
  });

  it('takes an explicit locale and does not depend on middleware', async () => {
    const source = await readFile('components/research-page.tsx', 'utf8');
    expect(source).toMatch(/export async function ResearchPage\(\{ locale \}: \{ locale: Locale \}\)/);
    expect(source).not.toMatch(/middleware/);
    expect(source).not.toMatch(/app\/\[locale\]/);
  });
});
