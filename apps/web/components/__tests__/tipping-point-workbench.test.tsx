import { render, screen } from '@testing-library/react';
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

  it('masks the admin token input and disables browser helpers', () => {
    render(
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

    const tokenInput = screen.getByLabelText(/管理令牌/) as HTMLInputElement;

    expect(tokenInput.type).toBe('password');
    expect(tokenInput).toHaveAttribute('autocomplete', 'off');
    expect(tokenInput).toHaveAttribute('spellcheck', 'false');
  });
});
