import {
  formatSourceCoverageLag,
  getSourceCoverageTrustState,
  type SourceCoverageMetric
} from '@/lib/source-coverage-contract';
import { FigureValue } from '@/components/figure-value';
import { missing, type Figure } from '@/lib/figure';

type Props = {
  metrics: SourceCoverageMetric[];
  /** Absent means unknown — never silently 100%. */
  completeness?: Figure;
  degraded?: boolean;
};

const UNKNOWN_COMPLETENESS = missing({
  unit: '%',
  sourceId: 'source-coverage',
  reason: '完整度未提供',
  basis: 'observed'
});

export function SourceCoveragePanel({
  metrics,
  completeness,
  degraded = false
}: Props) {
  const completenessFigure = completeness ?? UNKNOWN_COMPLETENESS;
  const liveCount = metrics.filter((m) => getSourceCoverageTrustState(m) === 'live').length;
  const seedCount = metrics.filter((m) => m.status === 'seed').length;
  const fallbackCount = metrics.filter((m) => getSourceCoverageTrustState(m) === 'fallback').length;
  const proxyCount = metrics.filter((m) => getSourceCoverageTrustState(m) === 'proxy').length;
  const degradedCount = metrics.filter((m) => getSourceCoverageTrustState(m) === 'degraded').length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span
          className={`rounded-full border px-3 py-1 font-medium ${
            degraded
              ? 'border-amber-200 bg-amber-50 text-amber-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
        >
          {degraded ? '已降级' : '健康'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700">
          完整度{' '}
          <FigureValue figure={completenessFigure} locale="zh" size="inline" showTimestamp={false} />
        </span>
        <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700">
          实时 {liveCount}
        </span>
        {proxyCount > 0 && (
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">
            代理 {proxyCount}
          </span>
        )}
        {seedCount > 0 && (
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700">
            种子 {seedCount}
          </span>
        )}
        {fallbackCount > 0 && (
          <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700">
            回退 {fallbackCount}
          </span>
        )}
        {degradedCount > 0 && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
            降级 {degradedCount}
          </span>
        )}
        {metrics.length === 0 && (
          <span className="text-slate-600">暂无来源覆盖数据。</span>
        )}
      </div>
      {metrics.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.slice(0, 4).map((metric) => (
            <div key={metric.metric_key} className="rounded-xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-950">{metric.metric_key}</span>
                <span className="rounded-full border border-slate-300 px-2 py-0.5 text-slate-700">{getSourceCoverageTrustState(metric)}</span>
              </div>
              <p className="mt-2 text-slate-600">{metric.source_name} · {metric.source_type.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-slate-500">置信度 {Math.round(metric.confidence_score * 100)}% · 滞后 {formatSourceCoverageLag(metric.lag_minutes)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
