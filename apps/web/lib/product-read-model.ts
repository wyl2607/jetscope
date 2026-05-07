import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

export type MarketSnapshot = {
  generated_at: string;
  source_status: {
    overall: string;
    confidence?: number | null;
    freshness_minutes?: number | null;
    fallback_rate?: number | null;
    is_fallback?: boolean | null;
  };
  values: Record<string, number>;
};

export type ReserveSignal = {
  generated_at: string;
  region: string;
  coverage_days: number;
  coverage_weeks: number;
  stress_level: string;
  estimated_supply_gap_pct: number;
  source_type: string;
  source_name: string;
  confidence_score: number;
};

export type TippingPointPathway = {
  pathway_key: string;
  display_name: string;
  net_cost_low_usd_per_l: number;
  net_cost_high_usd_per_l: number;
  spread_low_pct: number;
  spread_high_pct: number;
  status: string;
};

export type TippingPointReadModel = {
  generatedAt: string;
  effectiveFossilJetUsdPerL: number;
  signal: string;
  inputs: {
    fossilJetUsdPerL: number;
    carbonPriceEurPerT: number;
    subsidyUsdPerL: number;
    blendRatePct: number;
  };
  pathways: TippingPointPathway[];
};

export type ReadinessTippingPointResponse = TippingPointResponse;

export type DecisionReadModel = {
  signal: string;
  probabilities: {
    raise_fares: number;
    cut_capacity: number;
    buy_spot_saf: number;
    sign_long_term_offtake: number;
    ground_routes: number;
  };
};

export type TippingPointResponse = {
  generated_at: string;
  inputs: {
    fossil_jet_usd_per_l: number;
    carbon_price_eur_per_t: number;
    subsidy_usd_per_l: number;
    blend_rate_pct: number;
  };
  effective_fossil_jet_usd_per_l: number;
  pathways: TippingPointPathway[];
  signal: string;
};

export type AirlineDecisionResponse = {
  generated_at: string;
  inputs: {
    fossil_jet_usd_per_l: number;
    reserve_weeks: number;
    carbon_price_eur_per_t: number;
    pathway_key: string;
  };
  signal: string;
  probabilities: {
    raise_fares: number;
    cut_capacity: number;
    buy_spot_saf: number;
    sign_long_term_offtake: number;
    ground_routes: number;
  };
};

export type MarketHistoryMetric = {
  metric_key: string;
  unit: string;
  latest_value?: number;
  latest_as_of?: string;
  change_pct_1d?: number | null;
  change_pct_7d?: number | null;
  change_pct_30d?: number | null;
  points?: Array<{ as_of: string; value: number }>;
};

export type MarketHistory = {
  generated_at?: string;
  metrics: Record<string, MarketHistoryMetric>;
};

export const FALLBACK_VALUES = {
  brent_usd_per_bbl: 114.93,
  jet_usd_per_l: 0.99,
  jet_eu_proxy_usd_per_l: 0.99,
  carbon_proxy_usd_per_t: 88.79
} as const;

export async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.JETSCOPE_MARKET_FETCH_TIMEOUT_MS ?? DEFAULT_FETCH_TIMEOUT_MS);
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) && timeoutMs >= 100 ? timeoutMs : DEFAULT_FETCH_TIMEOUT_MS
  );
  try {
    const response = await fetch(buildApiUrl(path), {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function metricLabel(metric: string): string {
  if (metric === 'brent_usd_per_bbl') return 'Brent';
  if (metric === 'jet_usd_per_l') return '航煤';
  if (metric === 'jet_eu_proxy_usd_per_l') return '航煤（欧盟代理）';
  if (metric === 'carbon_proxy_usd_per_t') return '碳价代理';
  return metric;
}

export function finiteNumberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function resolveSnapshotMetric(
  values: Record<string, number>,
  key: string,
  fallbackKey?: string
): {
  value: number | null;
  sourceMetricKey: string;
  usedFallback: boolean;
} {
  const direct = finiteNumberOrNull(values[key]);
  if (direct != null) {
    return { value: direct, sourceMetricKey: key, usedFallback: false };
  }

  if (fallbackKey) {
    const fallback = finiteNumberOrNull(values[fallbackKey]);
    if (fallback != null) {
      return { value: fallback, sourceMetricKey: fallbackKey, usedFallback: true };
    }
  }

  return { value: null, sourceMetricKey: key, usedFallback: false };
}

export function resolveHistoryMetric(
  history: MarketHistory | null,
  key: string,
  fallbackKey?: string
): {
  metric: MarketHistoryMetric | null;
  sourceMetricKey: string;
  usedFallback: boolean;
} {
  const direct = history?.metrics?.[key] ?? null;
  if (direct) {
    return { metric: direct, sourceMetricKey: key, usedFallback: false };
  }

  if (fallbackKey) {
    const fallback = history?.metrics?.[fallbackKey] ?? null;
    if (fallback) {
      return { metric: fallback, sourceMetricKey: fallbackKey, usedFallback: true };
    }
  }

  return { metric: null, sourceMetricKey: key, usedFallback: false };
}

export function finiteChangeOrNull(value?: number | null): number | null {
  return finiteNumberOrNull(value);
}

export function toTippingPointReadModel(
  response: TippingPointResponse | null
): TippingPointReadModel | null {
  if (!response) return null;
  return {
    generatedAt: response.generated_at,
    effectiveFossilJetUsdPerL: response.effective_fossil_jet_usd_per_l ?? 0,
    signal: response.signal ?? 'fossil_still_advantaged',
    inputs: {
      fossilJetUsdPerL: response.inputs?.fossil_jet_usd_per_l ?? 0,
      carbonPriceEurPerT: response.inputs?.carbon_price_eur_per_t ?? 0,
      subsidyUsdPerL: response.inputs?.subsidy_usd_per_l ?? 0,
      blendRatePct: response.inputs?.blend_rate_pct ?? 0,
    },
    pathways: response.pathways ?? [],
  };
}

export function toDecisionReadModel(
  response: AirlineDecisionResponse | null
): DecisionReadModel | null {
  if (!response) return null;
  return {
    signal: response.signal ?? 'incremental_adjustment',
    probabilities: {
      raise_fares: response.probabilities?.raise_fares ?? 0,
      cut_capacity: response.probabilities?.cut_capacity ?? 0,
      buy_spot_saf: response.probabilities?.buy_spot_saf ?? 0,
      sign_long_term_offtake: response.probabilities?.sign_long_term_offtake ?? 0,
      ground_routes: response.probabilities?.ground_routes ?? 0,
    },
  };
}

export function getMarketSnapshotEndpoint(): string {
  return buildApiUrl('/market/snapshot');
}

// Re-exports: Dashboard read-model now lives in `./dashboard-read-model`.
// Kept here for backwards compatibility with existing callers.
export { getDashboardReadModel, type DashboardReadModel } from './dashboard-read-model';

// Re-exports: PriceTrendChart read-model now lives in `./price-trend-chart-read-model`.
// Kept here for backwards compatibility with existing callers.
export {
  getPriceTrendChartReadModel,
  type PriceTrendChartData,
  type PriceTrendChartReadModel
} from './price-trend-chart-read-model';
