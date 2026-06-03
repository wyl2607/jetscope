import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { describe, expect, it } from 'vitest';
import { LanguageSwitcher } from '@/components/language-switcher';

const mockedPathname = vi.hoisted(() => ({ value: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockedPathname.value
}));

describe('LanguageSwitcher', () => {
  it('renders without crashing', () => {
    const { container } = render(<LanguageSwitcher />);
    expect(container.firstChild).not.toBeNull();
  });

  it('localizes the language control label on German pages', () => {
    mockedPathname.value = '/de/dashboard';

    const { getByText, getByLabelText } = render(<LanguageSwitcher />);

    expect(getByText('Sprache')).toBeTruthy();
    expect(getByText('Chinesisch')).toBeTruthy();
    expect((getByLabelText('Sprache') as HTMLSelectElement).value).toBe('de');
  });
});
