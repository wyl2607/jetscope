import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import { assumed } from '@/lib/figure';
import { toPathwayCostRow } from '@/lib/pathways-read-model';

describe('TippingPointSimulator', () => {
  it('renders without crashing', () => {
    const decision = {
      signal: 'cut_capacity',
      probabilities: {
        raise_fares: 0.2,
        cut_capacity: 0.3,
        buy_spot_saf: 0.1,
        sign_long_term_offtake: 0.25,
        ground_routes: 0.15
      }
    };

    const tippingPoint = {
      generatedAt: new Date().toISOString(),
      effectiveFossilJetUsdPerL: 1.3,
      signal: 'inflection',
      inputs: {
        fossilJetUsdPerL: 1.2,
        carbonPriceEurPerT: 80,
        subsidyUsdPerL: 0.2,
        blendRatePct: 2
      },
      pathways: [
        toPathwayCostRow(
          {
            pathway_key: 'hefa',
            display_name: 'HEFA',
            net_cost_low_usd_per_l: 1.8,
            net_cost_high_usd_per_l: 2.1,
            spread_low_pct: 10,
            spread_high_pct: 20,
            status: 'inflection'
          },
          { asOf: null, basis: 'assumption', method: 'test fixture pathway cost' }
        )
      ]
    };

    const { container } = render(
      <TippingPointSimulator
        tippingPoint={tippingPoint}
        decision={decision}
        reserveWeeks={assumed({
          value: 3.5,
          unit: 'weeks',
          sourceId: 'test',
          method: 'test fixture reserve',
          precision: 1
        })}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
