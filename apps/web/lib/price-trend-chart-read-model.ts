import { derived, missing, observed, type Figure } from '@/lib/figure';
import {
  fetchJson,
  finiteChangeOrNull,
  type MarketHistory
} from '@/lib/product-read-model';

const PRICE_TREND_SOURCE_ID = 'market-history';

export type PriceTrendChartData = {
  metric_key: string;
  unit: string;
  latest_value: Figure; // unit from series `unit`
  latest_as_of: string | null;
  change_pct_1d: Figure; // unit '%'
  change_pct_7d: Figure; // unit '%'
  change_pct_30d: Figure; // unit '%'
  points: Array<{ as_of: string; value: number }>;
};

export type PriceTrendChartReadModel = {
  metrics: Record<string, PriceTrendChartData>;
  generatedAt: string | null;
  isFallback: boolean;
  error: string | null;
};

/**
 * Latest spot/level for a series. Provenance lives on this Figure; series points
 * stay bare (see price-trends-chart PricePoint ignore).
 */
function latestValueFigure(
  value: number | null | undefined,
  unit: string,
  asOf: string | null
): Figure {
  if (value == null || !Number.isFinite(value)) {
    return missing({
      unit,
      sourceId: PRICE_TREND_SOURCE_ID,
      reason: '最新价暂不可用',
      basis: 'observed'
    });
  }
  if (asOf) {
    return observed({
      value,
      unit,
      sourceId: PRICE_TREND_SOURCE_ID,
      asOf,
      precision: 2
    });
  }
  return derived({
    value,
    unit,
    sourceId: PRICE_TREND_SOURCE_ID,
    asOf: null,
    precision: 2,
    method: 'market history latest without source timestamp'
  });
}

/**
 * Window change rate. Null means the window is too short to compute — never 0.
 */
function changePctFigure(
  value: number | null,
  days: 1 | 7 | 30,
  asOf: string | null
): Figure {
  if (value == null) {
    return missing({
      unit: '%',
      sourceId: PRICE_TREND_SOURCE_ID,
      reason: `不足 ${days} 日历史`,
      basis: 'derived'
    });
  }
  return derived({
    value,
    unit: '%',
    sourceId: PRICE_TREND_SOURCE_ID,
    asOf,
    precision: 2,
    method: `相对 ${days} 日前的变化率`
  });
}

export async function getPriceTrendChartReadModel(): Promise<PriceTrendChartReadModel> {
  try {
    const history = await fetchJson<MarketHistory>('/market/history');

    if (!history?.metrics) {
      throw new Error('No metrics in history response');
    }

    const metrics: Record<string, PriceTrendChartData> = {};

    for (const [key, metric] of Object.entries(history.metrics)) {
      const latestAsOf = metric.latest_as_of ?? null;
      metrics[key] = {
        metric_key: key,
        unit: metric.unit,
        latest_value: latestValueFigure(metric.latest_value, metric.unit, latestAsOf),
        latest_as_of: latestAsOf,
        change_pct_1d: changePctFigure(finiteChangeOrNull(metric.change_pct_1d), 1, latestAsOf),
        change_pct_7d: changePctFigure(finiteChangeOrNull(metric.change_pct_7d), 7, latestAsOf),
        change_pct_30d: changePctFigure(finiteChangeOrNull(metric.change_pct_30d), 30, latestAsOf),
        points: metric.points ?? []
      };
    }

    const generatedAt = Object.values(metrics).reduce<{ at: number; iso: string } | null>((latest, metric) => {
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
  } catch (error) {
    return {
      metrics: {},
      generatedAt: null,
      isFallback: true,
      error: error instanceof Error ? error.message : 'Failed to load price trends'
    };
  }
}
