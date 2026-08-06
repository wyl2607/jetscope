import type { Route } from 'next';
import Link from 'next/link';
import type { NavLocale } from '@/lib/navigation';
import { formatAsOf } from '@/components/page-template';

/**
 * How every page ends. Section 2 rule 4: a page with no sources does not ship.
 *
 * This is the visible half of the reasoning chain - it answers "where did this
 * come from" and "how was it derived" for the page as a whole, while the
 * per-figure half lands in P3 with the Figure contract.
 */

export type SourceRef = {
  id: string;
  label: string;
  href?: string;
  /** Source timestamp, ISO 8601. */
  asOf?: string | null;
  /** Section 3: observed measurements, derived values and assumptions differ. */
  basis?: 'observed' | 'derived' | 'assumption';
};

const COPY = {
  zh: {
    heading: '来源与方法',
    sources: '数据来源',
    method: '计算方法',
    limits: '适用边界',
    basis: { observed: '实测', derived: '推导', assumption: '情景假设' }
  },
  de: {
    heading: 'Quellen und Methodik',
    sources: 'Datenquellen',
    method: 'Berechnungsmethode',
    limits: 'Grenzen der Aussage',
    basis: { observed: 'gemessen', derived: 'abgeleitet', assumption: 'Szenarioannahme' }
  },
  en: {
    heading: 'Sources and method',
    sources: 'Data sources',
    method: 'Method',
    limits: 'Limitations',
    basis: { observed: 'observed', derived: 'derived', assumption: 'scenario assumption' }
  }
} as const;

export function SourceFooter({
  sources,
  methodHref,
  methodLabel,
  limitations,
  locale = 'zh'
}: {
  sources: readonly SourceRef[];
  methodHref?: string;
  methodLabel?: string;
  /** What this page cannot tell you. Honest edges beat implied completeness. */
  limitations?: readonly string[];
  locale?: NavLocale;
}) {
  const copy = COPY[locale];

  return (
    <footer className="rounded-2xl border border-line bg-surface-muted p-6">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{copy.heading}</h2>

      <div className="mt-4 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <h3 className="text-sm font-medium text-ink">{copy.sources}</h3>
          <ul className="mt-2 space-y-2 text-sm text-muted">
            {sources.map((source) => {
              const stamp = formatAsOf(source.asOf, locale);
              return (
                <li key={source.id} className="leading-6">
                  {source.href ? (
                    <a
                      href={source.href}
                      className="text-accent underline decoration-accent/40 hover:decoration-accent"
                    >
                      {source.label}
                    </a>
                  ) : (
                    <span className="text-ink">{source.label}</span>
                  )}
                  {source.basis ? (
                    <span
                      className={`ml-2 rounded-md border px-1.5 py-0.5 text-xs ${
                        source.basis === 'assumption'
                          ? 'border-warning bg-warning-soft text-warning'
                          : 'border-line bg-surface text-muted'
                      }`}
                    >
                      {copy.basis[source.basis]}
                    </span>
                  ) : null}
                  {stamp ? (
                    <time dateTime={source.asOf ?? undefined} className="ml-2 text-xs tabular-nums text-subtle">
                      {stamp}
                    </time>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-4">
          {methodHref ? (
            <div>
              <h3 className="text-sm font-medium text-ink">{copy.method}</h3>
              <Link
                href={methodHref as Route}
                className="mt-1 inline-block text-sm text-accent underline decoration-accent/40 hover:decoration-accent"
              >
                {methodLabel ?? methodHref}
              </Link>
            </div>
          ) : null}

          {limitations && limitations.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-ink">{copy.limits}</h3>
              <ul className="mt-1 space-y-1 text-sm leading-6 text-muted">
                {limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
