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
  quality?: string | null;
  points: Array<{ as_of: string; value: number; quality?: string | null; source?: string | null }>;
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
 *
 * An explicit seed or missing quality is not a quote, even when a numeric
 * carry-forward is present. Untagged history with a timestamp stays observed,
 * which is what the figure contract already did before quality existed.
 */
function latestValueFigure(
  value: number | null | undefined,
  unit: string,
  asOf: string | null,
  quality: string | null | undefined
): Figure {
  const normalized = quality?.trim().toLowerCase() || null;
  if (value == null || !Number.isFinite(value)) {
    return missing({
      unit,
      sourceId: PRICE_TREND_SOURCE_ID,
      reason: '最新价暂不可用',
      basis: 'observed'
    });
  }
  if (normalized === 'missing' || normalized === 'seed') {
    return missing({
      unit,
      sourceId: PRICE_TREND_SOURCE_ID,
      reason: normalized === 'seed' ? '种子值不是行情' : '缺少可引用的行情',
      basis: 'assumption'
    });
  }
  if ((normalized === 'observed' || normalized == null) && asOf) {
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
    asOf,
    precision: 2,
    method:
      normalized === 'derived' || normalized === 'proxy'
        ? `market history quality=${normalized}`
        : 'market history latest without source timestamp'
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

export function buildPriceTrendChartReadModelFromHistory(history: MarketHistory): PriceTrendChartReadModel {
  if (!history?.metrics) {
    throw new Error('No metrics in history response');
  }

  const metrics: Record<string, PriceTrendChartData> = {};

  for (const [key, metric] of Object.entries(history.metrics)) {
    const latestAsOf = metric.latest_as_of ?? null;
    metrics[key] = {
      metric_key: key,
      unit: metric.unit,
      latest_value: latestValueFigure(metric.latest_value, metric.unit, latestAsOf, metric.quality),
      latest_as_of: latestAsOf,
      change_pct_1d: changePctFigure(finiteChangeOrNull(metric.change_pct_1d), 1, latestAsOf),
      change_pct_7d: changePctFigure(finiteChangeOrNull(metric.change_pct_7d), 7, latestAsOf),
      change_pct_30d: changePctFigure(finiteChangeOrNull(metric.change_pct_30d), 30, latestAsOf),
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
