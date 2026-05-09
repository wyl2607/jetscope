import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PolicyTimeline } from '@/components/policy-timeline';

describe('PolicyTimeline', () => {
  it('renders without crashing', () => {
    const { container } = render(<PolicyTimeline currentTimestamp={Date.now()} />);
    expect(container.firstChild).not.toBeNull();
  });
});
