import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { describe, expect, it } from 'vitest';
import { LanguageSwitcher, toChinesePath, toEnglishPath, toGermanPath } from '@/components/language-switcher';

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
    expect(toEnglishPath('/faq')).toBe('/en/faq');
    expect(toEnglishPath('/de/faq')).toBe('/en/faq');
    expect(toEnglishPath('/dashboard')).toBe('/en/dashboard');
    expect(toEnglishPath('/sources')).toBe('/en/sources');
    expect(toEnglishPath('/de/sources')).toBe('/en/sources');
    expect(toEnglishPath('/research')).toBe('/en/research');
    expect(toEnglishPath('/de/research')).toBe('/en/research');
    expect(toEnglishPath('/reports')).toBe('/en/reports');
    expect(toEnglishPath('/de/reports')).toBe('/en/reports');
    expect(toEnglishPath('/admin')).toBe('/en/admin');
    expect(toEnglishPath('/de/admin')).toBe('/en/admin');
    expect(toEnglishPath('/scenarios')).toBe('/en/scenarios');
    expect(toEnglishPath('/de/scenarios')).toBe('/en/scenarios');
    expect(toEnglishPath('/prices/germany-jet-fuel')).toBe('/en/prices/germany-jet-fuel');
    expect(toEnglishPath('/de/prices/germany-jet-fuel')).toBe('/en/prices/germany-jet-fuel');
    expect(toEnglishPath('/analysis/lufthansa-flight-cuts-2026-04')).toBe('/en/lufthansa-saf-2026');
    expect(toEnglishPath('/de/lufthansa-saf-2026')).toBe('/en/lufthansa-saf-2026');
    expect(toEnglishPath('/de/dashboard')).toBe('/en/dashboard');
    expect(toGermanPath('/en/prices/germany-jet-fuel')).toBe('/de/prices/germany-jet-fuel');
    expect(toGermanPath('/en/lufthansa-saf-2026')).toBe('/de/lufthansa-saf-2026');
    expect(toGermanPath('/en/faq')).toBe('/de/faq');
    expect(toGermanPath('/en/sources')).toBe('/de/sources');
    expect(toGermanPath('/en/research')).toBe('/de/research');
    expect(toGermanPath('/en/reports')).toBe('/de/reports');
    expect(toGermanPath('/en/admin')).toBe('/de/admin');
    expect(toGermanPath('/en/scenarios')).toBe('/de/scenarios');
    expect(toChinesePath('/en/prices/germany-jet-fuel')).toBe('/prices/germany-jet-fuel');
    expect(toChinesePath('/en/lufthansa-saf-2026')).toBe('/analysis/lufthansa-flight-cuts-2026-04');
    expect(toChinesePath('/en/faq')).toBe('/faq');
    expect(toChinesePath('/en/sources')).toBe('/sources');
    expect(toChinesePath('/en/research')).toBe('/research');
    expect(toChinesePath('/en/reports')).toBe('/reports');
    expect(toChinesePath('/en/admin')).toBe('/admin');
    expect(toChinesePath('/en/scenarios')).toBe('/scenarios');
    expect(toChinesePath('/de/sources')).toBe('/sources');
    expect(toChinesePath('/de/faq')).toBe('/faq');
    expect(toChinesePath('/de/research')).toBe('/research');
    expect(toChinesePath('/de/reports')).toBe('/reports');
    expect(toChinesePath('/de/admin')).toBe('/admin');
    expect(toChinesePath('/de/scenarios')).toBe('/scenarios');
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
