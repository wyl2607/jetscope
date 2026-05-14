import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TippingPointWorkbench } from '@/components/tipping-point-workbench';

describe('TippingPointWorkbench', () => {
  it('renders without crashing', () => {
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

    expect(container.firstChild).not.toBeNull();
  });
});
