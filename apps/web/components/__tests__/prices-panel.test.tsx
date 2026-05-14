import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PricesPanel } from '@/components/prices-panel';

describe('PricesPanel', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <PricesPanel
        prices={[
          {
            source: 'EU ETS',
            value: 100,
            unit: 'USD/t',
            priority: 1,
            is_fallback: false
          }
        ]}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
