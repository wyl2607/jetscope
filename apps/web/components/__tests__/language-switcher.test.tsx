import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguageSwitcher } from '@/components/language-switcher';

describe('LanguageSwitcher', () => {
  it('renders without crashing', () => {
    const { container } = render(<LanguageSwitcher />);
    expect(container.firstChild).not.toBeNull();
  });
});
