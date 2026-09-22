import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricesPanel } from '@/components/prices-panel';
import { observed } from '@/lib/figure';

describe('PricesPanel', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <PricesPanel
        prices={[
          {
            value: observed({
              value: 100,
              unit: 'USD/t',
              asOf: '2026-08-05T09:00:00Z',
              sourceId: 'EU ETS'
            }),
            priority: 1
          }
        ]}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
