import { buildApiUrl } from '@/lib/api-config';
import { selectFossilJetBenchmark, selectQualifiedInput } from '@/lib/market-quality';
import {
  FALLBACK_VALUES,
  finiteChangeOrNull,
  finiteNumberOrNull,
  metricLabel,
  resolveHistoryMetric,
  resolveSnapshotMetric,
  type MarketHistory,
  type MarketHistoryMetric,
  type DisplayLocale,
  type MarketSnapshot,
  type MarketSourceDetail
} from '@/lib/product-read-model';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

export type GermanyJetFuelMetricKey =
  | 'brent_usd_per_bbl'
  | 'jet_usd_per_l'
  | 'rotterdam_jet_fuel_usd_per_l'
  | 'jet_eu_proxy_usd_per_l'
  | 'carbon_proxy_usd_per_t';

export type GermanyDecisionKind = 'insufficient' | 'revisit' | 'review' | 'stable';

export type GermanyJetFuelMetric = {
  metricKey: GermanyJetFuelMetricKey;
  label: string;
  unit: string;
  value: number | null;
  digits: number;
  sourceMetricKey: string;
  latestAsOf: string | null;
  observedAt: string | null;
  fetchedAt: string | null;
  changePct1d: number | null;
  changePct7d: number | null;
  changePct30d: number | null;
  quality: string;
  quoteKind: string | null;
  note: string | null;
};

export type GermanyJetFuelReadModel = {
  generatedAt: string | null;
  fetchedAt: string | null;
  quoteAsOf: string | null;
  overallStatus: string;
  metrics: GermanyJetFuelMetric[];
  isFallback: boolean;
  decision: GermanyDecisionKind;
  usdPerEur: number | null;
  usdPerEurQuality: string;
  euaEurPerT: number | null;
  euaQuality: string;
  selectedJetMetricKey: string | null;
  selectedJetUsable: boolean;
  germanyPremiumPct: number | null;
  germanyPremiumNote: string | null;
  error: string | null;
};

type GermanyMetricConfig = {
  metricKey: GermanyJetFuelMetricKey;
  unit: string;
  digits: number;
  fallbackKey?: GermanyJetFuelMetricKey;
  detailKey: string;
};

const GERMANY_METRIC_CONFIGS: GermanyMetricConfig[] = [
  { metricKey: 'brent_usd_per_bbl', unit: 'USD/bbl', digits: 2, detailKey: 'brent' },
  { metricKey: 'jet_usd_per_l', unit: 'USD/L', digits: 3, detailKey: 'jet' },
  { metricKey: 'rotterdam_jet_fuel_usd_per_l', unit: 'USD/L', digits: 3, detailKey: 'rotterdam_jet_fuel' },
  {
    metricKey: 'jet_eu_proxy_usd_per_l',
    unit: 'USD/L',
    digits: 3,
    fallbackKey: 'jet_usd_per_l',
    detailKey: 'jet_eu_proxy'
  },
  { metricKey: 'carbon_proxy_usd_per_t', unit: 'USD/tCO2', digits: 2, detailKey: 'carbon' }
];

function fallbackNote(sourceMetricKey: string, locale: DisplayLocale): string {
  const sourceLabel = metricLabel(sourceMetricKey, locale);
  return locale === 'de' ? `Fallback von ${sourceLabel}` : `Fallback from ${sourceLabel}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.JETSCOPE_MARKET_FETCH_TIMEOUT_MS ?? DEFAULT_FETCH_TIMEOUT_MS);
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) && timeoutMs >= 100 ? timeoutMs : DEFAULT_FETCH_TIMEOUT_MS
  );
  try {
    const response = await fetch(buildApiUrl(path), {
      next: { revalidate: 300 },
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

function detailFor(
  details: Record<string, MarketSourceDetail> | undefined,
  detailKey: string,
  metricKey: string
): MarketSourceDetail | undefined {
  return details?.[detailKey] ?? details?.[metricKey];
}

export function decisionFromChange(
  change: number | null,
  quality: string,
  isFallback: boolean
): GermanyDecisionKind {
  if (isFallback || change == null || quality === 'seed' || quality === 'missing') {
    return 'insufficient';
  }
  const magnitude = Math.abs(change);
  if (magnitude >= 20) return 'revisit';
  if (magnitude >= 10) return 'review';
  return 'stable';
}

function buildGermanyMetric(
  locale: DisplayLocale,
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
  },
  detail: MarketSourceDetail | undefined
): GermanyJetFuelMetric {
  const { metricKey } = config;
  const sourceMetricKey = history.metric ? history.sourceMetricKey : snapshot.sourceMetricKey;
  const usedFallback = snapshot.usedFallback || history.usedFallback || Boolean(detail?.fallback_used);
  const quality = detail?.quality || history.metric?.quality || (usedFallback ? 'derived' : 'unknown');
  const note =
    usedFallback && sourceMetricKey !== metricKey
      ? fallbackNote(sourceMetricKey, locale)
      : detail?.note ?? null;

  return {
    metricKey,
    label: metricLabel(metricKey, locale),
    unit: config.unit,
    value: snapshot.value,
    digits: config.digits,
    sourceMetricKey,
    latestAsOf: detail?.observed_at ?? history.metric?.latest_as_of ?? null,
    observedAt: detail?.observed_at ?? history.metric?.latest_as_of ?? null,
    fetchedAt: detail?.fetched_at ?? null,
    changePct1d: finiteChangeOrNull(history.metric?.change_pct_1d),
    changePct7d: finiteChangeOrNull(history.metric?.change_pct_7d),
    changePct30d: finiteChangeOrNull(history.metric?.change_pct_30d),
    quality,
    quoteKind: detail?.quote_kind ?? null,
    note
  };
}

function emptyMetrics(locale: DisplayLocale): GermanyJetFuelMetric[] {
  return GERMANY_METRIC_CONFIGS.map((config) => ({
    metricKey: config.metricKey,
    label: metricLabel(config.metricKey, locale),
    unit: config.unit,
    value: finiteNumberOrNull(FALLBACK_VALUES[config.metricKey]),
    digits: config.digits,
    sourceMetricKey: config.fallbackKey ?? config.metricKey,
    latestAsOf: null,
    observedAt: null,
    fetchedAt: null,
    changePct1d: null,
    changePct7d: null,
    changePct30d: null,
    quality: 'seed',
    quoteKind: 'assumption',
    note: config.fallbackKey ? fallbackNote(config.fallbackKey, locale) : null
  }));
}

function fallbackGermanyJetFuelReadModel(error: unknown, locale: DisplayLocale): GermanyJetFuelReadModel {
  const metrics = emptyMetrics(locale);
  return {
    generatedAt: null,
    fetchedAt: null,
    quoteAsOf: null,
    overallStatus: 'degraded',
    metrics,
    isFallback: true,
    decision: 'insufficient',
    usdPerEur: null,
    usdPerEurQuality: 'missing',
    euaEurPerT: null,
    euaQuality: 'missing',
    selectedJetMetricKey: null,
    selectedJetUsable: false,
    germanyPremiumPct: null,
    germanyPremiumNote: null,
    error: error instanceof Error ? error.message : 'unknown error'
  };
}

export function buildGermanyJetFuelReadModelFromPayload(
  market: MarketSnapshot,
  history: MarketHistory,
  locale: DisplayLocale = 'zh'
): GermanyJetFuelReadModel {
  const metrics = GERMANY_METRIC_CONFIGS.map((config) =>
    buildGermanyMetric(
      locale,
      config,
      resolveSnapshotMetric(market.values, config.metricKey, config.fallbackKey),
      resolveHistoryMetric(history, config.metricKey, config.fallbackKey),
      detailFor(market.source_details, config.detailKey, config.metricKey)
    )
  );
  const isFallback = Boolean(market.source_status?.is_fallback);
  const clockRaw = market.fetched_at ?? market.generated_at;
  const clock = clockRaw && !Number.isNaN(Date.parse(clockRaw)) ? new Date(clockRaw) : undefined;
  const selectedJet = selectFossilJetBenchmark(market.values, market.source_details ?? {}, clock);
  const fx = selectQualifiedInput(market.values.usd_per_eur, market.source_details?.ecb, clock);
  const eua = selectQualifiedInput(market.values.eu_ets_price_eur_per_t, market.source_details?.eu_ets, clock);
  const selectedMetric = metrics.find((metric) => metric.metricKey === selectedJet.metricKey) ?? null;
  const quoteAsOf = selectedMetric?.observedAt ?? null;
  const decisionQuality = selectedJet.usableForSignal ? selectedJet.quality : 'seed';

  return {
    generatedAt: market.generated_at,
    fetchedAt: market.fetched_at ?? market.source_status?.fetched_at ?? market.generated_at,
    quoteAsOf,
    overallStatus: market.source_status?.overall ?? 'unknown',
    metrics,
    isFallback,
    decision: decisionFromChange(
      selectedMetric?.changePct30d ?? null,
      decisionQuality,
      isFallback || !selectedJet.usableForSignal
    ),
    usdPerEur: fx.value,
    usdPerEurQuality: fx.quality,
    euaEurPerT: eua.value,
    euaQuality: eua.quality,
    selectedJetMetricKey: selectedJet.metricKey,
    selectedJetUsable: selectedJet.usableForSignal,
    germanyPremiumPct: finiteNumberOrNull(market.values.germany_premium_pct),
    germanyPremiumNote: market.source_details?.germany_premium?.note ?? null,
    error: null
  };
}

export async function getGermanyJetFuelReadModel(locale: DisplayLocale = 'zh'): Promise<GermanyJetFuelReadModel> {
  try {
    const [market, history] = await Promise.all([
      fetchJson<MarketSnapshot>('/market/snapshot'),
      fetchJson<MarketHistory>('/market/history?window_days=90').catch(() => ({ metrics: {} }))
    ]);
    return buildGermanyJetFuelReadModelFromPayload(market, history, locale);
  } catch (error) {
    return fallbackGermanyJetFuelReadModel(error, locale);
  }
}
