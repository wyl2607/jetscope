import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourcesPanel } from '@/components/sources-panel';
import { observed } from '@/lib/figure';

describe('SourcesPanel', () => {
  it('renders without crashing', () => {
    const lastUpdated = new Date().toISOString();
    const { container } = render(
      <SourcesPanel
        sources={[
          {
            name: 'Source A',
            last_updated: lastUpdated,
            fallback_rate: observed({
              value: 10,
              unit: '%',
              asOf: lastUpdated,
              sourceId: 'Source A',
              precision: 1
            }),
            is_primary: true
          }
        ]}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
