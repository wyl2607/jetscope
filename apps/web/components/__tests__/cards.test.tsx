import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoCard, MetricCard } from '@/components/cards';

describe('cards', () => {
  it('renders InfoCard without crashing', () => {
    const { container } = render(
      <InfoCard title="Title" subtitle="Subtitle">
        <div>Body</div>
      </InfoCard>
    );
    expect(container.firstChild).not.toBeNull();
  });

  it('renders MetricCard without crashing', () => {
    const { container } = render(
      <MetricCard label="Label" value="123" hint="Hint" />
    );
    expect(container.firstChild).not.toBeNull();
  });
});
