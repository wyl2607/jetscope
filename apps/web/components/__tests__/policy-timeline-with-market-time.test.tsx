import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PolicyTimelineWithMarketTime } from '@/components/policy-timeline-with-market-time';

describe('PolicyTimelineWithMarketTime', () => {
  it('renders without crashing', () => {
    const { container } = render(<PolicyTimelineWithMarketTime />);
    expect(container.firstChild).not.toBeNull();
  });
});
