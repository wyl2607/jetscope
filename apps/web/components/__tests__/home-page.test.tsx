import { cleanup, render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@/lib/i18n';

const mocks = vi.hoisted(() => ({
  loadTransitionSummary: vi.fn(),
  getEuReserveCoverage: vi.fn(),
  getTippingPointEvents: vi.fn(),
  getResearchSignals: vi.fn(),
  buildResearchDecisionBrief: vi.fn()
}));

vi.mock('@/lib/transition-read-model', () => ({
  loadTransitionSummary: mocks.loadTransitionSummary
}));

vi.mock('@/lib/portfolio-read-model', () => ({
  getEuReserveCoverage: mocks.getEuReserveCoverage,
  getTippingPointEvents: mocks.getTippingPointEvents
}));

vi.mock('@/lib/research-signals-read-model', () => ({
  AI_RESEARCH_ENABLED: false,
  getResearchSignals: mocks.getResearchSignals,
  buildResearchDecisionBrief: mocks.buildResearchDecisionBrief
}));

vi.mock('@/components/transition-ladder', () => ({
  TransitionLadder: () => <div data-testid="transition-ladder">transition-ladder</div>
}));

vi.mock('@/components/research-decision-brief', () => ({
  ResearchDecisionBriefCard: () => <div data-testid="research-brief">research-brief</div>
}));

const { HomePage } = await import('@/components/home-page');

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

const emptySignals = { status: 'ok' as const, signals: [] };
const emptyBrief = {
  status: 'empty' as const,
  headline: 'brief-headline',
  whyMatters: 'brief-why',
  action: 'brief-action',
  activeCount: 0,
  positiveCount: 0,
  negativeCount: 0,
  neutralCount: 0,
  topSignals: []
};

const transitionSummary = {
  generated_at: '2026-01-15T00:00:00Z',
  disclaimer: 'mock',
  domains: [
    {
      domain_key: 'aviation',
      domain_name: 'Aviation',
      carbon_driver: 'ets',
      reference_carbon_price_eur_per_t: 70,
      techs: [
        {
          tech_key: 'hefa',
          name: 'HEFA',
          breakeven_carbon_price_eur_per_t: 200,
          competitive_at_reference: false
        }
      ]
    }
  ]
};

async function renderHome(locale: Locale) {
  cleanup();
  const ui = await HomePage({ locale });
  return render(ui);
}

function hrefs(): string[] {
  return [...document.querySelectorAll('a')]
    .map((anchor) => anchor.getAttribute('href'))
    .filter((href): href is string => typeof href === 'string');
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEuReserveCoverage.mockResolvedValue(null);
    mocks.getTippingPointEvents.mockResolvedValue([]);
    mocks.getResearchSignals.mockResolvedValue(emptySignals);
    mocks.buildResearchDecisionBrief.mockReturnValue(emptyBrief);
    mocks.loadTransitionSummary.mockResolvedValue(transitionSummary);
  });

  it.each(LOCALES)('renders %s copy from the locale file', async (locale) => {
    const copy = messagesFor(locale).home;
    await renderHome(locale);

    expect(screen.getByRole('heading', { level: 1, name: copy.page_title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(screen.getByText(copy.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(copy.signals.recommended_label)).toBeInTheDocument();
    expect(screen.getByText(copy.entries.title)).toBeInTheDocument();
  });

  it('shows the transition ladder on zh when the summary loads', async () => {
    await renderHome('zh');
    expect(screen.getByTestId('transition-ladder')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: messagesFor('zh').home.transition.title })).toBeInTheDocument();
    expect(mocks.loadTransitionSummary).toHaveBeenCalledTimes(1);
  });

  it('keeps the zh transition path visible when the summary is empty', async () => {
    mocks.loadTransitionSummary.mockResolvedValue(null);
    await renderHome('zh');
    expect(screen.queryByTestId('transition-ladder')).toBeNull();
    expect(screen.getByRole('heading', { name: messagesFor('zh').home.transition.title })).toBeInTheDocument();
    expect(screen.getByText(messagesFor('zh').home.transition.empty_detail)).toBeInTheDocument();
  });

  it('does not show TransitionLadder on de or en', async () => {
    await renderHome('de');
    expect(screen.queryByTestId('transition-ladder')).toBeNull();
    expect(screen.queryByRole('heading', { name: messagesFor('de').home.transition.title })).toBeNull();
    expect(mocks.loadTransitionSummary).not.toHaveBeenCalled();

    await renderHome('en');
    expect(screen.queryByTestId('transition-ladder')).toBeNull();
    expect(screen.queryByRole('heading', { name: messagesFor('en').home.transition.title })).toBeNull();
    expect(mocks.loadTransitionSummary).not.toHaveBeenCalled();
  });

  it('keeps zh-only entry cards off de/en', async () => {
    await renderHome('de');
    expect(hrefs()).not.toContain('/grid');
    expect(hrefs()).not.toContain('/crisis/saf-tipping-point');
    expect(hrefs()).not.toContain('/de/grid');
    expect(hrefs()).not.toContain('/de/crisis/saf-tipping-point');

    await renderHome('en');
    expect(hrefs()).not.toContain('/grid');
    expect(hrefs()).not.toContain('/crisis/saf-tipping-point');
    expect(hrefs()).not.toContain('/en/grid');
    expect(hrefs()).not.toContain('/en/crisis/saf-tipping-point');
  });

  it('keeps the zh cards that de/en omit', async () => {
    await renderHome('zh');
    const links = hrefs();
    expect(links).toContain('/grid');
    expect(links).toContain('/crisis/saf-tipping-point');
    expect(links).toContain('/crisis');
    expect(screen.getByTestId('research-brief')).toBeInTheDocument();
  });

  it('keeps the English Chinese-workspace CTA as locale data', async () => {
    await renderHome('en');
    expect(screen.getByRole('link', { name: messagesFor('en').home.chinese_workspace_cta })).toHaveAttribute(
      'href',
      '/dashboard'
    );

    await renderHome('zh');
    expect(screen.queryByRole('link', { name: 'Open full Chinese workspace' })).toBeNull();
  });

  it('does not bleed copy across locale files', () => {
    const zh = JSON.stringify(messagesFor('zh').home);
    const de = JSON.stringify(messagesFor('de').home);
    const en = JSON.stringify(messagesFor('en').home);

    expect(en).not.toMatch(/作品集入口|脱碳碳价阶梯|电网平价|Startseite · Deutsch/);
    expect(de).not.toMatch(/作品集入口|脱碳碳价阶梯|English preview|Recommended start/);
    expect(zh).toMatch(/JetScope/);
    expect(en).toMatch(/JetScope Europe/);
    expect(de).toMatch(/JetScope Deutschland/);
  });

  it('does not invent a displayed clock stamp', async () => {
    await renderHome('zh');
    expect(screen.queryByTestId('page-as-of')).toBeNull();
  });

  it('does not introduce middleware or a /[locale] rewrite', () => {
    expect(existsSync(join(webRoot, 'middleware.ts'))).toBe(false);
    expect(existsSync(join(webRoot, 'middleware.js'))).toBe(false);
    expect(existsSync(join(webRoot, 'app/[locale]'))).toBe(false);

    const homeSource = readFileSync(join(webRoot, 'components/home-page.tsx'), 'utf8');
    expect(homeSource).not.toMatch(/middleware/);
    expect(homeSource).not.toMatch(/\/\[locale\]/);

    for (const relative of ['app/page.tsx', 'app/de/page.tsx', 'app/en/page.tsx']) {
      const source = readFileSync(join(webRoot, relative), 'utf8');
      expect(source).toMatch(/<HomePage locale="/);
      expect(source).not.toMatch(/middleware/);
      expect(source).not.toMatch(/\/\[locale\]/);
    }
  });
});
