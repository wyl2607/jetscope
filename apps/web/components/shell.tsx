import type { Route } from 'next';
import { LanguageSwitcher } from '@/components/language-switcher';
import Link from 'next/link';
import { ReactNode } from 'react';
import { ShellNav } from '@/components/shell-nav';

type ShellLocale = 'zh' | 'de' | 'en';

const navByLocale = {
  zh: [
    { href: '/dashboard', label: '决策驾驶舱' },
    { href: '/crisis', label: '危机监测' },
    { href: '/grid', label: '电网平价' },
    { href: '/heat', label: '供暖平价' },
    { href: '/scenarios', label: '情景推演' },
    { href: '/research', label: '研究信号' },
    { href: '/reports', label: '分析报告' },
    { href: '/sources', label: '数据来源' },
    { href: '/admin', label: '管理' },
    { href: '/faq', label: '常见问题' }
  ],
  de: [
    { href: '/de', label: 'Startseite' },
    { href: '/de/dashboard', label: 'Entscheidungscockpit' },
    { href: '/de/crisis', label: 'Krisenmonitor' },
    { href: '/de/prices/germany-jet-fuel', label: 'Preise' },
    { href: '/de/sources', label: 'Quellen' },
    { href: '/de/scenarios', label: 'Szenarien' },
    { href: '/de/reports', label: 'Berichte' },
    { href: '/de/research', label: 'Forschung' },
    { href: '/de/admin', label: 'Bereitschaft' },
    { href: '/de/lufthansa-saf-2026', label: 'Analyse' },
    { href: '/de/faq', label: 'FAQ' }
  ],
  en: [
    { href: '/en', label: 'Home' },
    { href: '/en/dashboard', label: 'Decision Cockpit' },
    { href: '/en/crisis', label: 'Crisis Monitor' },
    { href: '/en/prices/germany-jet-fuel', label: 'Prices' },
    { href: '/en/sources', label: 'Sources' },
    { href: '/en/research', label: 'Research' },
    { href: '/en/reports', label: 'Reports' },
    { href: '/en/admin', label: 'Admin' },
    { href: '/en/scenarios', label: 'Scenarios' },
    { href: '/en/lufthansa-saf-2026', label: 'Analysis' },
    { href: '/en/faq', label: 'FAQ' }
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
  const menuLabel = locale === 'de' ? 'Menü' : locale === 'en' ? 'Menu' : '菜单';
  const closeLabel = locale === 'de' ? 'Schließen' : locale === 'en' ? 'Close' : '关闭';

  return (
    <div className="jetscope-workbench js-app-shell min-h-screen text-slate-950">
      <header className="js-shell-header">
        <div className="js-shell-header-inner">
          <div className="js-brand-group">
            <Link href={homeHref as Route} className="js-brand" aria-label="JetScope home">
              <span className="js-brand-mark" aria-hidden="true">
                JS
              </span>
              <span>JetScope</span>
            </Link>
            <span className="js-brand-context">{title}</span>
            <LanguageSwitcher />
          </div>
          <ShellNav
            items={nav}
            navigationLabel={navigationLabel}
            menuLabel={menuLabel}
            closeLabel={closeLabel}
          />
        </div>
      </header>

      <main className="js-main mx-auto max-w-7xl px-4 py-7 sm:px-6 md:py-10">
        <section className="js-page-hero mb-8">
          <div className="max-w-3xl">
            <p className="js-kicker">{eyebrow}</p>
            <h1 className="js-page-title">{title}</h1>
            <p className="js-page-description">{description}</p>
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}
