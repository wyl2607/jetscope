import { InfoCard } from '@/components/cards';
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

  return (
    <Shell
      eyebrow="Source catalog"
      title="Source and provenance view"
      description="该页已接通 FastAPI market snapshot 来源状态。显示每个关键来源的状态、数值与错误信息。"
    >
      <FocusScroll focusMetricKey={focusMetricKey} />
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
                <th className="py-3 pr-4">Confidence</th>
                <th className="py-3 pr-4">Lag</th>
                <th className="py-3 pr-4">Status</th>
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
