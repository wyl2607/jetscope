import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getSourcesReadModel, type SourcesReadModel } from '@/lib/sources-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Source Review',
  description:
    'English JetScope source review surface for market provenance, fallback state, confidence, lag, and recovery actions.',
  path: '/en/sources',
  alternateLanguages: {
    'zh-CN': '/sources',
    en: '/en/sources'
  }
});

type SourceRow = SourcesReadModel['rows'][number];
type SourceFilter = 'all' | 'review' | 'fallback' | 'proxy' | 'live';

const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string; hint: string }> = [
  { key: 'all', label: 'All', hint: 'Complete source matrix' },
  { key: 'review', label: 'Needs review', hint: 'Fallback, degraded, proxy, or volatility watch rows' },
  { key: 'fallback', label: 'Fallback', hint: 'Rows currently using fallback or seed values' },
  { key: 'proxy', label: 'Proxy', hint: 'Derived or proxy estimates' },
  { key: 'live', label: 'Live', hint: 'Primary or official live sources' }
];

const SURFACE_LABELS: Record<string, string> = {
  brent_usd_per_bbl: 'Brent',
  jet_usd_per_l: 'Jet fuel',
  carbon_proxy_usd_per_t: 'Carbon proxy',
  jet_eu_proxy_usd_per_l: 'EU jet proxy',
  rotterdam_jet_fuel_usd_per_l: 'Rotterdam jet fuel',
  eu_ets_price_eur_per_t: 'EU ETS',
  germany_premium_pct: 'Germany premium'
};

function normalizeSourceFilter(filter: string | undefined): SourceFilter {
  if (filter === 'review' || filter === 'fallback' || filter === 'proxy' || filter === 'live') {
    return filter;
  }
  return 'all';
}

function rowMatchesSourceFilter(row: SourceRow, filter: SourceFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'review') {
    return row.trustState !== 'live' || row.alertLevel !== 'normal' || row.status !== 'ok';
  }
  if (filter === 'fallback') return row.trustState === 'fallback' || row.status === 'seed' || row.status === 'fallback';
  if (filter === 'proxy') return row.trustState === 'proxy';
  return row.trustState === 'live';
}

function surfaceLabel(metricKey: string): string {
  return SURFACE_LABELS[metricKey] ?? metricKey;
}

function sourceLabel(value: string): string {
  if (!value || value === '无数据') return 'No data';
  if (value === '覆盖不可用') return 'Coverage unavailable';
  if (value === 'Brent 派生回退') return 'Brent-derived fallback';
  if (/[\u4e00-\u9fff]/.test(value)) return 'Coverage unavailable';
  return value.replaceAll('派生回退', 'derived fallback').replaceAll('回退', 'fallback');
}

function noDataLabel(value: string): string {
  return value === '无数据' ? 'No data' : value;
}

function trustLabel(state: string): string {
  if (state === 'live') return 'Live';
  if (state === 'proxy') return 'Proxy';
  if (state === 'fallback') return 'Fallback';
  if (state === 'degraded') return 'Degraded';
  return state;
}

function trustClass(state: string): string {
  if (state === 'live') return 'border-success bg-success-soft text-success';
  if (state === 'proxy') return 'border-accent bg-accent-soft text-accent';
  if (state === 'fallback') return 'border-warning bg-warning-soft text-warning';
  return 'border-danger bg-danger-soft text-danger';
}

function statusLabel(status: string): string {
  if (status === 'ok') return 'Healthy';
  if (status === 'seed') return 'Seed fallback';
  if (status === 'fallback') return 'Fallback';
  if (status === 'error') return 'Error';
  if (status === 'unknown') return 'Unknown';
  return status;
}

function sourceTypeLabel(row: SourceRow): string {
  if (row.trustState === 'live') return 'Primary or official';
  if (row.trustState === 'proxy') return 'Proxy or derived';
  if (row.trustState === 'fallback') return 'Fallback path';
  return 'Needs investigation';
}

function alertLabel(level: SourceRow['alertLevel']): string {
  if (level === 'alert') return 'Alert';
  if (level === 'watch') return 'Watch';
  return 'Normal';
}

function alertColor(level: SourceRow['alertLevel']): string {
  if (level === 'alert') return 'text-danger';
  if (level === 'watch') return 'text-warning';
  return 'text-success';
}

function actionToneClass(priority: SourceRow['reviewAction']['priority']): string {
  if (priority === 'critical') return 'border-danger bg-danger-soft text-danger';
  if (priority === 'review') return 'border-warning bg-warning-soft text-warning';
  return 'border-line bg-surface-muted text-muted';
}

function reviewAction(row: SourceRow): { label: string; detail: string; href: Route } {
  if (row.reviewAction.priority === 'critical') {
    return {
      label: 'Refresh and verify',
      detail: 'Use the admin refresh path after configuring an admin token, then return here to confirm this metric leaves fallback or error state.',
      href: '/admin' as Route
    };
  }
  if (row.reviewAction.priority === 'review') {
    return {
      label: 'Review proxy assumptions',
      detail: 'Before high-risk pricing, purchasing, or disclosure use, cross-check the original quote, policy basis, and report wording.',
      href: '/reports' as Route
    };
  }
  return {
    label: 'Keep snapshot evidence',
    detail: 'Record generated time, confidence, and source state before using this metric in a material decision.',
    href: '/reports' as Route
  };
}

function reasonFor(row: SourceRow): string {
  if (row.trustState === 'fallback') return 'Live coverage is unavailable or fallback was used.';
  if (row.status !== 'ok') return `Source status is ${statusLabel(row.status)}.`;
  if (row.trustState === 'proxy') return 'Proxy or derived metric; review assumptions before material use.';
  if (row.alertLevel !== 'normal') return `Recent volatility is marked ${alertLabel(row.alertLevel)}.`;
  return 'Primary or official source with no degradation flag.';
}

function sparklineDataUrl(encoded: string): string | null {
  if (!encoded) return null;
  const values = encoded
    .split(',')
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item));
  if (values.length < 2) return null;
  const width = 120;
  const height = 28;
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = Number((index * step).toFixed(2));
      const y = Number((height - (value / 100) * height).toFixed(2));
      return `${x},${y}`;
    })
    .join(' ');
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>` +
    `<polyline fill='none' stroke='rgb(56 189 248)' stroke-width='2' points='${points}'/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function sourceFilterHref(filter: SourceFilter, focusMetricKey?: string): Route {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('filter', filter);
  if (focusMetricKey) params.set('focus', focusMetricKey);
  const query = params.toString();
  return (query ? `/en/sources?${query}` : '/en/sources') as Route;
}

function sourceFocusHref(metricKey: string, activeFilter: SourceFilter): Route {
  const params = new URLSearchParams();
  if (activeFilter !== 'all') params.set('filter', activeFilter);
  params.set('focus', metricKey);
  return `/en/sources?${params.toString()}` as Route;
}

function clearFocusHref(activeFilter: SourceFilter): Route {
  return (activeFilter === 'all' ? '/en/sources' : `/en/sources?filter=${activeFilter}`) as Route;
}

export default async function EnglishSourcesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const focusRaw = resolvedParams?.focus;
  const filterRaw = resolvedParams?.filter;
  const focusMetricKey = Array.isArray(focusRaw) ? focusRaw[0] : focusRaw;
  const activeFilter = normalizeSourceFilter(Array.isArray(filterRaw) ? filterRaw[0] : filterRaw);
  const readModel = await getSourcesReadModel();
  const visibleRows = readModel.rows.filter((row) => rowMatchesSourceFilter(row, activeFilter));
  const reviewRows = readModel.rows.filter((row) => rowMatchesSourceFilter(row, 'review'));
  const actionRows = reviewRows.filter((row) => row.reviewAction.priority !== 'normal').slice(0, 4);
  const asOf = readModel.isFallback ? null : readModel.generatedAt;
  const needsReview = reviewRows.length;
  const reviewTone = needsReview > 0
    ? readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
      ? 'text-danger'
      : 'text-warning'
    : 'text-success';
  const trustTone = readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
    ? 'text-danger'
    : readModel.summary.proxyCount > 0
      ? 'text-warning'
      : 'text-success';
  const trustPosture = readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
    ? 'Review degradation'
    : readModel.summary.proxyCount > 0
      ? 'Proxy sources present'
      : 'Live sources ready';

  return (
    <PageTemplate
      locale="en"
      eyebrow="Source review"
      title="Source Review"
      question="Which market inputs are not ready to use directly in a decision right now?"
      asOf={asOf}
    >
      <SignalRow label="Source trust signals">
        <MetricCard
          label="Needs review"
          value={`${needsReview}`}
          valueClassName={`${reviewTone} tabular-nums`}
          hint={needsReview > 0 ? `${readModel.summary.fallbackCount} fallback, ${readModel.summary.degradedCount} degraded, proxy, or volatility-marked rows.` : 'No source row currently needs additional review.'}
        />
        <MetricCard
          label="Trust posture"
          value={trustPosture}
          valueClassName={trustTone}
          hint={readModel.summary.trustLabel}
        />
        <MetricCard
          label="Average confidence"
          value={`${Math.round(readModel.summary.averageConfidence * 100)}%`}
          valueClassName={`${trustTone} tabular-nums`}
          hint={`Coverage ${Math.round(readModel.completeness.value ?? 0)}% · ${readModel.summary.freshnessLabel}`}
        />
        <MetricCard
          label="Input mix"
          value={`${readModel.summary.liveCount} live`}
          valueClassName="tabular-nums"
          hint={`Proxy ${readModel.summary.proxyCount} · fallback ${readModel.summary.fallbackCount} · degraded ${readModel.summary.degradedCount}`}
        />
      </SignalRow>

      <Panel
        locale="en"
        title="Recovery actions"
        why="Turning degraded rows into an operator checklist keeps a data-quality problem from ending as a passive status label."
      >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
              Needs review {reviewRows.length}
            </span>
            <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
              Priority rows {actionRows.length}
            </span>
            <Link
              href={'/admin' as Route}
              className="rounded-xl border border-accent bg-accent-soft px-3 py-1.5 font-semibold text-accent hover:bg-accent-hover"
            >
              Open Admin refresh
            </Link>
            <Link
              href={'/en/sources?filter=review' as Route}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 font-semibold text-muted hover:border-accent hover:bg-accent-soft"
            >
              Show review rows
            </Link>
          </div>
          {actionRows.length ? (
            <ol className="mt-4 divide-y divide-line border-y border-line">
              {actionRows.map((row) => {
                const action = reviewAction(row);
                return (
                  <li key={row.metricKey} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(10rem,14rem)_1fr_auto] md:items-start">
                    <div>
                      <p className="font-semibold text-ink">{surfaceLabel(row.metricKey)}</p>
                      <p className="mt-1 text-xs text-subtle">
                        {sourceLabel(row.source)} · {statusLabel(row.status)}
                      </p>
                    </div>
                    <div>
                      <span className={`inline-flex rounded-xl border px-2.5 py-1 text-xs font-semibold ${actionToneClass(row.reviewAction.priority)}`}>
                        {action.label}
                      </span>
                      <p className="mt-2 leading-6 text-muted">{action.detail}</p>
                    </div>
                    <Link
                      href={action.href}
                      className="rounded-xl border border-line bg-surface px-3 py-1.5 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                    >
                      Open action
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-4 border-y border-line py-3 text-sm leading-6 text-muted">
              No fallback or degraded row is currently critical. Proxy rows still deserve manual review before major pricing, purchasing, or disclosure decisions.
            </p>
          )}
      </Panel>

      <Panel
        locale="en"
        title="Market input matrix"
        why="Each row connects source, time, lag, value, and action so market inputs remain reviewable before use."
      >
          <p className="mb-3 text-xs text-muted">
             {asOf ? `Generated at ${new Date(asOf).toLocaleString('en-US')}` : 'Generation time is not a data timestamp'}
            {readModel.isFallback ? ' | showing fallback estimates because live coverage is unavailable' : ''}
          </p>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {SOURCE_FILTERS.map((filter) => {
              const count = readModel.rows.filter((row) => rowMatchesSourceFilter(row, filter.key)).length;
              const isActive = activeFilter === filter.key;
              return (
                <Link
                  key={filter.key}
                  href={sourceFilterHref(filter.key, focusMetricKey)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    isActive
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:bg-surface-muted'
                  }`}
                  title={filter.hint}
                >
                  {filter.label} <span className="ml-1 text-subtle">{count}</span>
                </Link>
              );
            })}
            <span className="text-xs text-subtle">
              Showing {visibleRows.length} / {readModel.rows.length}
            </span>
          </div>
          {focusMetricKey ? (
            <p className="mb-3 text-xs text-accent">
              Focused from another surface: <code>{focusMetricKey}</code>{' '}
              <Link href={clearFocusHref(activeFilter)} className="underline text-accent">
                Clear
              </Link>
            </p>
          ) : null}
          <div className="overflow-x-auto">
             <table className="min-w-full text-left text-sm tabular-nums text-muted">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="py-3 pr-4">Metric</th>
                  <th className="py-3 pr-4">Source</th>
                  <th className="py-3 pr-4">Trust</th>
                  <th className="py-3 pr-4">Scope</th>
                  <th className="py-3 pr-4">Confidence</th>
                  <th className="py-3 pr-4">Lag</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Value</th>
                  <th className="py-3 pr-4">1d</th>
                  <th className="py-3 pr-4">7d</th>
                  <th className="py-3 pr-4">30d</th>
                  <th className="py-3 pr-4">Volatility</th>
                  <th className="py-3 pr-4">Trend</th>
                  <th className="py-3 pr-4">Action</th>
                  <th className="py-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const action = reviewAction(row);
                  const sparkline = sparklineDataUrl(row.sparkline);
                  return (
                    <tr
                      key={row.surface}
                      id={`metric-${row.metricKey}`}
                      className={`border-b border-line ${
                        focusMetricKey === row.metricKey
                          ? 'ring-1 ring-accent/60 bg-accent-soft'
                          : row.alertLevel === 'alert'
                            ? 'bg-danger-soft'
                            : row.alertLevel === 'watch'
                              ? 'bg-warning-soft'
                              : ''
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium text-ink">{surfaceLabel(row.metricKey)}</td>
                      <td className="py-3 pr-4">{sourceLabel(row.source)}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.18em] ${trustClass(row.trustState)}`}>
                          {trustLabel(row.trustState)}
                        </span>
                        <span className="mt-1 block text-xs text-subtle">{sourceTypeLabel(row)}</span>
                      </td>
                      <td className="py-3 pr-4">{row.scope}</td>
                      <td className="py-3 pr-4">{row.confidence}</td>
                      <td className="py-3 pr-4">{row.lag}</td>
                      <td className="py-3 pr-4">{statusLabel(row.status)}</td>
                      <td className="py-3 pr-4">{noDataLabel(row.value)}</td>
                      <td className="py-3 pr-4">{noDataLabel(row.change1d)}</td>
                      <td className="py-3 pr-4">{noDataLabel(row.change7d)}</td>
                      <td className="py-3 pr-4">{noDataLabel(row.change30d)}</td>
                      <td className={`py-3 pr-4 font-medium ${alertColor(row.alertLevel)}`}>
                        {alertLabel(row.alertLevel)}
                      </td>
                      <td className="py-3 pr-4">
                        {sparkline ? (
                          <img
                            src={sparkline}
                            alt={`${surfaceLabel(row.metricKey)} trend`}
                            width={120}
                            height={28}
                          />
                        ) : (
                          <span className="text-subtle">n/a</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex min-w-24 flex-col gap-2">
                          <Link
                            href={sourceFocusHref(row.metricKey, activeFilter)}
                            className="rounded-xl border border-line bg-surface px-2.5 py-1 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                          >
                            Focus
                          </Link>
                          <Link
                            href={action.href}
                            className="rounded-xl border border-line bg-surface px-2.5 py-1 text-center text-xs font-semibold text-muted hover:border-accent hover:bg-accent-soft"
                          >
                            {row.reviewAction.priority === 'normal' ? 'Record' : 'Handle'}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="block text-muted">{reasonFor(row)}</span>
                        <span className="mt-2 block text-xs font-semibold text-muted">{action.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-subtle">{action.detail}</span>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-6 text-center text-sm text-subtle">
                      No source rows match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
      </Panel>

      <SourceFooter
        locale="en"
        sources={[
          {
            id: 'sources-read-model',
            label: readModel.isFallback
              ? `Source read model unavailable; fallback estimates are in use (${readModel.error ?? 'unknown reason'})`
              : 'Source read model (coverage, confidence, lag, fallback, and review state)',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          }
        ]}
        methodHref="/en/sources"
        methodLabel="Source coverage and review method"
        limitations={[
          'Source status describes input quality; it does not prove that each value applies to every airport, contract, or trade.',
          'Proxy, derived, fallback, and degraded rows require human review before material pricing, purchasing, or disclosure decisions.',
          'A fallback generation time is not an observation time, so it is not shown as the data timestamp.'
        ]}
      />
    </PageTemplate>
  );
}
