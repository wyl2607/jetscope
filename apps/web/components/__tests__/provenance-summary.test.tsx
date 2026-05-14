import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProvenanceSummary } from '@/components/provenance-summary';

describe('ProvenanceSummary', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ProvenanceSummary
        summary={{
          liveCount: 1,
          proxyCount: 0,
          fallbackCount: 0,
          degradedCount: 0,
          averageConfidence: 0.9,
          trustLabel: '可信',
          degradedReason: '无',
          freshnessLabel: '新'
        }}
        completeness={0.95}
        generatedAt={new Date().toISOString()}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
