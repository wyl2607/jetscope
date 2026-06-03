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
  if (pathname === '/en/sources') {
    return '/de/sources';
  }
  if (pathname === '/en/research') {
    return '/de/research';
  }
  if (pathname === '/en/reports') {
    return '/de/reports';
  }
  if (pathname === '/en/admin') {
    return '/de/admin';
  }
  if (pathname === '/en/scenarios') {
    return '/de/scenarios';
  }
  if (pathname === '/en/prices/germany-jet-fuel') {
    return '/de/prices/germany-jet-fuel';
  }
  if (pathname === '/en/lufthansa-saf-2026') {
    return '/de/lufthansa-saf-2026';
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
  if (pathname === '/en/sources') {
    return '/sources';
  }
  if (pathname === '/en/research') {
    return '/research';
  }
  if (pathname === '/en/reports') {
    return '/reports';
  }
  if (pathname === '/en/admin') {
    return '/admin';
  }
  if (pathname === '/en/scenarios') {
    return '/scenarios';
  }
  if (pathname === '/en/prices/germany-jet-fuel') {
    return '/prices/germany-jet-fuel';
  }
  if (pathname === '/en/lufthansa-saf-2026') {
    return '/analysis/lufthansa-flight-cuts-2026-04';
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
  if (pathname === '/de/sources') {
    return '/sources';
  }
  if (pathname === '/de/research') {
    return '/research';
  }
  if (pathname === '/de/reports') {
    return '/reports';
  }
  if (pathname === '/de/admin') {
    return '/admin';
  }
  if (pathname === '/de/scenarios') {
    return '/scenarios';
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
  if (pathname === '/sources') {
    return '/en/sources';
  }
  if (pathname === '/de/sources') {
    return '/en/sources';
  }
  if (pathname === '/en/sources') {
    return '/en/sources';
  }
  if (pathname === '/research') {
    return '/en/research';
  }
  if (pathname === '/de/research') {
    return '/en/research';
  }
  if (pathname === '/en/research') {
    return '/en/research';
  }
  if (pathname === '/reports') {
    return '/en/reports';
  }
  if (pathname === '/de/reports') {
    return '/en/reports';
  }
  if (pathname === '/en/reports') {
    return '/en/reports';
  }
  if (pathname === '/admin') {
    return '/en/admin';
  }
  if (pathname === '/de/admin') {
    return '/en/admin';
  }
  if (pathname === '/en/admin') {
    return '/en/admin';
  }
  if (pathname === '/scenarios') {
    return '/en/scenarios';
  }
  if (pathname === '/de/scenarios') {
    return '/en/scenarios';
  }
  if (pathname === '/en/scenarios') {
    return '/en/scenarios';
  }
  if (pathname === '/prices/germany-jet-fuel' || pathname === '/de/prices/germany-jet-fuel') {
    return '/en/prices/germany-jet-fuel';
  }
  if (pathname === '/en/prices/germany-jet-fuel') {
    return '/en/prices/germany-jet-fuel';
  }
  if (pathname === '/analysis/lufthansa-flight-cuts-2026-04' || pathname === '/de/lufthansa-saf-2026') {
    return '/en/lufthansa-saf-2026';
  }
  if (pathname === '/en/lufthansa-saf-2026') {
    return '/en/lufthansa-saf-2026';
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
