export type SourceCoverageMetric = {
  metric_key: string;
  source_name: string;
  source_type: string;
  confidence_score: number;
  lag_minutes?: number | null;
  fallback_used: boolean;
  status: string;
  region: string;
  market_scope: string;
  error?: string | null;
  note?: string | null;
  cbam_eur?: number | null;
  usd_per_eur?: number | null;
};

export type SourceCoverageTrustState = 'live' | 'proxy' | 'fallback' | 'degraded';

export function getSourceCoverageTrustState(metric: SourceCoverageMetric): SourceCoverageTrustState {
  if (metric.fallback_used || metric.status === 'seed') return 'fallback';
  if (metric.status !== 'ok') return 'degraded';
  if (metric.source_type.includes('proxy') || metric.source_type === 'derived') return 'proxy';
  return 'live';
}

export function formatSourceCoverageLag(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  const minutes = Number(value);
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export type SourceCoverageResponse = {
  generated_at: string;
  metrics: SourceCoverageMetric[];
  completeness?: number;
  degraded?: boolean;
};
