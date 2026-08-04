import { InfoCard } from '@/components/cards';
import { SourceCoveragePanel } from '@/components/source-coverage-panel';
import { Shell } from '@/components/shell';
import { getSourcesReadModel } from '@/lib/sources-read-model';
import { buildApiUrl } from '@/lib/api-config';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { FocusScroll } from './focus-scroll';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Sources — Trust Center',
  description:
    'JetScope source trust center: as-of, lag, status, fallback, confidence and market refresh health for every core metric.',
  path: '/sources'
});

type MarketHealth = {
  healthy: boolean;
  refresh_interval_seconds: number;
  latest_refreshed_at: string | null;
  latest_status: string | null;
  age_seconds: number | null;
  next_refresh_eta_seconds: number | null;
  runs_total: number;
  runs_ok: number;
  success_rate: number | null;
  note: string;
  recent_runs: Array<{
    refreshed_at: string;
    source_status: string;
    ingest: string;
    ok: boolean;
  }>;
};

async function getMarketHealth(): Promise<MarketHealth | null> {
  try {
    const response = await fetch(buildApiUrl('/market/health?runs_window=10'), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as MarketHealth;
  } catch {
    return null;
  }
}

function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'n/a';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function formatAge(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'n/a';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export default async function SourcesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const focusRaw = resolvedParams?.focus;
  const focusMetricKey = Array.isArray(focusRaw) ? focusRaw[0] : focusRaw;
  const [readModel, health] = await Promise.all([getSourcesReadModel(), getMarketHealth()]);

  const alertLabel = (level: 'normal' | 'watch' | 'alert') => {
    if (level === 'alert') return 'alert';
    if (level === 'watch') return 'watch';
    return 'normal';
  };

  const alertColor = (level: 'normal' | 'watch' | 'alert') => {
    if (level === 'alert') return 'text-rose-300';
    if (level === 'watch') return 'text-amber-300';
    return 'text-emerald-300';
  };

  const sparklineDataUrl = (encoded: string) => {
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
  };

  const trust = readModel.trustSummary;

  return (
    <Shell
      eyebrow="Trust Center"
      title="Sources & provenance"
      description="Every core market metric with as-of time, lag, status, fallback flag and confidence. Public/proxy feeds only — seed and fallback are always labeled."
    >
      <FocusScroll focusMetricKey={focusMetricKey} />

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <InfoCard title="Trust legend" subtitle="How to read this page">
          <ul className="space-y-2 text-sm leading-6 text-slate-300">
            <li>
              <span className="font-medium text-emerald-300">status=ok</span> — live/public fetch succeeded for this
              cycle
            </li>
            <li>
              <span className="font-medium text-amber-300">fallback=yes</span> — used secondary path or seed; not pure
              primary quote
            </li>
            <li>
              <span className="font-medium text-slate-200">lag</span> — typical publication delay of the source class
            </li>
            <li>
              <span className="font-medium text-slate-200">as_of</span> — history latest point or snapshot time (never
              invented)
            </li>
            <li>
              Reserve / supply-gap are <strong>not</strong> IATA live feeds — see reserves API source_name.
            </li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Trust counts: live_ok={trust.liveOk} · fallback={trust.fallbackUsed} · seed={trust.seed} · unknown=
            {trust.unknown}
          </p>
        </InfoCard>

        <InfoCard
          title="Market refresh health"
          subtitle={health ? (health.healthy ? 'loop usable' : 'attention needed') : 'health API unavailable'}
        >
          {health ? (
            <div className="space-y-2 text-sm text-slate-300">
              <p>
                Interval <strong className="text-white">{health.refresh_interval_seconds}s</strong> · age{' '}
                <strong className="text-white">{formatAge(health.age_seconds)}</strong> · next ETA{' '}
                <strong className="text-white">{formatEta(health.next_refresh_eta_seconds)}</strong>
              </p>
              <p>
                Latest status <code className="text-sky-300">{health.latest_status ?? 'n/a'}</code> · runs{' '}
                {health.runs_ok}/{health.runs_total}
                {health.success_rate != null ? ` · success ${(health.success_rate * 100).toFixed(0)}%` : ''}
              </p>
              <p className="text-xs text-slate-400">{health.note}</p>
              {health.recent_runs?.length > 0 && (
                <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-slate-400">
                  {health.recent_runs.slice(0, 6).map((run, idx) => (
                    <li key={`${run.refreshed_at}-${idx}`}>
                      {new Date(run.refreshed_at).toLocaleString()} · {run.source_status} · {run.ingest} ·{' '}
                      {run.ok ? 'ok' : 'fail'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">Could not load /v1/market/health. Start API and ensure refresh runs exist.</p>
          )}
        </InfoCard>
      </section>

      <div className="mb-6">
        <SourceCoveragePanel
          metrics={readModel.coverageMetrics}
          completeness={readModel.completeness}
          degraded={readModel.degraded}
          title="API source coverage"
          subtitle={`${readModel.coverageMetrics.length} canonical metrics · last updated ${new Date(readModel.generatedAt).toLocaleString()}`}
        />
      </div>

      <InfoCard title="Live source matrix" subtitle={`overall=${readModel.overallStatus}`}>
        <p className="mb-3 text-xs text-slate-400">
          generated_at: {new Date(readModel.generatedAt).toLocaleString()}
          {readModel.isFallback && readModel.error ? ` | fallback due to ${readModel.error}` : ''}
        </p>
        {focusMetricKey ? (
          <p className="mb-3 text-xs text-sky-300">
            Focused from dashboard risk signal: <code>{focusMetricKey}</code>{' '}
            <Link href="/sources" className="underline text-sky-200">
              clear
            </Link>
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-3 pr-4">Surface</th>
                <th className="py-3 pr-4">Source</th>
                <th className="py-3 pr-4">Scope</th>
                <th className="py-3 pr-4">As of</th>
                <th className="py-3 pr-4">Confidence</th>
                <th className="py-3 pr-4">Lag</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Fallback</th>
                <th className="py-3 pr-4">Value</th>
                <th className="py-3 pr-4">1d</th>
                <th className="py-3 pr-4">7d</th>
                <th className="py-3 pr-4">30d</th>
                <th className="py-3 pr-4">Volatility</th>
                <th className="py-3 pr-4">Trend</th>
                <th className="py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {readModel.rows.map((row) => (
                <tr
                  key={row.surface}
                  id={`metric-${row.metricKey}`}
                  className={`border-b border-slate-900 ${
                    focusMetricKey === row.metricKey
                      ? 'ring-1 ring-sky-400/60 bg-sky-950/30'
                      : row.alertLevel === 'alert'
                        ? 'bg-rose-950/25'
                        : row.alertLevel === 'watch'
                          ? 'bg-amber-950/20'
                          : ''
                  }`}
                >
                  <td className="py-3 pr-4 font-medium text-white">{row.surface}</td>
                  <td className="py-3 pr-4">{row.source}</td>
                  <td className="py-3 pr-4">{row.scope}</td>
                  <td className="py-3 pr-4 text-xs text-slate-400">{row.asOf}</td>
                  <td className="py-3 pr-4">{row.confidence}</td>
                  <td className="py-3 pr-4">{row.lag}</td>
                  <td className="py-3 pr-4">{row.status}</td>
                  <td
                    className={`py-3 pr-4 font-medium ${
                      row.fallback === 'yes' ? 'text-amber-300' : 'text-emerald-300'
                    }`}
                  >
                    {row.fallback}
                  </td>
                  <td className="py-3 pr-4">{row.value}</td>
                  <td className="py-3 pr-4">{row.change1d}</td>
                  <td className="py-3 pr-4">{row.change7d}</td>
                  <td className="py-3 pr-4">{row.change30d}</td>
                  <td className={`py-3 pr-4 font-medium ${alertColor(row.alertLevel)}`}>
                    {alertLabel(row.alertLevel)}
                  </td>
                  <td className="py-3 pr-4">
                    {sparklineDataUrl(row.sparkline) ? (
                      <img
                        src={sparklineDataUrl(row.sparkline) ?? ''}
                        alt={`${row.surface} trend`}
                        width={120}
                        height={28}
                      />
                    ) : (
                      <span className="text-slate-500">n/a</span>
                    )}
                  </td>
                  <td className="py-3">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InfoCard>
    </Shell>
  );
}
