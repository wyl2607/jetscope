import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { describe, expect, it } from 'vitest';
import { LanguageSwitcher, toChinesePath, toEnglishPath } from '@/components/language-switcher';

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

  it('enables English routing for production-facing pages', () => {
    expect(toEnglishPath('/')).toBe('/en');
    expect(toEnglishPath('/dashboard')).toBe('/en/dashboard');
    expect(toEnglishPath('/sources')).toBe('/en/sources');
    expect(toEnglishPath('/research')).toBe('/en/research');
    expect(toEnglishPath('/reports')).toBe('/en/reports');
    expect(toEnglishPath('/admin')).toBe('/en/admin');
    expect(toEnglishPath('/scenarios')).toBe('/en/scenarios');
    expect(toEnglishPath('/de/dashboard')).toBe('/en/dashboard');
    expect(toChinesePath('/en/sources')).toBe('/sources');
    expect(toChinesePath('/en/research')).toBe('/research');
    expect(toChinesePath('/en/reports')).toBe('/reports');
    expect(toChinesePath('/en/admin')).toBe('/admin');
    expect(toChinesePath('/en/scenarios')).toBe('/scenarios');
  });

  it('localizes the language control label on English pages', () => {
    mockedPathname.value = '/en/dashboard';

    const { getByText, getByLabelText } = render(<LanguageSwitcher />);

    expect(getByText('Language')).toBeTruthy();
    expect(getByText('Chinese')).toBeTruthy();
    expect(getByText('English')).toBeTruthy();
    expect((getByLabelText('Language') as HTMLSelectElement).value).toBe('en');
    expect((getByText('English') as HTMLOptionElement).disabled).toBe(false);
  });
});
