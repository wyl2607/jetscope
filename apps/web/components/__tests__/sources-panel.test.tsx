import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourcesPanel } from '@/components/sources-panel';

describe('SourcesPanel', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <SourcesPanel
        sources={[
          {
            name: 'Source A',
            last_updated: new Date().toISOString(),
            fallback_rate: 0.1,
            is_primary: true
          }
        ]}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
