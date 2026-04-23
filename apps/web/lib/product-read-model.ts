import { WORKSPACE_SLUG, buildApiUrl } from '@/lib/api-config';

type MarketSnapshot = {
  generated_at: string;
  source_status: { overall: string };
  values: Record<string, number>;
};

type MarketHistoryMetric = {
  metric_key: string;
  unit: string;
  latest_value?: number;
  latest_as_of?: string;
  change_pct_1d?: number | null;
  change_pct_7d?: number | null;
  change_pct_30d?: number | null;
  points?: Array<{ as_of: string; value: number }>;
};

type MarketHistory = {
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

export type GermanyJetFuelMetricKey =
  | 'brent_usd_per_bbl'
  | 'jet_usd_per_l'
  | 'jet_eu_proxy_usd_per_l'
  | 'carbon_proxy_usd_per_t';

export type GermanyJetFuelMetric = {
  metricKey: GermanyJetFuelMetricKey;
  label: string;
  unit: string;
  value: number | null;
  digits: number;
  sourceMetricKey: string;
  latestAsOf: string | null;
  changePct1d: number | null;
  changePct7d: number | null;
  changePct30d: number | null;
  note: string | null;
};

export type GermanyJetFuelReadModel = {
  generatedAt: string;
  overallStatus: string;
  metrics: GermanyJetFuelMetric[];
  isFallback: boolean;
  error: string | null;
};

const FALLBACK_VALUES = {
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

async function fetchJson<T>(path: string): Promise<T> {
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
      source_status: { overall: 'degraded' },
      values: { ...FALLBACK_VALUES }
    },
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

function metricLabel(metric: string): string {
  if (metric === 'brent_usd_per_bbl') return 'Brent';
  if (metric === 'jet_usd_per_l') return 'Jet fuel';
  if (metric === 'jet_eu_proxy_usd_per_l') return 'Jet fuel (EU proxy)';
  if (metric === 'carbon_proxy_usd_per_t') return 'Carbon proxy';
  return metric;
}

function finiteNumberOrNull(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveSnapshotMetric(
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

function resolveHistoryMetric(
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

function finiteChangeOrNull(value?: number | null): number | null {
  return finiteNumberOrNull(value);
}

function buildGermanyMetric(
  metricKey: GermanyJetFuelMetricKey,
  unit: string,
  digits: number,
  snapshot: {
    value: number | null;
    sourceMetricKey: string;
    usedFallback: boolean;
  },
  history: {
    metric: MarketHistoryMetric | null;
    sourceMetricKey: string;
    usedFallback: boolean;
  }
): GermanyJetFuelMetric {
  const sourceMetricKey = history.metric ? history.sourceMetricKey : snapshot.sourceMetricKey;
  const usedFallback = snapshot.usedFallback || history.usedFallback;
  const fallbackNote = usedFallback && sourceMetricKey !== metricKey ? `Fallback from ${metricLabel(sourceMetricKey)}` : null;

  return {
    metricKey,
    label: metricLabel(metricKey),
    unit,
    value: snapshot.value,
    digits,
    sourceMetricKey,
    latestAsOf: history.metric?.latest_as_of ?? null,
    changePct1d: finiteChangeOrNull(history.metric?.change_pct_1d),
    changePct7d: finiteChangeOrNull(history.metric?.change_pct_7d),
    changePct30d: finiteChangeOrNull(history.metric?.change_pct_30d),
    note: fallbackNote
  };
}

function fallbackGermanyJetFuelReadModel(error: unknown): GermanyJetFuelReadModel {
  return {
    generatedAt: new Date().toISOString(),
    overallStatus: 'degraded',
    metrics: [
      {
        metricKey: 'brent_usd_per_bbl',
        label: metricLabel('brent_usd_per_bbl'),
        unit: 'USD/bbl',
        value: FALLBACK_VALUES.brent_usd_per_bbl,
        digits: 2,
        sourceMetricKey: 'brent_usd_per_bbl',
        latestAsOf: null,
        changePct1d: null,
        changePct7d: null,
        changePct30d: null,
        note: null
      },
      {
        metricKey: 'jet_usd_per_l',
        label: metricLabel('jet_usd_per_l'),
        unit: 'USD/L',
        value: FALLBACK_VALUES.jet_usd_per_l,
        digits: 3,
        sourceMetricKey: 'jet_usd_per_l',
        latestAsOf: null,
        changePct1d: null,
        changePct7d: null,
        changePct30d: null,
        note: null
      },
      {
        metricKey: 'jet_eu_proxy_usd_per_l',
        label: metricLabel('jet_eu_proxy_usd_per_l'),
        unit: 'USD/L',
        value: FALLBACK_VALUES.jet_eu_proxy_usd_per_l,
        digits: 3,
        sourceMetricKey: 'jet_usd_per_l',
        latestAsOf: null,
        changePct1d: null,
        changePct7d: null,
        changePct30d: null,
        note: 'Fallback from Jet fuel'
      },
      {
        metricKey: 'carbon_proxy_usd_per_t',
        label: metricLabel('carbon_proxy_usd_per_t'),
        unit: 'USD/tCO2',
        value: FALLBACK_VALUES.carbon_proxy_usd_per_t,
        digits: 2,
        sourceMetricKey: 'carbon_proxy_usd_per_t',
        latestAsOf: null,
        changePct1d: null,
        changePct7d: null,
        changePct30d: null,
        note: null
      }
    ],
    isFallback: true,
    error: error instanceof Error ? error.message : 'unknown error'
  };
}

export async function getDashboardReadModel(): Promise<DashboardReadModel> {
  try {
    const [market, scenarios, history] = await Promise.all([
      fetchJson<MarketSnapshot>('/market/snapshot'),
      fetchJson<ScenarioRecord[]>(`/workspaces/${WORKSPACE_SLUG}/scenarios`),
      fetchJson<MarketHistory>('/market/history').catch(() => ({ metrics: {} }))
    ]);

    const topRiskSignal = computeTopRiskSignal(history);

    return {
      market,
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

export async function getGermanyJetFuelReadModel(): Promise<GermanyJetFuelReadModel> {
  try {
    const [market, history] = await Promise.all([
      fetchJson<MarketSnapshot>('/market/snapshot'),
      fetchJson<MarketHistory>('/market/history').catch(() => ({ metrics: {} }))
    ]);

    const metrics = [
      buildGermanyMetric(
        'brent_usd_per_bbl',
        'USD/bbl',
        2,
        resolveSnapshotMetric(market.values, 'brent_usd_per_bbl'),
        resolveHistoryMetric(history, 'brent_usd_per_bbl')
      ),
      buildGermanyMetric(
        'jet_usd_per_l',
        'USD/L',
        3,
        resolveSnapshotMetric(market.values, 'jet_usd_per_l'),
        resolveHistoryMetric(history, 'jet_usd_per_l')
      ),
      buildGermanyMetric(
        'jet_eu_proxy_usd_per_l',
        'USD/L',
        3,
        resolveSnapshotMetric(market.values, 'jet_eu_proxy_usd_per_l', 'jet_usd_per_l'),
        resolveHistoryMetric(history, 'jet_eu_proxy_usd_per_l', 'jet_usd_per_l')
      ),
      buildGermanyMetric(
        'carbon_proxy_usd_per_t',
        'USD/tCO2',
        2,
        resolveSnapshotMetric(market.values, 'carbon_proxy_usd_per_t'),
        resolveHistoryMetric(history, 'carbon_proxy_usd_per_t')
      )
    ];

    return {
      generatedAt: market.generated_at,
      overallStatus: market.source_status?.overall ?? 'unknown',
      metrics,
      isFallback: false,
      error: null
    };
  } catch (error) {
    return fallbackGermanyJetFuelReadModel(error);
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

export function getMarketSnapshotEndpoint(): string {
  return buildApiUrl('/market/snapshot');
}
