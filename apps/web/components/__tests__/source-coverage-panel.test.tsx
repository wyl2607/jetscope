import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceCoveragePanel } from '@/components/source-coverage-panel';

describe('SourceCoveragePanel', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <SourceCoveragePanel
        metrics={[
          {
            metric_key: 'jet_usd_per_l',
            source_type: 'live_feed',
            source_name: 'mock',
            confidence_score: 0.9,
            lag_minutes: 15,
            status: 'live'
          }
        ]}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
