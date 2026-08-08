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
});
