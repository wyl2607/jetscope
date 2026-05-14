import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceTrendsChart } from '@/components/price-trends-chart';

describe('PriceTrendsChart', () => {
  it('renders without crashing', () => {
    const metrics = {
      jet_usd_per_l: {
        metric_key: 'jet_usd_per_l',
        unit: 'USD/L',
        latest_value: 1.2,
        latest_as_of: new Date().toISOString(),
        change_pct_1d: 1,
        change_pct_7d: 2,
        change_pct_30d: 3,
        points: [
          { as_of: '2026-05-01T00:00:00.000Z', value: 1.1 },
          { as_of: '2026-05-02T00:00:00.000Z', value: 1.2 }
        ]
      }
    };

    const { container } = render(<PriceTrendsChart metrics={metrics} />);
    expect(container.firstChild).not.toBeNull();
  });
});
