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
              ? 'border-warning bg-warning-soft text-warning'
              : 'border-success bg-success-soft text-success'
          }`}
        >
          {degraded ? '已降级' : '健康'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface px-3 py-1 text-ink">
          完整度{' '}
          <FigureValue figure={completenessFigure} locale="zh" size="inline" showTimestamp={false} />
        </span>
        <span className="rounded-full border border-line-strong bg-surface px-3 py-1 text-ink">
          实时 {liveCount}
        </span>
        {proxyCount > 0 && (
          <span className="rounded-full border border-accent bg-accent-soft px-3 py-1 text-accent">
            代理 {proxyCount}
          </span>
        )}
        {seedCount > 0 && (
          <span className="rounded-full border border-line-strong bg-surface px-3 py-1 text-ink">
            种子 {seedCount}
          </span>
        )}
        {fallbackCount > 0 && (
          <span className="rounded-full border border-line-strong bg-surface px-3 py-1 text-ink">
            回退 {fallbackCount}
          </span>
        )}
        {degradedCount > 0 && (
          <span className="rounded-full border border-warning bg-warning-soft px-3 py-1 text-warning">
            降级 {degradedCount}
          </span>
        )}
        {metrics.length === 0 && (
          <span className="text-muted">暂无来源覆盖数据。</span>
        )}
      </div>
      {metrics.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.slice(0, 4).map((metric) => (
            <div key={metric.metric_key} className="rounded-xl border border-line bg-surface/90 p-3 text-xs text-ink">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">{metric.metric_key}</span>
                <span className="rounded-full border border-line-strong px-2 py-0.5 text-ink">{getSourceCoverageTrustState(metric)}</span>
              </div>
              <p className="mt-2 text-muted">{metric.source_name} · {metric.source_type.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-muted">置信度 {Math.round(metric.confidence_score * 100)}% · 滞后 {formatSourceCoverageLag(metric.lag_minutes)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
