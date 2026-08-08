import { readFile } from 'node:fs/promises';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { HeatSensitivityMatrix } from '@/components/heat-sensitivity-matrix';
import { GridParityWorkbench } from '@/components/grid-parity-workbench';
import { LcoeSensitivityMatrix } from '@/components/lcoe-sensitivity-matrix';
import { EuEtsPressurePanel } from '@/components/eu-ets-pressure-panel';
import { PolicyTimeline } from '@/components/policy-timeline';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { SafPathwayComparisonTable } from '@/components/saf-pathway-comparison-table';
import { SourceCoveragePanel } from '@/components/source-coverage-panel';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import { TippingPointWorkbench } from '@/components/tipping-point-workbench';
import { ScenarioRegistry } from '@/components/scenario-registry';
import { TransitionReadinessDashboard } from '@/components/transition-readiness-dashboard';
import { AdminDataOps } from '@/components/admin-data-ops';
import { TransitionLadder } from '@/components/transition-ladder';
import { observed } from '@/lib/figure';

/**
 * Contract section 2 rule 3: a section is one Panel wrapping exactly one
 * artifact. The card, the title and the why-line belong to the Panel, so an
 * artifact that draws its own card renders a box inside an identical box and
 * says its title twice.
 *
 * This is easy to reintroduce by copying an older component, and it is invisible
 * to the design lint - both the Panel and the duplicate card are made of legal
 * tokens. Hence a test.
 *
 * The one deliberate exception is ResearchDecisionBriefCard: its container is
 * tinted by research status, so the container IS the signal, the same way
 * Panel's own error placeholder is coloured rather than bare. It is excluded
 * here on purpose, not by omission.
 */

function rootClassName(container: HTMLElement): string {
  return (container.firstElementChild as HTMLElement | null)?.className ?? '';
}

describe('artifacts do not draw their own card', () => {
  it('GridParityWorkbench renders bare with data', () => {
    const { container } = render(
      <GridParityWorkbench
        initial={{
          generated_at: '2026-08-06T06:00:00Z',
          inputs: {
            carbon_price_eur_per_t: 80,
            gas_fuel_eur_per_mwh_th: 30,
            coal_fuel_eur_per_mwh_th: 12,
            fossil_reference_key: 'gas_ccgt'
          },
          fossil_reference: {
            plant_key: 'gas_ccgt',
            name: 'Gas CCGT',
            efficiency: 0.55,
            fuel_cost_eur_per_mwh_th: 30,
            var_o_m_eur_per_mwh: 4,
            emission_intensity_t_per_mwh: 0.35,
            marginal_cost_eur_per_mwh: 86
          },
          rows: [{
            tech_key: 'solar_pv',
            name: 'Solar PV',
            lcoe_mid_eur_per_mwh: 55,
            maturity_level: 'commercial',
            gap_vs_fossil_eur_per_mwh: -31,
            spread_pct: -36,
            status: 'dominant'
          }],
          carbon_sweep: [],
          signal: 'clear_leader'
        }}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
    expect(container.querySelector('h3')).toBeNull();
  });

  it('LcoeSensitivityMatrix renders bare with data', () => {
    const { container } = render(
      <LcoeSensitivityMatrix
        initial={{
          generated_at: '2026-08-06T06:00:00Z',
          tech_key: 'solar_pv',
          tech_name: 'Solar PV',
          fossil_reference_key: 'gas_ccgt',
          discount_rates: [0.05],
          full_load_hours: [1000],
          cells: [{
            discount_rate: 0.05,
            full_load_hours: 1000,
            lcoe_eur_per_mwh: 58,
            breakeven_carbon_price_eur_per_t: 72
          }],
          disclaimer: 'Illustrative.'
        }}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
    expect(container.querySelector('h3')).toBeNull();
  });

  it('TippingPointWorkbench renders its populated workspace without top-level card chrome', () => {
    const { container } = render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={3}
        liveDefaults={{
          fossilJetUsdPerL: 1.2,
          carbonPriceEurPerT: 80,
          subsidyUsdPerL: 0.2,
          blendRatePct: 2,
          reserveWeeks: 3,
          pathwayKey: 'hefa'
        }}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl|js-panel/);
    expect(container.querySelector('h2')).toBeNull();
  });

  it('ReservesCoverageStrip renders bare', () => {
    const { container } = render(
      <ReservesCoverageStrip
        reserve={{
          coverage_weeks: 4,
          coverage_days: 28,
          region: 'eu',
          stress_level: 'normal',
          estimated_supply_gap_pct: 5,
          source_type: 'model',
          source_name: 'mock',
          generated_at: '2026-08-06T06:00:00Z',
          confidence_score: 0.8
        }}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
  });

  it('FuelVsSafPriceChart renders bare', () => {
    const { container } = render(
      <FuelVsSafPriceChart
        fossilJetUsdPerL={1.2}
        effectiveFossilJetUsdPerL={1.4}
        pathways={[
          {
            pathway_key: 'hefa',
            display_name: 'HEFA',
            net_cost_low_usd_per_l: 1.8,
            net_cost_high_usd_per_l: 2.2,
            spread_low_pct: 10,
            spread_high_pct: 20,
            status: 'inflection'
          }
        ]}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
  });

  it('TippingEventTimeline renders bare', () => {
    const { container } = render(<TippingEventTimeline events={[]} />);

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
  });

  it('TippingPointSimulator renders bare', () => {
    const { container } = render(
      <TippingPointSimulator tippingPoint={null} decision={null} reserveWeeks={3} />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
  });

  it('ProvenanceSummary renders bare', () => {
    const { container } = render(
      <ProvenanceSummary
        summary={{
          liveCount: 3,
          proxyCount: 1,
          fallbackCount: 0,
          degradedCount: 0,
          averageConfidence: 0.9,
          freshnessLabel: 'fresh',
          trustLabel: 'live',
          degradedReason: 'none'
        }}
        completeness={observed({
          value: 90,
          unit: '%',
          asOf: '2026-08-06T06:00:00Z',
          sourceId: 'sources-read-model',
          precision: 0
        })}
        generatedAt="2026-08-06T06:00:00Z"
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl|js-panel/);
  });

  it('SourceCoveragePanel renders bare with data', () => {
    const { container } = render(
      <SourceCoveragePanel
        metrics={[
          {
            metric_key: 'jet_usd_per_l',
            source_type: 'live_feed',
            source_name: 'mock',
            confidence_score: 0.9,
            lag_minutes: 15,
            fallback_used: false,
            status: 'ok',
            region: 'eu',
            market_scope: 'jet_fuel'
          }
        ]}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl|js-panel/);
  });

  it('SafPathwayComparisonTable renders bare', () => {
    const { container } = render(
      <SafPathwayComparisonTable
        selectedPathwayKey="hefa"
        pathways={[
          {
            pathway_key: 'hefa',
            display_name: 'HEFA',
            net_cost_low_usd_per_l: 1.8,
            net_cost_high_usd_per_l: 2.2,
            spread_low_pct: 10,
            spread_high_pct: 20,
            status: 'inflection'
          }
        ]}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
  });

  it('EuEtsPressurePanel renders bare', () => {
    const { container } = render(
      <EuEtsPressurePanel
        model={{
          generatedAt: '2026-08-06T06:00:00Z',
          signal: 'moderate',
          signalLabel: '中等压力',
          peakPressurePct: 12.5,
          points: [
            {
              eu_ets_eur_per_t: 100,
              carbon_cost_usd_per_l: 0.08,
              effective_fossil_jet_usd_per_l: 0.74,
              pressure_pct: 12.5
            }
          ],
          source: {
            source_type: 'derived',
            confidence_score: 0.8,
            cadence: 'daily',
            updated_at: '2026-08-06T06:00:00Z',
            fallback_used: false
          }
        }}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
  });

  it('PriceTrendsChart renders bare once it has data', () => {
    // Deliberately the ready state. The empty and error branches return tinted
    // blocks on purpose - those containers carry the state and are allowed to.
    const { container } = render(
      <PriceTrendsChart
        metrics={{
          brent_usd_per_bbl: {
            metric_key: 'brent_usd_per_bbl',
            unit: 'USD/bbl',
            latest_value: 87,
            latest_as_of: '2026-08-06T06:00:00Z',
            change_pct_1d: 0.5,
            change_pct_7d: 1.2,
            change_pct_30d: -2,
            points: [
              { as_of: '2026-08-01T06:00:00Z', value: 85 },
              { as_of: '2026-08-06T06:00:00Z', value: 87 }
            ]
          }
        }}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
  });

  it('PolicyTimeline renders bare', () => {
    const { container } = render(
      <PolicyTimeline currentTimestamp={new Date('2026-08-06T06:00:00Z').getTime()} />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
  });

  it('HeatSensitivityMatrix renders bare', () => {
    const { container } = render(
      <HeatSensitivityMatrix
        initial={{
          generated_at: '2026-08-06T06:00:00Z',
          gas_price_eur_per_mwh_th: 90,
          elec_prices: [200],
          cops: [3],
          cells: [
            {
              elec_price_eur_per_mwh_el: 200,
              cop: 3,
              hp_heat_cost_eur_per_mwh: 67,
              breakeven_carbon_price_eur_per_t: 120
            }
          ],
          disclaimer: 'mock'
        }}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl/);
  });

  it('ScenarioRegistry renders bare without nested panel chrome', () => {
    const { container } = render(<ScenarioRegistry />);

    expect(rootClassName(container)).not.toMatch(/rounded-2xl|js-panel/);
    expect(container.querySelectorAll('.js-panel')).toHaveLength(0);
  });

  it('TransitionReadinessDashboard renders bare', () => {
    const { container } = render(
      <TransitionReadinessDashboard
        initialTippingPoint={{
          generated_at: '2026-08-06T06:00:00Z',
          signal: 'switch_window_opening',
          inputs: {
            fossil_jet_usd_per_l: 1.2,
            carbon_price_eur_per_t: 80,
            subsidy_usd_per_l: 0.2,
            blend_rate_pct: 2
          },
          effective_fossil_jet_usd_per_l: 1.3,
          pathways: []
        }}
        initialDecision={{
          generated_at: '2026-08-06T06:00:00Z',
          signal: 'incremental_adjustment',
          inputs: {
            fossil_jet_usd_per_l: 1.2,
            reserve_weeks: 4,
            carbon_price_eur_per_t: 80,
            pathway_key: 'hefa'
          },
          probabilities: {
            raise_fares: 0.2,
            cut_capacity: 0.3,
            buy_spot_saf: 0.1,
            sign_long_term_offtake: 0.25,
            ground_routes: 0.15
          }
        }}
        initialReserve={null}
        policyTargets={[]}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl|rounded-\[2rem\]/);
  });

  it('AdminDataOps renders its populated workspace without top-level panel chrome', () => {
    const { container } = render(<AdminDataOps />);

    expect(rootClassName(container)).not.toMatch(/rounded-2xl|js-panel/);
    expect(container.querySelectorAll('.js-panel')).toHaveLength(0);
  });

  it('TransitionLadder renders bare once it has data', () => {
    const { container } = render(
      <TransitionLadder
        summary={{
          generated_at: '2026-08-06T06:00:00Z',
          domains: [
            {
              domain_key: 'aviation',
              domain_name: 'Aviation',
              carbon_driver: 'EU ETS',
              reference_carbon_price_eur_per_t: 80,
              techs: [
                {
                  tech_key: 'hefa',
                  name: 'HEFA',
                  breakeven_carbon_price_eur_per_t: 120,
                  competitive_at_reference: false
                }
              ]
            }
          ],
          disclaimer: 'Mock transition summary.'
        }}
      />
    );

    expect(rootClassName(container)).not.toMatch(/rounded-2xl|js-panel/);
    expect(container.querySelector('h3')).toBeNull();
  });
});

describe('an artifact whose container carries state keeps it', () => {
  it('ReservesCoverageStrip still announces missing reserve data', () => {
    const { container } = render(<ReservesCoverageStrip reserve={null} />);
    const alert = container.querySelector('[role="alert"]');

    // Section 3: a data gap is a finding, not a blank. Rendering nothing - or
    // rendering it in neutral grey - hides the gap instead of reporting it.
    expect(alert).not.toBeNull();
    expect(alert?.className).toMatch(/rose/);
  });
});

const ADMIN_PAGES = [
  '../../app/admin/page.tsx',
  '../../app/de/admin/page.tsx',
  '../../app/en/admin/page.tsx'
] as const;

function helperBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  const end = rest.search(/\r?\n\}/);
  expect(end, `${name} body must terminate`).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe('admin readiness tones fail safely', () => {
  for (const path of ADMIN_PAGES) {
    it(`${path} keeps unrecognized check states out of success`, async () => {
      const source = await readFile(new URL(path, import.meta.url), 'utf8');
      const readinessTone = helperBody(source, 'readinessToneClass');
      const launchImpact = helperBody(source, 'launchImpactClass');

      expect(readinessTone).toMatch(/tone === 'ok' && check\.status === 'ok'.*border-success/);
      expect(readinessTone.slice(readinessTone.lastIndexOf('return'))).toMatch(/warning/);
      expect(readinessTone.slice(readinessTone.lastIndexOf('return'))).not.toMatch(/success/);
      expect(launchImpact.slice(launchImpact.lastIndexOf('return'))).toMatch(/warning/);
      expect(launchImpact.slice(launchImpact.lastIndexOf('return'))).not.toMatch(/success/);
    });
  }
});
