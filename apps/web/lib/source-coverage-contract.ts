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
};

export type SourceCoverageResponse = {
  generated_at: string;
  metrics: SourceCoverageMetric[];
  completeness?: number;
  degraded?: boolean;
};
