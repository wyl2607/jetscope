import type { Route } from 'next';
import { LanguageSwitcher } from '@/components/language-switcher';
import Link from 'next/link';
import { ReactNode } from 'react';

type ShellLocale = 'zh' | 'de' | 'en';

const navByLocale = {
  zh: [
    { href: '/dashboard', label: '决策驾驶舱' },
    { href: '/crisis', label: '危机监测' },
    { href: '/scenarios', label: '情景推演' },
    { href: '/research', label: '研究信号' },
    { href: '/reports', label: '分析报告' },
    { href: '/sources', label: '数据来源' },
    { href: '/admin', label: '管理' }
  ],
  de: [
    { href: '/de', label: 'Startseite' },
    { href: '/de/dashboard', label: 'Entscheidungscockpit' },
    { href: '/de/prices/germany-jet-fuel', label: 'Preise' },
    { href: '/de/sources', label: 'Quellen' },
    { href: '/de/scenarios', label: 'Szenarien' },
    { href: '/de/reports', label: 'Berichte' },
    { href: '/de/admin', label: 'Bereitschaft' },
    { href: '/de/lufthansa-saf-2026', label: 'Analyse' }
  ],
  en: [
    { href: '/en', label: 'Home' },
    { href: '/en/dashboard', label: 'Decision Cockpit' },
    { href: '/en/sources', label: 'Sources' },
    { href: '/en/research', label: 'Research' },
    { href: '/en/reports', label: 'Reports' },
    { href: '/en/admin', label: 'Admin' },
    { href: '/en/scenarios', label: 'Scenarios' }
  ]
} as const satisfies Record<ShellLocale, readonly { href: string; label: string }[]>;

export function Shell({
  title,
  eyebrow,
  description,
  children,
  locale = 'zh'
}: {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
  locale?: ShellLocale;
}) {
  const nav = navByLocale[locale];
  const homeHref = locale === 'de' ? '/de' : locale === 'en' ? '/en' : '/';
  const navigationLabel = locale === 'de' ? 'Hauptnavigation' : locale === 'en' ? 'Main navigation' : '主导航';

  return (
    <div className="jetscope-workbench min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white/90 shadow-sm shadow-slate-200/70 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <LanguageSwitcher />
              <Link href={homeHref as Route} className="text-xs uppercase tracking-[0.22em] text-sky-700">
                JetScope
              </Link>
            </div>
            <p className="mt-1 truncate text-lg font-semibold text-slate-950 md:text-xl">{title}</p>
          </div>
          <nav aria-label={navigationLabel} className="flex max-w-full flex-wrap gap-1 text-sm text-slate-700 md:justify-end">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className="shrink-0 rounded-full px-3 py-1.5 transition hover:bg-sky-50 hover:text-sky-800"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 md:py-10">
        <section className="mb-8 rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-xl shadow-slate-200/70 md:rounded-3xl md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-700">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold text-slate-950">{title}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-700">{description}</p>
        </section>
        {children}
      </main>
    </div>
  );
}
