import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TippingPointWorkbench } from '@/components/tipping-point-workbench';
import { assumed } from '@/lib/figure';

const testLiveDefaults = {
  fossilJetUsdPerL: assumed({
    value: 1.2,
    unit: 'USD/L',
    sourceId: 'test',
    method: 'test fixture fossil jet',
    precision: 2
  }),
  carbonPriceEurPerT: assumed({
    value: 80,
    unit: 'EUR/t',
    sourceId: 'test',
    method: 'test fixture carbon',
    precision: 2
  }),
  subsidyUsdPerL: assumed({
    value: 0.2,
    unit: 'USD/L',
    sourceId: 'test',
    method: 'test fixture subsidy',
    precision: 2
  }),
  blendRatePct: assumed({
    value: 2,
    unit: '%',
    sourceId: 'test',
    method: 'test fixture blend',
    precision: 2
  }),
  reserveWeeks: assumed({
    value: 3,
    unit: 'weeks',
    sourceId: 'test',
    method: 'test fixture reserve',
    precision: 1
  }),
  pathwayKey: 'hefa'
};

const testReserve = assumed({
  value: 3,
  unit: 'weeks',
  sourceId: 'test',
  method: 'test fixture initial reserve',
  precision: 1
});

describe('TippingPointWorkbench', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });

  it('masks the admin token input and disables browser helpers', () => {
    render(
      <TippingPointWorkbench
        initialTippingPoint={null}
        initialDecision={null}
        initialReserveWeeks={testReserve}
        liveDefaults={testLiveDefaults}
      />
    );

    const tokenInput = screen.getByLabelText(/管理令牌/) as HTMLInputElement;

    expect(tokenInput.type).toBe('password');
    expect(tokenInput).toHaveAttribute('autocomplete', 'off');
    expect(tokenInput).toHaveAttribute('spellcheck', 'false');
  });
});
