import type { ReactNode } from 'react';
import { Shell } from '@/components/shell';
import type { NavLocale } from '@/lib/navigation';

/**
 * The page skeleton required by docs/UI_CONTRACT.md section 2.
 *
 *   PageTemplate
 *     PageHeader    eyebrow · title · one decision question · as-of
 *     SignalRow     2-4 metrics - the answer, above the fold
 *     Panel[]       each: title · why-it-matters · exactly one artifact
 *     SourceFooter  sources · method · limitations
 *
 * The point of the layer is that a reader who has seen one JetScope page has
 * seen them all: the answer sits in the same place, provenance sits in the same
 * place, and the question the page exists to answer is stated rather than
 * implied.
 */

const COPY = {
  zh: { asOf: '数据时间', question: '本页回答', noData: '暂无数据' },
  de: { asOf: 'Datenstand', question: 'Diese Seite beantwortet', noData: 'Keine Daten' },
  en: { asOf: 'Data as of', question: 'This page answers', noData: 'No data' }
} as const satisfies Record<NavLocale, { asOf: string; question: string; noData: string }>;

export function localeCopy(locale: NavLocale) {
  return COPY[locale];
}

export function formatAsOf(value: string | null | undefined, locale: NavLocale): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const tag = locale === 'zh' ? 'zh-CN' : locale === 'de' ? 'de-DE' : 'en-GB';
  // Section 3 rule 5: an explicit timezone, never a bare local-looking string.
  // Formatted in the reader's locale but pinned to UTC on purpose - the same
  // instant must read identically for a zh, de and en audience sitting in three
  // different offsets, or two people quote different times for one price.
  // dateStyle/timeStyle cannot be combined with timeZoneName, hence the
  // explicit fields.
  return new Intl.DateTimeFormat(tag, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
    timeZoneName: 'short'
  }).format(date);
}

export function PageTemplate({
  locale = 'zh',
  eyebrow,
  title,
  question,
  asOf,
  children
}: {
  locale?: NavLocale;
  eyebrow: string;
  title: string;
  /** The single decision this page supports. Section 2 rule 1. */
  question: string;
  /** Source timestamp of the freshest figure on the page, ISO 8601. */
  asOf?: string | null;
  children: ReactNode;
}) {
  const copy = COPY[locale];
  const stamp = formatAsOf(asOf, locale);

  return (
    <Shell locale={locale} eyebrow={eyebrow} title={title} description={question}>
      {stamp ? (
        <p className="-mt-4 mb-8 text-xs text-subtle" data-testid="page-as-of">
          <span className="uppercase tracking-[0.18em]">{copy.asOf}</span>{' '}
          <time dateTime={asOf ?? undefined} className="tabular-nums">
            {stamp}
          </time>
        </p>
      ) : null}
      <div className="space-y-8">{children}</div>
    </Shell>
  );
}

/**
 * The conclusion, above the fold. Section 2 rule 2: this carries the answer,
 * not the inputs. Two to four cards; more than four stops being a signal row
 * and becomes a table.
 */
export function SignalRow({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </section>
  );
}
