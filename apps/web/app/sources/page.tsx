import { InfoCard } from '@/components/cards';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { SourceCoveragePanel } from '@/components/source-coverage-panel';
import { Shell } from '@/components/shell';
import { getSourcesReadModel } from '@/lib/sources-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { FocusScroll } from './focus-scroll';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Sources',
  description:
    'Inspect JetScope source provenance with confidence, lag, fallback status, and live market source health details.',
  path: '/sources'
});

export default async function SourcesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const focusRaw = resolvedParams?.focus;
  const focusMetricKey = Array.isArray(focusRaw) ? focusRaw[0] : focusRaw;
  const readModel = await getSourcesReadModel();

  const alertLabel = (level: "normal" | "watch" | "alert") => {
    if (level === "alert") return "alert";
    if (level === "watch") return "watch";
    return "normal";
  };

  const alertColor = (level: "normal" | "watch" | "alert") => {
    if (level === "alert") return "text-rose-300";
    if (level === "watch") return "text-amber-300";
    return "text-emerald-300";
  };

  const sparklineDataUrl = (encoded: string) => {
    if (!encoded) return null;
    const values = encoded
      .split(",")
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
      .join(" ");
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'>` +
      `<polyline fill='none' stroke='rgb(56 189 248)' stroke-width='2' points='${points}'/>` +
      `</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const trustClass = (state: string) => {
    if (state === 'live') return 'border-emerald-600/40 bg-emerald-500/10 text-emerald-200';
    if (state === 'proxy') return 'border-sky-600/40 bg-sky-500/10 text-sky-200';
    if (state === 'fallback') return 'border-amber-600/40 bg-amber-500/10 text-amber-200';
    return 'border-rose-600/40 bg-rose-500/10 text-rose-200';
  };

  return (
    <Shell
      eyebrow="Source catalog"
      title="Source and provenance view"
      description="该页已接通 FastAPI market snapshot 来源状态。显示每个关键来源的状态、数值与错误信息。"
    >
      <FocusScroll focusMetricKey={focusMetricKey} />
      <div className="mb-6">
        <ProvenanceSummary
          summary={readModel.summary}
          completeness={readModel.completeness}
          generatedAt={readModel.generatedAt}
        />
      </div>
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
                <th className="py-3">Why trust / why degraded</th>
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
                  <td className="py-3 pr-4">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.12em] ${trustClass(row.trustState)}`}>
                      {row.trustState}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">{row.sourceType}</span>
                  </td>
                  <td className="py-3 pr-4">{row.scope}</td>
                  <td className="py-3 pr-4">{row.confidence}</td>
                  <td className="py-3 pr-4">{row.lag}</td>
                  <td className="py-3 pr-4">{row.status}</td>
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
                        src={sparklineDataUrl(row.sparkline) ?? ""}
                        alt={`${row.surface} trend`}
                        width={120}
                        height={28}
                      />
                    ) : (
                      <span className="text-slate-500">n/a</span>
                    )}
                  </td>
                  <td className="py-3">
                    <span className="block text-slate-300">{row.degradedReason}</span>
                    {row.note !== row.degradedReason ? <span className="mt-1 block text-xs text-slate-500">{row.note}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </InfoCard>
    </Shell>
  );
}
