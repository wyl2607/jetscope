import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AirlineDecisionMatrix } from '@/components/airline-decision-matrix';

describe('AirlineDecisionMatrix', () => {
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

    const { container } = render(
      <AirlineDecisionMatrix
        decision={decision}
        reserveWeeks={3.2}
        pathwayKey="hefa"
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
