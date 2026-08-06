import type { Route } from 'next';
import Link from 'next/link';
import type { NavLocale } from '@/lib/navigation';
import { formatAsOf } from '@/components/page-template';
import { assertFigure, formatFigure, isStale, type Figure } from '@/lib/figure';

/**
 * How a `Figure` is allowed to reach the screen - docs/UI_CONTRACT.md section 3.
 *
 * Everything the contract asks for per number is rendered here once, so that
 * "assumptions are visibly marked" and "nulls say why" are properties of the
 * component rather than of whoever wrote the page that day. Both rules have
 * been broken before by people who fully intended to follow them.
 */

const COPY = {
  zh: {
    basis: { observed: '实测', derived: '推导', assumption: '情景假设' },
    method: '方法',
    stale: '已过期',
    staleHint: '数据早于该来源承诺的更新节奏'
  },
  de: {
    basis: { observed: 'gemessen', derived: 'abgeleitet', assumption: 'Szenarioannahme' },
    method: 'Methodik',
    stale: 'veraltet',
    staleHint: 'Älter als der zugesagte Aktualisierungsrhythmus der Quelle'
  },
  en: {
    basis: { observed: 'observed', derived: 'derived', assumption: 'scenario assumption' },
    method: 'Method',
    stale: 'stale',
    staleHint: 'Older than the update cadence this source promises'
  }
} as const satisfies Record<
  NavLocale,
  { basis: Record<Figure['basis'], string>; method: string; stale: string; staleHint: string }
>;

/**
 * Assumptions get `warning`, always. Observed and derived stay neutral: the
 * semantic colours are a scarce vocabulary and "this is a normal measurement"
 * is not news. A derived figure is distinguished by its method link, not by
 * colour.
 */
function basisClass(basis: Figure['basis']): string {
  return basis === 'assumption'
    ? 'border-warning bg-warning-soft text-warning'
    : 'border-line bg-surface text-muted';
}

export function FigureBasisMark({
  figure,
  locale = 'zh'
}: {
  figure: Figure;
  locale?: NavLocale;
}) {
  const copy = COPY[locale];
  const label = copy.basis[figure.basis];

  return (
    <span
      data-testid={`figure-basis-${figure.basis}`}
      className={`inline-flex items-center gap-1 rounded-xl border px-1.5 py-0.5 text-xs ${basisClass(figure.basis)}`}
      title={figure.method}
    >
      {label}
      {figure.methodHref ? (
        <Link
          href={figure.methodHref as Route}
          className="underline decoration-accent/40 hover:decoration-accent"
        >
          {copy.method}
        </Link>
      ) : null}
    </span>
  );
}

export function FigureValue({
  figure,
  locale = 'zh',
  size = 'inline',
  showTimestamp = true,
  className
}: {
  figure: Figure;
  locale?: NavLocale;
  /** `metric` for a SignalRow card, `inline` for body text and table cells. */
  size?: 'metric' | 'inline';
  showTimestamp?: boolean;
  className?: string;
}) {
  if (process.env.NODE_ENV !== 'production') {
    assertFigure(figure, `FigureValue(sourceId=${figure.sourceId})`);
  }

  const copy = COPY[locale];
  const stale = isStale(figure);
  const stamp = showTimestamp ? formatAsOf(figure.asOf, locale) : null;
  const valueClass = size === 'metric' ? 'text-3xl font-semibold' : 'text-sm font-medium';

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-2 ${className ?? ''}`}>
      <span className={`tabular-nums ${valueClass} ${figure.value === null ? 'text-muted' : 'text-ink'}`}>
        {formatFigure(figure, locale === 'zh' ? 'zh' : locale === 'de' ? 'de' : 'en')}
      </span>

      {/* Section 3 rule 3: a missing number says why, rather than showing 0. */}
      {figure.value === null && figure.reason ? (
        <span className="text-xs leading-5 text-muted">{figure.reason}</span>
      ) : null}

      <FigureBasisMark figure={figure} locale={locale} />

      {stamp ? (
        <time
          dateTime={figure.asOf ?? undefined}
          title={stale ? copy.staleHint : undefined}
          className={`text-xs tabular-nums ${stale ? 'text-warning' : 'text-subtle'}`}
        >
          {stamp}
          {stale ? ` · ${copy.stale}` : ''}
        </time>
      ) : null}
    </span>
  );
}
