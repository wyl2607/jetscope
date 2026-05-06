import { WORKSPACE_SLUG, buildApiUrl } from '@/lib/api-config';
import type { SourceCoverageResponse } from '@/lib/source-coverage-contract';

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

type ScenarioRecord = {
  id: string;
  name: string;
  saved_at: string;
};

export type DashboardReadModel = {
  market: MarketSnapshot;
  reserve: ReserveSignal | null;
  tippingPoint: TippingPointResponse | null;
  airlineDecision: AirlineDecisionResponse | null;
  sourceCoverage: SourceCoverageResponse | null;
  scenarioCount: number;
  recentScenarioNames: string[];
  freshnessSignal: {
    minutes: number;
    level: 'fresh' | 'stale' | 'critical';
    freshMaxMinutes: number;
    staleMaxMinutes: number;
  };
  topRiskSignal: {
    metric: string;
    metricKey: string;
    window: '1d' | '7d' | '30d';
    changePct: number;
    level: 'normal' | 'watch' | 'alert';
    latestAsOf: string | null;
    sampleCount: number;
  } | null;
  isFallback: boolean;
  error: string | null;
};

export const FALLBACK_VALUES = {
  brent_usd_per_bbl: 114.93,
  jet_usd_per_l: 0.99,
  jet_eu_proxy_usd_per_l: 0.99,
  carbon_proxy_usd_per_t: 88.79
} as const;

function envThreshold(name: string, defaultValue: number): number {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue;
  }
  return Math.floor(parsed);
}

const FRESHNESS_DEFAULTS = { freshMaxMinutes: 60, staleMaxMinutes: 1440 } as const;

const FRESHNESS_THRESHOLDS = (() => {
  const freshMaxMinutes = envThreshold('SAFVSOIL_FRESHNESS_FRESH_MAX_MINUTES', FRESHNESS_DEFAULTS.freshMaxMinutes);
  const staleMaxMinutes = envThreshold('SAFVSOIL_FRESHNESS_STALE_MAX_MINUTES', FRESHNESS_DEFAULTS.staleMaxMinutes);
  if (staleMaxMinutes <= freshMaxMinutes) {
    return FRESHNESS_DEFAULTS;
  }
  return { freshMaxMinutes, staleMaxMinutes };
})();

function computeFreshnessSignal(generatedAt: string): DashboardReadModel['freshnessSignal'] {
  const generatedAtMs = new Date(generatedAt).getTime();
  if (Number.isNaN(generatedAtMs)) {
    return {
      minutes: FRESHNESS_THRESHOLDS.staleMaxMinutes + 1,
      level: 'critical',
      freshMaxMinutes: FRESHNESS_THRESHOLDS.freshMaxMinutes,
      staleMaxMinutes: FRESHNESS_THRESHOLDS.staleMaxMinutes
    };
  }

  const minutes = Math.max(0, Math.floor((Date.now() - generatedAtMs) / 60000));
  const level = minutes <= FRESHNESS_THRESHOLDS.freshMaxMinutes
    ? 'fresh'
    : minutes <= FRESHNESS_THRESHOLDS.staleMaxMinutes
      ? 'stale'
      : 'critical';

  return {
    minutes,
    level,
    freshMaxMinutes: FRESHNESS_THRESHOLDS.freshMaxMinutes,
    staleMaxMinutes: FRESHNESS_THRESHOLDS.staleMaxMinutes
  };
}

export async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
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

function fallbackReadModel(error: unknown): DashboardReadModel {
  return {
    market: {
      generated_at: new Date().toISOString(),
      source_status: { overall: 'degraded', confidence: 0, freshness_minutes: null, fallback_rate: 100, is_fallback: true },
      values: { ...FALLBACK_VALUES }
    },
    reserve: null,
    tippingPoint: null,
    airlineDecision: null,
    sourceCoverage: null,
    scenarioCount: 0,
    recentScenarioNames: [],
    freshnessSignal: {
      minutes: FRESHNESS_THRESHOLDS.staleMaxMinutes + 1,
      level: 'critical',
      freshMaxMinutes: FRESHNESS_THRESHOLDS.freshMaxMinutes,
      staleMaxMinutes: FRESHNESS_THRESHOLDS.staleMaxMinutes
    },
    topRiskSignal: null,
    isFallback: true,
    error: error instanceof Error ? error.message : 'unknown error'
  };
}

function computeTopRiskSignal(history: MarketHistory | null): DashboardReadModel['topRiskSignal'] {
  if (!history?.metrics) {
    return null;
  }

  type Candidate = {
    metric: string;
    window: '1d' | '7d' | '30d';
    changePct: number;
    latestAsOf: string | null;
    sampleCount: number;
  };
  const candidates: Candidate[] = [];

  for (const metric of Object.values(history.metrics)) {
    const windows: Array<{ window: '1d' | '7d' | '30d'; value?: number | null }> = [
      { window: '1d', value: metric.change_pct_1d },
      { window: '7d', value: metric.change_pct_7d },
      { window: '30d', value: metric.change_pct_30d }
    ];
    for (const item of windows) {
      if (!Number.isFinite(item.value ?? NaN)) {
        continue;
      }
      candidates.push({
        metric: metric.metric_key,
        window: item.window,
        changePct: Number(item.value),
        latestAsOf: metric.latest_as_of ?? null,
        sampleCount: Array.isArray(metric.points) ? metric.points.length : 0
      });
    }
  }

  if (!candidates.length) {
    return null;
  }

  const top = candidates.reduce((winner, current) =>
    Math.abs(current.changePct) > Math.abs(winner.changePct) ? current : winner
  );
  const peak = Math.abs(top.changePct);
  const level: 'normal' | 'watch' | 'alert' = peak >= 20 ? 'alert' : peak >= 10 ? 'watch' : 'normal';

  return {
    metric: top.metric,
    metricKey: top.metric,
    window: top.window,
    changePct: top.changePct,
    level,
    latestAsOf: top.latestAsOf,
    sampleCount: top.sampleCount
  };
}

export function metricLabel(metric: string): string {
  if (metric === 'brent_usd_per_bbl') return 'Brent';
  if (metric === 'jet_usd_per_l') return 'Jet fuel';
  if (metric === 'jet_eu_proxy_usd_per_l') return 'Jet fuel (EU proxy)';
  if (metric === 'carbon_proxy_usd_per_t') return 'Carbon proxy';
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

export async function getDashboardReadModel(): Promise<DashboardReadModel> {
  try {
    const [market, scenarios, history, reserve, tippingPoint, airlineDecision, sourceCoverage] = await Promise.all([
      fetchJson<MarketSnapshot>('/market/snapshot'),
      fetchJson<ScenarioRecord[]>(`/workspaces/${WORKSPACE_SLUG}/scenarios`),
      fetchJson<MarketHistory>('/market/history').catch(() => ({ metrics: {} })),
      fetchJson<ReserveSignal>('/reserves/eu').catch(() => null),
      fetchJson<TippingPointResponse>('/analysis/tipping-point?fossil_jet_usd_per_l=1.30&carbon_price_eur_per_t=95&subsidy_usd_per_l=0&blend_rate_pct=6').catch(() => null),
      fetchJson<AirlineDecisionResponse>('/analysis/airline-decision?fossil_jet_usd_per_l=1.30&reserve_weeks=3&carbon_price_eur_per_t=95&pathway_key=hefa').catch(() => null),
      fetchJson<SourceCoverageResponse>('/sources/coverage').catch(() => null)
    ]);

    const topRiskSignal = computeTopRiskSignal(history);

    return {
      market,
      reserve,
      tippingPoint,
      airlineDecision,
      sourceCoverage,
      scenarioCount: scenarios.length,
      recentScenarioNames: scenarios.slice(0, 3).map((item) => item.name),
      freshnessSignal: computeFreshnessSignal(market.generated_at),
      topRiskSignal:
        topRiskSignal == null
          ? null
          : {
              ...topRiskSignal,
              metric: metricLabel(topRiskSignal.metric)
            },
      isFallback: false,
      error: null
    };
  } catch (error) {
    return fallbackReadModel(error);
  }
}

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
