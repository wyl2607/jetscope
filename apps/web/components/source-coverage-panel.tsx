import { InfoCard } from '@/components/cards';

import type { SourceCoverageMetric } from '@/lib/source-coverage-contract';

type Props = {
  metrics: SourceCoverageMetric[];
  completeness?: number;
  degraded?: boolean;
  title?: string;
  subtitle?: string;
};

function formatLag(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  const minutes = Number(value);
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export function SourceCoveragePanel({
  metrics,
  completeness = 1.0,
  degraded = false,
  title = 'Source coverage',
  subtitle = 'Live metric provenance and source trust'
}: Props) {
  const liveCount = metrics.filter((m) => m.status !== 'seed').length;
  const seedCount = metrics.filter((m) => m.status === 'seed').length;
  const fallbackCount = metrics.filter((m) => m.fallback_used).length;

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
        {metrics.length === 0 && (
          <span className="text-slate-400">No source coverage data available.</span>
        )}
      </div>
    </InfoCard>
  );
}
