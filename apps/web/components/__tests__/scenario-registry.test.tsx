import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScenarioRegistry } from '@/components/scenario-registry';

describe('ScenarioRegistry', () => {
  it('renders without crashing', () => {
    const { container } = render(<ScenarioRegistry />);
    expect(container.firstChild).not.toBeNull();
  });
});
