import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';

describe('ReservesCoverageStrip', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <ReservesCoverageStrip
        reserve={{
          coverage_weeks: 4,
          coverage_days: 28,
          stress_level: 'normal',
          estimated_supply_gap_pct: 5,
          source_type: 'model',
          source_name: 'mock',
          generated_at: new Date().toISOString(),
          confidence_score: 0.8
        }}
      />
    );

    expect(container.firstChild).not.toBeNull();
  });
});
