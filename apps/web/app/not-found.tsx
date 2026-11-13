'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { messagesFor, type Locale } from '@/lib/i18n';
import { homeHrefFor } from '@/lib/navigation';

export default function NotFound() {
  const pathname = usePathname() ?? '/';
  const locale: Locale = /^\/de(\/|$)/.test(pathname) ? 'de' : /^\/en(\/|$)/.test(pathname) ? 'en' : 'zh';
  const copy = messagesFor(locale).error_page;

  return (
    <main className="js-main mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16 sm:px-6">
      <section className="rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
        <p className="js-kicker">404</p>
        <h1 className="js-page-title">{copy.not_found_title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{copy.not_found_description}</p>
        <Link
          className="mt-6 inline-block rounded-xl border border-accent bg-accent-soft px-4 py-2 text-sm font-semibold text-accent hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent"
          href={homeHrefFor(locale) as Route}
        >
          {copy.home}
        </Link>
      </section>
    </main>
  );
}
