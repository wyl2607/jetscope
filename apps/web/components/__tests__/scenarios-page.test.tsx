import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@/lib/i18n';
import type { DashboardReadModel } from '@/lib/dashboard-read-model';

vi.mock('@/components/scenario-registry', () => ({
  ScenarioRegistry: () => <div data-testid="scenario-registry">registry</div>
}));

vi.mock('@/components/transition-readiness-dashboard', () => ({
  TransitionReadinessDashboard: () => <div data-testid="transition-readiness">readiness</div>
}));

vi.mock('@/lib/dashboard-read-model', () => ({
  getDashboardReadModel: vi.fn()
}));

import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { SCENARIO_SURFACE, ScenariosPage, scenarioNameForLocale } from '@/components/scenarios-page';

const LOCALES: readonly Locale[] = ['zh', 'de', 'en'];
const here = dirname(fileURLToPath(import.meta.url));

function makeReadModel(overrides: Partial<DashboardReadModel> = {}): DashboardReadModel {
  return {
    market: {
      generated_at: '2026-08-01T00:00:00Z',
      source_status: {
        overall: 'ok',
        confidence: 0.9,
        freshness_minutes: 5,
        fallback_rate: 0,
        is_fallback: false
      },
      values: {
        brent_usd_per_bbl: 80,
        jet_usd_per_l: 0.64,
        jet_eu_proxy_usd_per_l: 0.657,
        carbon_proxy_usd_per_t: 91.91
      }
    },
    reserve: {
      generated_at: '2026-08-01T00:00:00Z',
      region: 'EU',
      coverage_days: 35,
      coverage_weeks: 5,
      stress_level: 'normal',
      estimated_supply_gap_pct: null,
      source_type: 'official',
      source_name: 'IEA',
      confidence_score: 0.8
    },
    tippingPoint: {
      generated_at: '2026-08-01T00:00:00Z',
      effective_fossil_jet_usd_per_l: 1.2,
      signal: 'fossil_still_advantaged',
      inputs: {
        fossil_jet_usd_per_l: 1.2,
        carbon_price_eur_per_t: 95,
        subsidy_usd_per_l: 0,
        blend_rate_pct: 6
      },
      pathways: []
    },
    airlineDecision: {
      generated_at: '2026-08-01T00:00:00Z',
      inputs: {
        fossil_jet_usd_per_l: 1.2,
        reserve_weeks: 5,
        carbon_price_eur_per_t: 95,
        pathway_key: 'hefa'
      },
      signal: 'incremental_adjustment',
      probabilities: {
        raise_fares: 0.4,
        cut_capacity: 0.3,
        buy_spot_saf: 0.2,
        sign_long_term_offtake: 0.25,
        ground_routes: 0.08
      }
    },
    sourceCoverage: null,
    aviationEvent: null,
    marketHealth: null,
    analysisInputs: {
      fossilJetUsdPerL: 1.2,
      carbonPriceEurPerT: 95,
      reserveWeeks: 5,
      jetSourceKey: 'rotterdam'
    },
    scenarioCount: 2,
    recentScenarioNames: ['Spring hedge', '春季对冲'],
    freshnessSignal: {
      minutes: 5,
      level: 'fresh',
      freshMaxMinutes: 60,
      staleMaxMinutes: 1440
    },
    topRiskSignal: {
      metric: 'Brent',
      metricKey: 'brent_usd_per_bbl',
      window: '7d',
      changePct: 2.5,
      level: 'normal',
      latestAsOf: '2026-08-01T00:00:00Z',
      sampleCount: 12
    },
    isFallback: false,
    error: null,
    ...overrides
  };
}

describe('ScenariosPage', () => {
  beforeEach(() => {
    vi.mocked(getDashboardReadModel).mockResolvedValue(makeReadModel());
  });

  it('keeps the write registry only on zh, matching the current product split', () => {
    expect(SCENARIO_SURFACE.zh.show_scenario_registry).toBe(true);
    expect(SCENARIO_SURFACE.zh.show_transition_readiness).toBe(true);
    expect(SCENARIO_SURFACE.de.show_scenario_registry).toBe(false);
    expect(SCENARIO_SURFACE.de.show_transition_readiness).toBe(false);
    expect(SCENARIO_SURFACE.en.show_scenario_registry).toBe(false);
    expect(SCENARIO_SURFACE.en.show_transition_readiness).toBe(false);
  });

  it('renders the mocked write registry and readiness dashboard on zh', async () => {
    const copy = messagesFor('zh').scenarios;
    render(await ScenariosPage({ locale: 'zh' }));

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(screen.getByTestId('scenario-registry')).toBeInTheDocument();
    expect(screen.getByTestId('transition-readiness')).toBeInTheDocument();
    expect(screen.getByText(copy.duties_panel.title)).toBeInTheDocument();
    expect(screen.getByText(copy.capabilities[0].title)).toBeInTheDocument();
  });

  it.each(['de', 'en'] as const)('does not mount the write registry on %s', async (locale) => {
    const copy = messagesFor(locale).scenarios;
    render(await ScenariosPage({ locale }));

    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(screen.queryByTestId('scenario-registry')).toBeNull();
    expect(screen.queryByTestId('transition-readiness')).toBeNull();
    expect(screen.getByText(copy.assumptions_panel.title)).toBeInTheDocument();
    expect(screen.getByText(`${copy.write_boundary_label}:`)).toBeInTheDocument();
  });

  it.each(LOCALES)('renders %s copy from the locale file', async (locale) => {
    const copy = messagesFor(locale).scenarios;
    render(await ScenariosPage({ locale }));

    expect(screen.getByText(copy.eyebrow)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(copy.question)).toBeInTheDocument();
    expect(screen.getByText(copy.method_label)).toBeInTheDocument();
    for (const limitation of copy.limitations) {
      expect(screen.getByText(limitation)).toBeInTheDocument();
    }
  });

  it('uses locale-specific hrefs already encoded in navigation.ts', async () => {
    const { rerender } = render(await ScenariosPage({ locale: 'de' }));
    expect(screen.getByRole('link', { name: messagesFor('de').scenarios.method_label })).toHaveAttribute(
      'href',
      '/de/sources'
    );
    expect(
      screen.getByRole('link', { name: new RegExp(messagesFor('de').scenarios.actions[2].label) })
    ).toHaveAttribute('href', '/de/dashboard');
    expect(
      screen.getByRole('link', { name: new RegExp(messagesFor('de').scenarios.actions[1].label) })
    ).toHaveAttribute('href', '/de/sources?filter=review');
    expect(
      screen.getByRole('link', { name: new RegExp(messagesFor('de').scenarios.actions[0].label) })
    ).toHaveAttribute('href', '/scenarios');
    expect(
      screen.getByRole('link', { name: new RegExp(messagesFor('de').scenarios.actions[3].label) })
    ).toHaveAttribute('href', '/de/admin');

    rerender(await ScenariosPage({ locale: 'en' }));
    expect(screen.getByRole('link', { name: messagesFor('en').scenarios.method_label })).toHaveAttribute(
      'href',
      '/en/sources'
    );
    expect(
      screen.getByRole('link', { name: new RegExp(messagesFor('en').scenarios.actions[2].label) })
    ).toHaveAttribute('href', '/en/dashboard');
  });

  it('substitutes CJK scenario names for Latin locales and keeps Latin names', async () => {
    expect(scenarioNameForLocale('春季对冲', 1, 'en', 'Saved scenario {index}')).toBe('Saved scenario 2');
    expect(scenarioNameForLocale('Spring hedge', 0, 'en', 'Saved scenario {index}')).toBe('Spring hedge');
    expect(scenarioNameForLocale('春季对冲', 1, 'de', 'Gespeichertes Szenario {index}')).toBe(
      'Gespeichertes Szenario 2'
    );
    expect(scenarioNameForLocale('Spring hedge', 0, 'zh', '已保存情景 {index}')).toBe('已保存情景 1');
    expect(scenarioNameForLocale('春季对冲', 0, 'zh', '已保存情景 {index}')).toBe('春季对冲');

    render(await ScenariosPage({ locale: 'en' }));
    expect(screen.getByText('Spring hedge')).toBeInTheDocument();
    expect(screen.getByText('Saved scenario 2')).toBeInTheDocument();
    expect(screen.queryByText('春季对冲')).toBeNull();
  });

  it('does not stamp fallback data', async () => {
    vi.mocked(getDashboardReadModel).mockResolvedValue(
      makeReadModel({
        isFallback: true,
        error: 'upstream down',
        tippingPoint: null,
        airlineDecision: null,
        reserve: null,
        market: {
          generated_at: '2026-08-01T00:00:00Z',
          source_status: { overall: 'offline', confidence: 0, freshness_minutes: null, fallback_rate: 100, is_fallback: true },
          values: { brent_usd_per_bbl: 87.01, jet_usd_per_l: 0.64, jet_eu_proxy_usd_per_l: 0.657, carbon_proxy_usd_per_t: 91.91 }
        }
      })
    );

    render(await ScenariosPage({ locale: 'en' }));
    expect(screen.queryByTestId('page-as-of')).toBeNull();
  });

  it('does not invent middleware or a /[locale] segment', () => {
    const shared = readFileSync(join(here, '..', 'scenarios-page.tsx'), 'utf8');
    const zhPage = readFileSync(join(here, '..', '..', 'app', 'scenarios', 'page.tsx'), 'utf8');
    const dePage = readFileSync(join(here, '..', '..', 'app', 'de', 'scenarios', 'page.tsx'), 'utf8');
    const enPage = readFileSync(join(here, '..', '..', 'app', 'en', 'scenarios', 'page.tsx'), 'utf8');

    for (const source of [shared, zhPage, dePage, enPage]) {
      expect(source).not.toMatch(/middleware/);
      expect(source).not.toMatch(/app\/\[locale\]/);
    }
    expect(zhPage).toMatch(/locale="zh"/);
    expect(dePage).toMatch(/locale="de"/);
    expect(enPage).toMatch(/locale="en"/);
  });

  it('loads policy-target methods from locale data instead of hardcoding them in TSX', () => {
    const shared = readFileSync(join(here, '..', 'scenarios-page.tsx'), 'utf8');

    expect(shared).not.toMatch(/RefuelEU mandatory/);
    expect(messagesFor('zh').scenarios.policy_target_methods.saf).toMatch(/法定/);
    expect(messagesFor('de').scenarios.policy_target_methods.saf).toMatch(/gesetzliche Vorgabe/);
    expect(messagesFor('en').scenarios.policy_target_methods.saf).toMatch(/statutory mandate/);
  });

  it('does not bleed review copy across locale files', () => {
    const zh = JSON.stringify(messagesFor('zh').scenarios);
    const de = JSON.stringify(messagesFor('de').scenarios);
    const en = JSON.stringify(messagesFor('en').scenarios);

    expect(en).not.toMatch(/情景工作区|页面职责|Häufige Fragen|Szenarioannahmen/);
    expect(de).not.toMatch(/Scenario Workbench|Saved scenarios|情景工作区|页面职责/);
    expect(zh).toMatch(/情景工作区/);
    expect(en).toMatch(/Scenario Workbench/);
    expect(de).toMatch(/Szenario-Workbench/);
  });
});
