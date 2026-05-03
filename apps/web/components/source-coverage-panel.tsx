import { InfoCard } from '@/components/cards';

import {
  formatSourceCoverageLag,
  getSourceCoverageTrustState,
  type SourceCoverageMetric
} from '@/lib/source-coverage-contract';

type Props = {
  metrics: SourceCoverageMetric[];
  completeness?: number;
  degraded?: boolean;
  title?: string;
  subtitle?: string;
};

export function SourceCoveragePanel({
  metrics,
  completeness = 1.0,
  degraded = false,
  title = 'Source coverage',
  subtitle = 'Live metric provenance and source trust'
}: Props) {
  const liveCount = metrics.filter((m) => getSourceCoverageTrustState(m) === 'live').length;
  const seedCount = metrics.filter((m) => m.status === 'seed').length;
  const fallbackCount = metrics.filter((m) => getSourceCoverageTrustState(m) === 'fallback').length;
  const proxyCount = metrics.filter((m) => getSourceCoverageTrustState(m) === 'proxy').length;
  const degradedCount = metrics.filter((m) => getSourceCoverageTrustState(m) === 'degraded').length;

  return (
    <InfoCard title={title} subtitle={subtitle}>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span
          className={`rounded-full border px-3 py-1 font-medium ${
            degraded
              ? 'border-amber-700/40 bg-amber-950/40 text-amber-300'
              : 'border-emerald-700/40 bg-emerald-950/40 text-emerald-300'
          }`}
        >
          {degraded ? 'degraded' : 'healthy'}
        </span>
        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
          completeness {Math.round(completeness * 100)}%
        </span>
        <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
          {liveCount} live
        </span>
        {proxyCount > 0 && (
          <span className="rounded-full border border-sky-700/50 bg-sky-950/30 px-3 py-1 text-sky-300">
            {proxyCount} proxy
          </span>
        )}
        {seedCount > 0 && (
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
            {seedCount} seed
          </span>
        )}
        {fallbackCount > 0 && (
          <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
            {fallbackCount} fallback
          </span>
        )}
        {degradedCount > 0 && (
          <span className="rounded-full border border-amber-700/50 bg-amber-950/30 px-3 py-1 text-amber-300">
            {degradedCount} degraded
          </span>
        )}
        {metrics.length === 0 && (
          <span className="text-slate-400">No source coverage data available.</span>
        )}
      </div>
      {metrics.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.slice(0, 4).map((metric) => (
            <div key={metric.metric_key} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white">{metric.metric_key}</span>
                <span className="rounded-full border border-slate-700 px-2 py-0.5 text-slate-300">{getSourceCoverageTrustState(metric)}</span>
              </div>
              <p className="mt-2 text-slate-400">{metric.source_name} · {metric.source_type.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-slate-500">confidence {Math.round(metric.confidence_score * 100)}% · lag {formatSourceCoverageLag(metric.lag_minutes)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </InfoCard>
  );
}
