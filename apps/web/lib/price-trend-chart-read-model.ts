import {
  fetchJson,
  finiteChangeOrNull,
  type MarketHistory
} from '@/lib/product-read-model';

export type PriceTrendChartData = {
  metric_key: string;
  unit: string;
  latest_value: number;
  latest_as_of: string;
  change_pct_1d: number | null;
  change_pct_7d: number | null;
  change_pct_30d: number | null;
  points: Array<{ as_of: string; value: number }>;
};

export type PriceTrendChartReadModel = {
  metrics: Record<string, PriceTrendChartData>;
  generatedAt: string;
  isFallback: boolean;
  error: string | null;
};

export async function getPriceTrendChartReadModel(): Promise<PriceTrendChartReadModel> {
  try {
    const history = await fetchJson<MarketHistory>('/market/history');

    if (!history?.metrics) {
      throw new Error('No metrics in history response');
    }

    const metrics: Record<string, PriceTrendChartData> = {};

    for (const [key, metric] of Object.entries(history.metrics)) {
      metrics[key] = {
        metric_key: key,
        unit: metric.unit,
        latest_value: metric.latest_value ?? 0,
        latest_as_of: metric.latest_as_of ?? new Date().toISOString(),
        change_pct_1d: finiteChangeOrNull(metric.change_pct_1d),
        change_pct_7d: finiteChangeOrNull(metric.change_pct_7d),
        change_pct_30d: finiteChangeOrNull(metric.change_pct_30d),
        points: metric.points ?? []
      };
    }

    return {
      metrics,
      generatedAt: new Date().toISOString(),
      isFallback: false,
      error: null
    };
  } catch (error) {
    return {
      metrics: {},
      generatedAt: new Date().toISOString(),
      isFallback: true,
      error: error instanceof Error ? error.message : 'Failed to load price trends'
    };
  }
}
