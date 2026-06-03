import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScenarioRegistry } from '@/components/scenario-registry';

describe('ScenarioRegistry', () => {
  it('renders without crashing', () => {
    const { container } = render(<ScenarioRegistry />);
    expect(container.firstChild).not.toBeNull();
  });

  it('masks the admin token input and disables browser helpers', () => {
    render(<ScenarioRegistry />);

    const tokenInput = screen.getByLabelText(/管理令牌/) as HTMLInputElement;

    expect(tokenInput.type).toBe('password');
    expect(tokenInput).toHaveAttribute('autocomplete', 'off');
    expect(tokenInput).toHaveAttribute('spellcheck', 'false');
  });
});
