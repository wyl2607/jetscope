import { buildApiUrl } from '@/lib/api-config';
import {
  FALLBACK_VALUES,
  finiteChangeOrNull,
  finiteNumberOrNull,
  metricLabel,
  resolveHistoryMetric,
  resolveSnapshotMetric,
  type MarketHistory,
  type MarketHistoryMetric,
  type MarketSnapshot
} from '@/lib/product-read-model';

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

type GermanyMetricConfig = {
  metricKey: GermanyJetFuelMetricKey;
  unit: string;
  digits: number;
  fallbackKey?: GermanyJetFuelMetricKey;
};

const GERMANY_METRIC_CONFIGS: GermanyMetricConfig[] = [
  { metricKey: 'brent_usd_per_bbl', unit: 'USD/bbl', digits: 2 },
  { metricKey: 'jet_usd_per_l', unit: 'USD/L', digits: 3 },
  { metricKey: 'jet_eu_proxy_usd_per_l', unit: 'USD/L', digits: 3, fallbackKey: 'jet_usd_per_l' },
  { metricKey: 'carbon_proxy_usd_per_t', unit: 'USD/tCO2', digits: 2 }
];

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

function buildGermanyMetric(
  config: GermanyMetricConfig,
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
  const { metricKey } = config;
  const sourceMetricKey = history.metric ? history.sourceMetricKey : snapshot.sourceMetricKey;
  const usedFallback = snapshot.usedFallback || history.usedFallback;
  const fallbackNote = usedFallback && sourceMetricKey !== metricKey ? `Fallback from ${metricLabel(sourceMetricKey)}` : null;

  return {
    metricKey,
    label: metricLabel(metricKey),
    unit: config.unit,
    value: snapshot.value,
    digits: config.digits,
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
    metrics: GERMANY_METRIC_CONFIGS.map((config) => ({
      metricKey: config.metricKey,
      label: metricLabel(config.metricKey),
      unit: config.unit,
      value: finiteNumberOrNull(FALLBACK_VALUES[config.metricKey]),
      digits: config.digits,
      sourceMetricKey: config.fallbackKey ?? config.metricKey,
      latestAsOf: null,
      changePct1d: null,
      changePct7d: null,
      changePct30d: null,
      note: config.fallbackKey ? `Fallback from ${metricLabel(config.fallbackKey)}` : null
    })),
    isFallback: true,
    error: error instanceof Error ? error.message : 'unknown error'
  };
}

export async function getGermanyJetFuelReadModel(): Promise<GermanyJetFuelReadModel> {
  try {
    const [market, history] = await Promise.all([
      fetchJson<MarketSnapshot>('/market/snapshot'),
      fetchJson<MarketHistory>('/market/history').catch(() => ({ metrics: {} }))
    ]);

    const metrics = GERMANY_METRIC_CONFIGS.map((config) =>
      buildGermanyMetric(
        config,
        resolveSnapshotMetric(market.values, config.metricKey, config.fallbackKey),
        resolveHistoryMetric(history, config.metricKey, config.fallbackKey)
      )
    );

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
