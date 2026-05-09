'use client';

import { usePathname } from 'next/navigation';

const localeLabels = {
  zh: '中文',
  de: 'Deutsch',
  en: 'English'
} as const;

function toGermanPath(pathname: string): string {
  if (pathname === '/dashboard') {
    return '/de/dashboard';
  }
  if (pathname === '/prices/germany-jet-fuel') {
    return '/de/prices/germany-jet-fuel';
  }
  return '/de';
}

function toChinesePath(pathname: string): string {
  if (pathname === '/de/dashboard') {
    return '/dashboard';
  }
  if (pathname === '/de/prices/germany-jet-fuel') {
    return '/prices/germany-jet-fuel';
  }
  if (pathname.startsWith('/de')) {
    return '/';
  }
  return pathname || '/';
}

export function LanguageSwitcher() {
  const pathname = usePathname() ?? '/';
  const currentLocale = pathname.startsWith('/de') ? 'de' : 'zh';

  return (
    <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
      <span>语言</span>
      <select
        aria-label="语言"
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
        }}
      >
        <option value="zh">{localeLabels.zh}</option>
        <option value="de">{localeLabels.de}</option>
        <option value="en" disabled>
          {localeLabels.en}
        </option>
      </select>
    </label>
  );
}
