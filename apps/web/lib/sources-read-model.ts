import { buildApiUrl } from '@/lib/api-config';
import type { SourceCoverageMetric, SourceCoverageResponse } from '@/lib/source-coverage-contract';

type MarketSnapshot = {
  generated_at: string;
  source_status: { overall: string };
  values: Record<string, number>;
  source_details?: Record<string, DisplaySupplement>;
};

type MarketHistoryMetric = {
  metric_key: string;
  unit: string;
  latest_value: number;
  latest_as_of: string;
  change_pct_1d?: number | null;
  change_pct_7d?: number | null;
  change_pct_30d?: number | null;
  points: Array<{ as_of: string; value: number }>;
};

type MarketHistory = {
  generated_at: string;
  windows_days: number[];
  metrics: Record<string, MarketHistoryMetric>;
};

export type SourcesReadModel = {
  generatedAt: string;
  overallStatus: string;
  coverageMetrics: SourceCoverageMetric[];
  summary: {
    liveCount: number;
    proxyCount: number;
    fallbackCount: number;
    degradedCount: number;
    averageConfidence: number;
    freshnessLabel: string;
    trustLabel: string;
    degradedReason: string;
  };
  rows: Array<{
    surface: string;
    metricKey: string;
    source: string;
    sourceType: string;
    scope: string;
    confidence: string;
    confidenceScore: number;
    lag: string;
    lagMinutes: number | null;
    status: string;
    trustState: 'live' | 'proxy' | 'fallback' | 'degraded';
    degradedReason: string;
    value: string;
    change1d: string;
    change7d: string;
    change30d: string;
    alertLevel: "normal" | "watch" | "alert";
    sparkline: string;
    note: string;
  }>;
  isFallback: boolean;
  error: string | null;
  completeness: number;
  degraded: boolean;
};

const PRIMARY_METRIC_ORDER = [
  'brent_usd_per_bbl',
  'jet_usd_per_l',
  'carbon_proxy_usd_per_t',
  'jet_eu_proxy_usd_per_l',
  'rotterdam_jet_fuel_usd_per_l',
  'eu_ets_price_eur_per_t',
  'germany_premium_pct'
] as const;

// LEGACY DISPLAY-ONLY BRIDGE — temporary mapping from canonical metric_key
// to the legacy source_detail key used in MarketSnapshot.source_details.
// This bridge is DISPLAY-ONLY. It must never be used for source/scope/status/
// confidence/lag decisions. Those fields come from SourceCoverageMetric.
// TODO: Remove once backend inlines display supplements (error, cbam_eur,
// note, etc.) into SourceCoverageMetric.
const SOURCE_DETAIL_KEY_BY_METRIC: Record<string, string> = {
  brent_usd_per_bbl: 'brent',
  jet_usd_per_l: 'jet',
  carbon_proxy_usd_per_t: 'carbon',
  jet_eu_proxy_usd_per_l: 'jet_eu_proxy',
  rotterdam_jet_fuel_usd_per_l: 'rotterdam_jet_fuel',
  eu_ets_price_eur_per_t: 'eu_ets',
  germany_premium_pct: 'germany_premium'
};

const SURFACE_LABELS: Record<string, string> = {
  brent_usd_per_bbl: 'Brent',
  jet_usd_per_l: 'Jet fuel',
  carbon_proxy_usd_per_t: 'Carbon proxy',
  jet_eu_proxy_usd_per_l: 'Jet fuel (EU proxy)',
  rotterdam_jet_fuel_usd_per_l: 'Rotterdam jet fuel',
  eu_ets_price_eur_per_t: 'EU ETS',
  germany_premium_pct: 'Germany premium'
};

function formatNumber(value: number, digits = 2) {
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function sourceLabel(raw?: string) {
  if (!raw) return "n/a";
  if (raw === "eia") return "EIA Daily Prices";
  if (raw === "fred") return "FRED";
  if (raw === "cbam+ecb") return "CBAM + ECB";
  if (raw === "ara-rotterdam-public") return "ARA/Rotterdam (public)";
  if (raw === "brent-derived") return "Brent-derived fallback";
  return raw;
}

function surfaceLabel(metricKey: string) {
  return SURFACE_LABELS[metricKey] ?? metricKey;
}

function statusLabel(raw?: string) {
  if (!raw) return "unknown";
  return raw;
}

function sourceTypeLabel(raw?: string): string {
  if (!raw) return 'unknown';
  if (raw === 'market_primary') return 'market primary';
  if (raw === 'public_proxy') return 'public proxy';
  if (raw === 'regulatory_proxy') return 'regulatory proxy';
  if (raw === 'derived') return 'derived proxy';
  if (raw === 'official') return 'official';
  return raw.replaceAll('_', ' ');
}

function trustStateFor(metric: SourceCoverageMetric): SourcesReadModel['rows'][number]['trustState'] {
  if (metric.fallback_used || metric.status === 'seed') return 'fallback';
  if (metric.status !== 'ok') return 'degraded';
  if (metric.source_type.includes('proxy') || metric.source_type === 'derived') return 'proxy';
  return 'live';
}

function formatLagMinutes(value?: number | null) {
  if (!Number.isFinite(value ?? NaN)) return "n/a";
  const minutes = Number(value);
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function formatChange(value?: number | null) {
  if (!Number.isFinite(value ?? NaN)) return "n/a";
  const numeric = Number(value);
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(2)}%`;
}

function computeAlertLevel(metric: MarketHistoryMetric | null): "normal" | "watch" | "alert" {
  if (!metric) return "normal";
  const candidates = [metric.change_pct_1d, metric.change_pct_7d, metric.change_pct_30d]
    .map((item) => Math.abs(Number(item)))
    .filter((item) => Number.isFinite(item));
  const peak = candidates.length ? Math.max(...candidates) : 0;
  if (peak >= 20) return "alert";
  if (peak >= 10) return "watch";
  return "normal";
}

function encodeSparklinePoints(points: Array<{ as_of: string; value: number }>, keep = 24) {
  const clean = points
    .map((point) => Number(point.value))
    .filter((value) => Number.isFinite(value));
  if (!clean.length) return "";
  const sliced = clean.slice(-keep);
  const min = Math.min(...sliced);
  const max = Math.max(...sliced);
  if (Math.abs(max - min) < 1e-9) {
    return sliced.map(() => "50").join(",");
  }
  return sliced
    .map((value) => {
      const ratio = ((value - min) / (max - min)) * 100;
      return Math.max(0, Math.min(100, Math.round(ratio))).toString();
    })
    .join(",");
}

function metricHistoryFor(history: MarketHistory | null, key: string): MarketHistoryMetric | null {
  if (!history?.metrics) return null;
  return history.metrics[key] ?? null;
}

function formatMetricValue(metricKey: string, value: number | undefined): string {
  if (!Number.isFinite(value ?? NaN)) {
    return 'n/a';
  }
  if (metricKey === 'brent_usd_per_bbl') {
    return `${formatNumber(Number(value))} USD/bbl`;
  }
  if (metricKey === 'germany_premium_pct') {
    return `${formatNumber(Number(value), 1)}%`;
  }
  if (metricKey === 'carbon_proxy_usd_per_t') {
    return `${formatNumber(Number(value))} USD/tCO2`;
  }
  if (metricKey === 'eu_ets_price_eur_per_t') {
    return `${formatNumber(Number(value))} EUR/tCO2`;
  }
  return `${formatNumber(Number(value), 3)} USD/L`;
}

// DISPLAY-ONLY SUPPLEMENT — fields that backend does not yet inline into
// SourceCoverageMetric but are useful for note rendering only.
// This type must never expand to include source/scope/status/confidence/lag.
type DisplaySupplement = {
  error?: string;
  note?: string;
  cbam_eur?: number;
  usd_per_eur?: number;
};

function extractDisplaySupplement(snapshot: MarketSnapshot, metricKey: string): DisplaySupplement | null {
  const detail = snapshot.source_details?.[metricKey] ?? snapshot.source_details?.[SOURCE_DETAIL_KEY_BY_METRIC[metricKey] ?? ''];
  if (!detail) {
    return null;
  }
  return {
    error: detail.error,
    note: detail.note,
    cbam_eur: detail.cbam_eur,
    usd_per_eur: detail.usd_per_eur
  };
}

function buildMetricNote(metric: SourceCoverageMetric, supplement?: DisplaySupplement | null): string {
  if (supplement?.error) {
    return supplement.error;
  }
  if (typeof supplement?.cbam_eur === 'number' && typeof supplement.usd_per_eur === 'number') {
    return `CBAM ${formatNumber(supplement.cbam_eur)} EUR × FX ${formatNumber(supplement.usd_per_eur, 4)}`;
  }
  const parts: string[] = [];
  if (supplement?.note) {
    parts.push(supplement.note);
  }
  if (metric.fallback_used) {
    parts.push('fallback');
  }
  return parts.join(' | ') || 'live';
}

function degradedReasonFor(metric: SourceCoverageMetric, supplement?: DisplaySupplement | null): string {
  if (supplement?.error) return supplement.error;
  if (metric.fallback_used && metric.status === 'seed') return 'seed fallback used because live coverage is not available';
  if (metric.fallback_used) return 'fallback path used for this metric';
  if (metric.status !== 'ok') return `source status is ${metric.status}`;
  if (metric.source_type.includes('proxy') || metric.source_type === 'derived') return 'derived or proxy metric; validate before high-stakes decisions';
  return 'live primary or official source with no degraded flag';
}

function buildSummary(rows: SourcesReadModel['rows'], completeness: number, degraded: boolean): SourcesReadModel['summary'] {
  const liveCount = rows.filter((row) => row.trustState === 'live').length;
  const proxyCount = rows.filter((row) => row.trustState === 'proxy').length;
  const fallbackCount = rows.filter((row) => row.trustState === 'fallback').length;
  const degradedCount = rows.filter((row) => row.trustState === 'degraded').length;
  const confidenceScores = rows.map((row) => row.confidenceScore).filter((value) => Number.isFinite(value));
  const averageConfidence = confidenceScores.length
    ? confidenceScores.reduce((sum, value) => sum + value, 0) / confidenceScores.length
    : 0;
  const lagMinutes = rows
    .map((row) => row.lagMinutes)
    .filter((value): value is number => Number.isFinite(value));
  const freshestLag = lagMinutes.length ? Math.min(...lagMinutes) : null;
  const freshnessLabel = freshestLag == null ? 'freshness unknown' : `freshest source ${formatLagMinutes(freshestLag)}`;
  const trustLabel = degraded || fallbackCount > 0 || degradedCount > 0
    ? 'decision support: verify degraded inputs'
    : proxyCount > 0
      ? 'decision support: proxy-aware'
      : 'decision support: live-source ready';
  const degradedReason = degraded
    ? `coverage completeness ${Math.round(completeness * 100)}%; ${fallbackCount} fallback, ${degradedCount} degraded`
    : fallbackCount > 0
      ? `${fallbackCount} metric${fallbackCount === 1 ? '' : 's'} use fallback values`
      : proxyCount > 0
        ? `${proxyCount} metric${proxyCount === 1 ? '' : 's'} are proxy or derived estimates`
        : 'all metrics are live primary or official sources';

  return {
    liveCount,
    proxyCount,
    fallbackCount,
    degradedCount,
    averageConfidence,
    freshnessLabel,
    trustLabel,
    degradedReason
  };
}

function sortCoverageMetrics(metrics: SourceCoverageMetric[]): SourceCoverageMetric[] {
  const order = new Map<string, number>(PRIMARY_METRIC_ORDER.map((metricKey, index) => [metricKey, index]));
  return [...metrics].sort((left, right) => {
    const leftOrder = order.get(left.metric_key) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = order.get(right.metric_key) ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.metric_key.localeCompare(right.metric_key);
  });
}

function buildRows(
  snapshot: MarketSnapshot,
  history: MarketHistory | null,
  coverageMetrics: SourceCoverageMetric[]
): SourcesReadModel['rows'] {
  return coverageMetrics.map((metric) => {
    const historyMetric = metricHistoryFor(history, metric.metric_key);
    const supplement = extractDisplaySupplement(snapshot, metric.metric_key);
    const snapshotValue = snapshot.values[metric.metric_key];

    return {
      surface: surfaceLabel(metric.metric_key),
      metricKey: metric.metric_key,
      source: sourceLabel(metric.source_name),
      sourceType: sourceTypeLabel(metric.source_type),
      scope: `${metric.region} · ${metric.market_scope}`,
      confidence: Number.isFinite(metric.confidence_score) ? metric.confidence_score.toFixed(2) : 'n/a',
      confidenceScore: Number.isFinite(metric.confidence_score) ? metric.confidence_score : 0,
      lag: formatLagMinutes(metric.lag_minutes),
      lagMinutes: Number.isFinite(metric.lag_minutes ?? NaN) ? Number(metric.lag_minutes) : null,
      status: statusLabel(metric.status),
      trustState: trustStateFor(metric),
      degradedReason: degradedReasonFor(metric, supplement),
      value: formatMetricValue(metric.metric_key, snapshotValue),
      change1d: formatChange(historyMetric?.change_pct_1d),
      change7d: formatChange(historyMetric?.change_pct_7d),
      change30d: formatChange(historyMetric?.change_pct_30d),
      alertLevel: computeAlertLevel(historyMetric),
      sparkline: encodeSparklinePoints(historyMetric?.points ?? []),
      note: buildMetricNote(metric, supplement)
    };
  });
}

function buildGenericFallbackCoverageMetrics(): SourceCoverageMetric[] {
  return PRIMARY_METRIC_ORDER.map((metricKey) => ({
    metric_key: metricKey,
    source_name: 'coverage unavailable',
    source_type: 'unknown',
    confidence_score: 0,
    lag_minutes: null,
    fallback_used: true,
    status: 'unknown',
    region: 'unknown',
    market_scope: 'coverage_unavailable'
  }));
}

function emptySnapshot(): MarketSnapshot {
  return {
    generated_at: new Date().toISOString(),
    source_status: { overall: 'degraded' },
    values: {},
    source_details: {}
  };
}

function fallback(
  error: unknown,
  snapshot: MarketSnapshot = emptySnapshot(),
  history: MarketHistory | null = null
): SourcesReadModel {
  const coverageMetrics = buildGenericFallbackCoverageMetrics();
  const rows = buildRows(snapshot, history, coverageMetrics);
  return {
    generatedAt: snapshot.generated_at,
    overallStatus: snapshot.source_status?.overall ?? 'degraded',
    coverageMetrics,
    summary: buildSummary(rows, 0, true),
    rows,
    isFallback: true,
    error: error instanceof Error ? error.message : "unknown error",
    completeness: 0.0,
    degraded: true
  };
}

export async function getSourcesReadModel(): Promise<SourcesReadModel> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let snapshotPayload: MarketSnapshot | undefined;
  let historyPayload: MarketHistory | null = null;
  try {
    const [snapshotResponse, historyResponse, coverageResponse] = await Promise.all([
      fetch(buildApiUrl("/market/snapshot"), {
        cache: "no-store",
        signal: controller.signal
      }),
      fetch(buildApiUrl("/market/history"), {
        cache: "no-store",
        signal: controller.signal
      }),
      fetch(buildApiUrl("/sources/coverage"), {
        cache: 'no-store',
        signal: controller.signal
      })
    ]);

    if (!snapshotResponse.ok) {
      throw new Error(`snapshot HTTP ${snapshotResponse.status}`);
    }

    snapshotPayload = (await snapshotResponse.json()) as MarketSnapshot;
    historyPayload = historyResponse.ok
      ? ((await historyResponse.json()) as MarketHistory)
      : null;
    const coveragePayload = coverageResponse.ok
      ? ((await coverageResponse.json()) as SourceCoverageResponse)
      : null;
    if (!coveragePayload?.metrics?.length) {
      throw new Error('coverage contract missing metrics');
    }
    const coverageMetrics = sortCoverageMetrics(coveragePayload.metrics);

    const completeness = coveragePayload?.completeness ?? (coverageMetrics.length / PRIMARY_METRIC_ORDER.length);
    const rows = buildRows(snapshotPayload, historyPayload, coverageMetrics);
    const degraded = coveragePayload?.degraded ?? completeness < 1.0;
    return {
      generatedAt: coveragePayload?.generated_at ?? snapshotPayload.generated_at,
      overallStatus: snapshotPayload.source_status?.overall ?? "unknown",
      coverageMetrics,
      summary: buildSummary(rows, completeness, degraded),
      rows,
      isFallback: false,
      error: null,
      completeness,
      degraded
    };
  } catch (error) {
    return fallback(error, snapshotPayload, historyPayload);
  } finally {
    clearTimeout(timeout);
  }
}
