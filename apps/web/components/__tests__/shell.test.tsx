import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Shell } from '@/components/shell';

describe('Shell', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <Shell title="Title" eyebrow="Eyebrow" description="Description">
        <div>Child</div>
      </Shell>
    );

    expect(container.firstChild).not.toBeNull();
  });
});
