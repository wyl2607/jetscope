import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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
  if (state === 'live') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (state === 'proxy') return 'border-sky-200 bg-sky-50 text-sky-800';
  if (state === 'fallback') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rose-200 bg-rose-50 text-rose-700';
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
  if (level === 'alert') return 'text-rose-700';
  if (level === 'watch') return 'text-amber-700';
  return 'text-emerald-700';
}

function actionToneClass(priority: SourceRow['reviewAction']['priority']): string {
  if (priority === 'critical') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (priority === 'review') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
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

  return (
    <Shell
      locale="en"
      eyebrow="Source review"
      title="Source Review"
      description="Check whether each market input is live, proxy-backed, or fallback before using JetScope outputs in a decision."
    >
      <section className="grid gap-4 md:grid-cols-4">
        <InfoCard title="Live" subtitle="Primary or official">
          <p className="text-3xl font-semibold text-emerald-700">{readModel.summary.liveCount}</p>
        </InfoCard>
        <InfoCard title="Proxy" subtitle="Derived assumptions">
          <p className="text-3xl font-semibold text-sky-700">{readModel.summary.proxyCount}</p>
        </InfoCard>
        <InfoCard title="Fallback" subtitle="Needs recovery">
          <p className="text-3xl font-semibold text-amber-700">{readModel.summary.fallbackCount}</p>
        </InfoCard>
        <InfoCard title="Confidence" subtitle="Average source confidence">
          <p className="text-3xl font-semibold text-slate-950">{Math.round(readModel.summary.averageConfidence * 100)}%</p>
        </InfoCard>
      </section>

      <section className="mt-6">
        <InfoCard
          title="Recovery actions"
          subtitle={actionRows.length ? 'Turn degraded rows into an operator checklist' : 'No critical source recovery is required'}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
              Needs review {reviewRows.length}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
              Priority rows {actionRows.length}
            </span>
            <Link
              href={'/admin' as Route}
              className="rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 font-semibold text-sky-800 hover:bg-sky-100"
            >
              Open Admin refresh
            </Link>
            <Link
              href={'/en/sources?filter=review' as Route}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50"
            >
              Show review rows
            </Link>
          </div>
          {actionRows.length ? (
            <ol className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {actionRows.map((row) => {
                const action = reviewAction(row);
                return (
                  <li key={row.metricKey} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(10rem,14rem)_1fr_auto] md:items-start">
                    <div>
                      <p className="font-semibold text-slate-950">{surfaceLabel(row.metricKey)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {sourceLabel(row.source)} · {statusLabel(row.status)}
                      </p>
                    </div>
                    <div>
                      <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-semibold ${actionToneClass(row.reviewAction.priority)}`}>
                        {action.label}
                      </span>
                      <p className="mt-2 leading-6 text-slate-700">{action.detail}</p>
                    </div>
                    <Link
                      href={action.href}
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-center text-xs font-semibold text-sky-800 hover:border-sky-300 hover:bg-sky-50"
                    >
                      Open action
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-4 border-y border-slate-200 py-3 text-sm leading-6 text-slate-700">
              No fallback or degraded row is currently critical. Proxy rows still deserve manual review before major pricing, purchasing, or disclosure decisions.
            </p>
          )}
        </InfoCard>
      </section>

      <section className="mt-6">
        <InfoCard title="Market input matrix" subtitle={`Overall status: ${readModel.overallStatus}`}>
          <p className="mb-3 text-xs text-slate-600">
            Generated at {new Date(readModel.generatedAt).toLocaleString('en-US')}
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
                  className={`rounded-md border px-3 py-2 text-xs font-semibold transition ${
                    isActive
                      ? 'border-sky-500 bg-sky-50 text-sky-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
                  }`}
                  title={filter.hint}
                >
                  {filter.label} <span className="ml-1 text-slate-500">{count}</span>
                </Link>
              );
            })}
            <span className="text-xs text-slate-500">
              Showing {visibleRows.length} / {readModel.rows.length}
            </span>
          </div>
          {focusMetricKey ? (
            <p className="mb-3 text-xs text-sky-700">
              Focused from another surface: <code>{focusMetricKey}</code>{' '}
              <Link href={clearFocusHref(activeFilter)} className="underline text-sky-800">
                Clear
              </Link>
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
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
                      className={`border-b border-slate-200 ${
                        focusMetricKey === row.metricKey
                          ? 'ring-1 ring-sky-400/60 bg-sky-50'
                          : row.alertLevel === 'alert'
                            ? 'bg-rose-50'
                            : row.alertLevel === 'watch'
                              ? 'bg-amber-50'
                              : ''
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium text-slate-950">{surfaceLabel(row.metricKey)}</td>
                      <td className="py-3 pr-4">{sourceLabel(row.source)}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.12em] ${trustClass(row.trustState)}`}>
                          {trustLabel(row.trustState)}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">{sourceTypeLabel(row)}</span>
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
                          <span className="text-slate-500">n/a</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex min-w-24 flex-col gap-2">
                          <Link
                            href={sourceFocusHref(row.metricKey, activeFilter)}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-center text-xs font-semibold text-sky-800 hover:border-sky-300 hover:bg-sky-50"
                          >
                            Focus
                          </Link>
                          <Link
                            href={action.href}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-center text-xs font-semibold text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                          >
                            {row.reviewAction.priority === 'normal' ? 'Record' : 'Handle'}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="block text-slate-700">{reasonFor(row)}</span>
                        <span className="mt-2 block text-xs font-semibold text-slate-600">{action.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{action.detail}</span>
                      </td>
                    </tr>
                  );
                })}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="py-6 text-center text-sm text-slate-500">
                      No source rows match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </InfoCard>
      </section>
    </Shell>
  );
}
