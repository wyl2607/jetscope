import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { observed } from '@/lib/figure';

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
        completeness={observed({
          value: 95,
          unit: '%',
          asOf: '2026-08-05T09:00:00Z',
          sourceId: 'sources-read-model',
          precision: 0
        })}
        generatedAt={new Date().toISOString()}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
