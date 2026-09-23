import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { assumed, derived } from '@/lib/figure';
import { toPathwayCostRow } from '@/lib/pathways-read-model';

describe('FuelVsSafPriceChart', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <FuelVsSafPriceChart
        fossilJetUsdPerL={assumed({
          value: 1.2,
          unit: 'USD/L',
          sourceId: 'test',
          method: 'test fixture fossil jet'
        })}
        effectiveFossilJetUsdPerL={derived({
          value: 1.4,
          unit: 'USD/L',
          sourceId: 'test',
          asOf: null,
          method: 'test fixture effective fossil jet'
        })}
        pathways={[
          toPathwayCostRow(
            {
              pathway_key: 'hefa',
              display_name: 'HEFA',
              net_cost_low_usd_per_l: 1.8,
              net_cost_high_usd_per_l: 2.2,
              spread_low_pct: 10,
              spread_high_pct: 20,
              status: 'inflection'
            },
            { asOf: null, basis: 'assumption', method: 'test fixture pathway cost' }
          )
        ]}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('draws a single-point band as a point, not a range', () => {
    const cost = (low: number, high: number) =>
      toPathwayCostRow(
        {
          pathway_key: 'hefa',
          display_name: 'HEFA',
          net_cost_low_usd_per_l: low,
          net_cost_high_usd_per_l: high,
          spread_low_pct: 10,
          spread_high_pct: 10,
          status: 'inflection'
        },
        { asOf: null, basis: 'assumption', method: 'test fixture pathway cost' }
      );
    const { container, queryByText } = render(
      <FuelVsSafPriceChart
        fossilJetUsdPerL={assumed({ value: 1.2, unit: 'USD/L', sourceId: 'test', method: 'fixture' })}
        effectiveFossilJetUsdPerL={derived({ value: 1.4, unit: 'USD/L', sourceId: 'test', asOf: null, method: 'fixture' })}
        pathways={[cost(1.49, 1.49), { ...cost(6.14, 8.71), pathway_key: 'ptl', display_name: 'PtL' }]}
      />
    );

    const text = container.textContent ?? '';
    expect(text).not.toMatch(/1\.49 USD\/L 至 1\.49/);
    expect(queryByText(/6\.14 USD\/L 至 8\.71/)).not.toBeNull();
    const bars = [...container.querySelectorAll<HTMLElement>('.mt-3 > div[style]')].map((bar) => bar.style.width);
    // HEFA bar = its own scaled width (1.49 / 8.71), not widened by the +4 range padding.
    expect(bars).toContain(`${(1.49 / 8.71) * 100}%`);
  });
});
