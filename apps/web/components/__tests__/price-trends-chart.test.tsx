import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { derived, observed } from '@/lib/figure';

describe('PriceTrendsChart', () => {
  it('renders without crashing', () => {
    const asOf = new Date().toISOString();
    const metrics = {
      jet_usd_per_l: {
        metric_key: 'jet_usd_per_l',
        unit: 'USD/L',
        latest_value: observed({
          value: 1.2,
          unit: 'USD/L',
          sourceId: 'market-history',
          asOf,
          precision: 2
        }),
        latest_as_of: asOf,
        change_pct_1d: derived({
          value: 1,
          unit: '%',
          sourceId: 'market-history',
          asOf,
          precision: 2,
          method: '相对 1 日前的变化率'
        }),
        change_pct_7d: derived({
          value: 2,
          unit: '%',
          sourceId: 'market-history',
          asOf,
          precision: 2,
          method: '相对 7 日前的变化率'
        }),
        change_pct_30d: derived({
          value: 3,
          unit: '%',
          sourceId: 'market-history',
          asOf,
          precision: 2,
          method: '相对 30 日前的变化率'
        }),
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
