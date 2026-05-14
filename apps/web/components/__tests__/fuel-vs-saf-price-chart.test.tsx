import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';

describe('FuelVsSafPriceChart', () => {
  it('renders without crashing', () => {
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

    expect(container.firstChild).not.toBeNull();
  });
});
