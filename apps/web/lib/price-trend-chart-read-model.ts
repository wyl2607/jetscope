import {
  fetchJson,
  finiteChangeOrNull,
  type MarketHistory
} from '@/lib/product-read-model';

export type PriceTrendChartData = {
  metric_key: string;
  unit: string;
  latest_value: number | null;
  latest_as_of: string | null;
  change_pct_1d: number | null;
  change_pct_7d: number | null;
  change_pct_30d: number | null;
  quality?: string | null;
  points: Array<{ as_of: string; value: number; quality?: string | null; source?: string | null }>;
};

export type PriceTrendChartReadModel = {
  metrics: Record<string, PriceTrendChartData>;
  generatedAt: string | null;
  isFallback: boolean;
  error: string | null;
};

export function buildPriceTrendChartReadModelFromHistory(history: MarketHistory): PriceTrendChartReadModel {
  if (!history?.metrics) {
    throw new Error('No metrics in history response');
  }

  const metrics: Record<string, PriceTrendChartData> = {};

  for (const [key, metric] of Object.entries(history.metrics)) {
    metrics[key] = {
      metric_key: key,
      unit: metric.unit,
      latest_value: finiteChangeOrNull(metric.latest_value),
      latest_as_of: metric.latest_as_of ?? null,
      change_pct_1d: finiteChangeOrNull(metric.change_pct_1d),
      change_pct_7d: finiteChangeOrNull(metric.change_pct_7d),
      change_pct_30d: finiteChangeOrNull(metric.change_pct_30d),
      quality: metric.quality ?? null,
      points: metric.points ?? []
    };
  }

  const generatedAt =
    Object.values(metrics).reduce<{ at: number; iso: string } | null>((latest, metric) => {
      if (!metric.latest_as_of) return latest;
      const at = new Date(metric.latest_as_of).getTime();
      if (Number.isNaN(at)) return latest;
      return latest == null || at > latest.at ? { at, iso: metric.latest_as_of } : latest;
    }, null)?.iso ?? null;

  return {
    metrics,
    generatedAt,
    isFallback: false,
    error: null
  };
}

export async function getPriceTrendChartReadModel(): Promise<PriceTrendChartReadModel> {
  try {
    const history = await fetchJson<MarketHistory>('/market/history');
    return buildPriceTrendChartReadModelFromHistory(history);
  } catch (error) {
    return {
      metrics: {},
      generatedAt: null,
      isFallback: true,
      error: error instanceof Error ? error.message : 'Failed to load price trends'
    };
  }
}
