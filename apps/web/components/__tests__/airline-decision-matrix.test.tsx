import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AirlineDecisionMatrix } from '@/components/airline-decision-matrix';
import { assumed } from '@/lib/figure';

describe('AirlineDecisionMatrix', () => {
  it('renders without crashing', () => {
    const decision = {
      signal: 'cut_capacity',
      saf_premium_pct: 18.2,
      saf_premium_basis: 'market_reference' as const,
      saf_reference_period: '2025',
      method: 'heuristic_scenario' as const,
      probabilities: {
        raise_fares: 0.2,
        cut_capacity: 0.3,
        buy_spot_saf: 0.1,
        sign_long_term_offtake: 0.25,
        ground_routes: 0.15
      }
    };

    const { container } = render(
      <AirlineDecisionMatrix
        decision={decision}
        reserveWeeks={assumed({
          value: 3.2,
          unit: 'weeks',
          sourceId: 'test',
          method: 'test fixture reserve',
          precision: 1
        })}
        pathwayKey="hefa"
      />
    );

    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('SAF 买方溢价 +18.2%（EASA 2025 市场参考价）· 概率为启发式情景，不是观测')).toBeInTheDocument();
  });
});
