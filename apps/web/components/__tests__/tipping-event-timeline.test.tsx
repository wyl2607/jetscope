import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';

describe('TippingEventTimeline', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <TippingEventTimeline
        events={[
          {
            id: 'e1',
            event_type: 'ALERT',
            saf_pathway: 'hefa',
            observed_at: new Date().toISOString(),
            fossil_price_usd_per_l: 1.2,
            saf_effective_cost_usd_per_l: 1.9,
            gap_usd_per_l: 0.7
          }
        ]}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
