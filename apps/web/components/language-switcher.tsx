'use client';

import { usePathname } from 'next/navigation';

const localeLabels = {
  zh: { zh: '中文', de: 'Deutsch', en: 'English' },
  de: { zh: 'Chinesisch', de: 'Deutsch', en: 'Englisch' },
  en: { zh: 'Chinese', de: 'German', en: 'English' }
} as const;

export function toGermanPath(pathname: string): string {
  if (pathname === '/') {
    return '/de';
  }
  if (pathname === '/en') {
    return '/de';
  }
  if (pathname === '/dashboard') {
    return '/de/dashboard';
  }
  if (pathname === '/en/dashboard') {
    return '/de/dashboard';
  }
  if (pathname === '/prices/germany-jet-fuel') {
    return '/de/prices/germany-jet-fuel';
  }
  if (pathname === '/analysis/lufthansa-flight-cuts-2026-04') {
    return '/de/lufthansa-saf-2026';
  }
  return '/de';
}

export function toChinesePath(pathname: string): string {
  if (pathname === '/en') {
    return '/';
  }
  if (pathname === '/en/dashboard') {
    return '/dashboard';
  }
  if (pathname.startsWith('/en')) {
    return '/';
  }
  if (pathname === '/de') {
    return '/';
  }
  if (pathname === '/de/dashboard') {
    return '/dashboard';
  }
  if (pathname === '/de/prices/germany-jet-fuel') {
    return '/prices/germany-jet-fuel';
  }
  if (pathname === '/de/lufthansa-saf-2026') {
    return '/analysis/lufthansa-flight-cuts-2026-04';
  }
  if (pathname.startsWith('/de')) {
    return '/';
  }
  return pathname || '/';
}

export function toEnglishPath(pathname: string): string {
  if (pathname === '/' || pathname === '/de') {
    return '/en';
  }
  if (pathname === '/dashboard' || pathname === '/de/dashboard') {
    return '/en/dashboard';
  }
  if (pathname.startsWith('/en')) {
    return pathname;
  }
  return '/en';
}

export function LanguageSwitcher() {
  const pathname = usePathname() ?? '/';
  const currentLocale = pathname.startsWith('/de') ? 'de' : pathname.startsWith('/en') ? 'en' : 'zh';
  const controlLabel = currentLocale === 'de' ? 'Sprache' : currentLocale === 'en' ? 'Language' : '语言';
  const labels = localeLabels[currentLocale];

  return (
    <div className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
      <label htmlFor="jetscope-language-switcher">{controlLabel}</label>
      <select
        id="jetscope-language-switcher"
        aria-label={controlLabel}
        className="bg-transparent text-xs font-semibold text-slate-950 outline-none"
        value={currentLocale}
        onChange={(event) => {
          const nextLocale = event.target.value;
          if (nextLocale === 'de') {
            window.location.href = toGermanPath(pathname);
          }
          if (nextLocale === 'zh') {
            window.location.href = toChinesePath(pathname);
          }
          if (nextLocale === 'en') {
            window.location.href = toEnglishPath(pathname);
          }
        }}
      >
        <option value="zh">{labels.zh}</option>
        <option value="de">{labels.de}</option>
        <option value="en">{labels.en}</option>
      </select>
    </div>
  );
}
