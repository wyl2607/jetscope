import type { Route } from 'next';
import { LanguageSwitcher } from '@/components/language-switcher';
import Link from 'next/link';
import { ReactNode } from 'react';
import { ShellNav } from '@/components/shell-nav';
import { homeHrefFor, navigationFor, type NavLocale } from '@/lib/navigation';

type ShellLocale = NavLocale;

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
  const nav = navigationFor(locale);
  const homeHref = homeHrefFor(locale);
  const navigationLabel = locale === 'de' ? 'Hauptnavigation' : locale === 'en' ? 'Main navigation' : '主导航';
  const menuLabel = locale === 'de' ? 'Menü' : locale === 'en' ? 'Menu' : '菜单';
  const closeLabel = locale === 'de' ? 'Schließen' : locale === 'en' ? 'Close' : '关闭';

  return (
    <div className="jetscope-workbench js-app-shell min-h-screen text-ink">
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
