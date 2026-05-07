import { WORKSPACE_SLUG } from '@/lib/api-config';
import type { SourceCoverageResponse } from '@/lib/source-coverage-contract';
import {
  fetchJson,
  metricLabel,
  FALLBACK_VALUES,
  type AirlineDecisionResponse,
  type MarketHistory,
  type MarketSnapshot,
  type ReserveSignal
} from '@/lib/product-read-model';

type TippingPointPathway = {
  pathway_key: string;
  display_name: string;
  net_cost_low_usd_per_l: number;
  net_cost_high_usd_per_l: number;
  spread_low_pct: number;
  spread_high_pct: number;
  status: string;
};

type TippingPointResponse = {
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

export async function getDashboardReadModel(): Promise<DashboardReadModel> {
  try {
    const [market, scenarios, history, reserve, tippingPoint, airlineDecision, sourceCoverage] = await Promise.all([
      fetchJson<MarketSnapshot>('/market/snapshot'),
      fetchJson<ScenarioRecord[]>(`/workspaces/${WORKSPACE_SLUG}/scenarios`).catch(() => []),
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
