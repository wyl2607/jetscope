import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScenarioCostStackChart } from '@/components/scenario-cost-stack-chart';

describe('ScenarioCostStackChart', () => {
  it('renders without crashing', () => {
    const tippingPoint = {
      generatedAt: new Date().toISOString(),
      inputs: {
        fossilJetUsdPerL: 1.2,
        carbonPriceEurPerT: 80,
        subsidyUsdPerL: 0.2,
        blendRatePct: 2
      },
      effectiveFossilJetUsdPerL: 1.4,
      signal: 'inflection',
      pathways: [
        {
          pathway_key: 'hefa',
          display_name: 'HEFA',
          net_cost_low_usd_per_l: 1.9,
          net_cost_high_usd_per_l: 2.1,
          spread_low_pct: 8,
          spread_high_pct: 15,
          status: 'inflection'
        }
      ]
    };

    const { container } = render(
      <ScenarioCostStackChart tippingPoint={tippingPoint} selectedPathwayKey="hefa" />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
