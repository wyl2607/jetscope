'use client';

import { usePathname } from 'next/navigation';
import { messagesFor, type Locale } from '@/lib/i18n';

export default function ErrorPage({
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname() ?? '/';
  const locale: Locale = /^\/de(\/|$)/.test(pathname) ? 'de' : /^\/en(\/|$)/.test(pathname) ? 'en' : 'zh';
  const copy = messagesFor(locale).error_page;

  return (
    <main className="js-main mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-4 py-16 sm:px-6">
      <section className="rounded-2xl border border-danger bg-danger-soft p-8 text-center">
        <p className="js-kicker">{copy.error_kicker}</p>
        <h1 className="js-page-title">{copy.error_title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{copy.error_description}</p>
        <button
          className="mt-6 inline-block rounded-xl border border-danger bg-danger-soft px-4 py-2 text-sm font-semibold text-danger hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => reset()}
          type="button"
        >
          {copy.retry}
        </button>
      </section>
    </main>
  );
}
