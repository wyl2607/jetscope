import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { HeatSensitivityMatrix } from '@/components/heat-sensitivity-matrix';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';

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
