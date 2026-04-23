import { buildApiUrl } from '@/lib/api-config';

type SourceEntry = {
  source?: string;
  status?: string;
  value?: number;
  error?: string;
  note?: string;
  region?: string;
  market_scope?: string;
  lag_minutes?: number | null;
  confidence_score?: number;
  fallback_used?: boolean;
  cbam_eur?: number;
  usd_per_eur?: number;
};

type MarketSnapshot = {
  generated_at: string;
  source_status: { overall: string };
  values: Record<string, number>;
  source_details?: Record<string, SourceEntry>;
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
  rows: Array<{
    surface: string;
    metricKey: string;
    source: string;
    scope: string;
    confidence: string;
    lag: string;
    status: string;
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
};

const FALLBACK_ROWS: SourcesReadModel["rows"] = [
  {
    surface: "Brent",
    metricKey: "brent_usd_per_bbl",
    source: "FRED / EIA",
    scope: "global · benchmark",
    confidence: "0.70",
    lag: "n/a",
    status: "seed",
    value: "114.93 USD/bbl",
    change1d: "n/a",
    change7d: "n/a",
    change30d: "n/a",
    alertLevel: "normal",
    sparkline: "",
    note: "Fallback baseline"
  },
  {
    surface: "Jet fuel",
    metricKey: "jet_usd_per_l",
    source: "FRED Gulf Coast",
    scope: "us · statistical_series",
    confidence: "0.70",
    lag: "n/a",
    status: "seed",
    value: "0.99 USD/L",
    change1d: "n/a",
    change7d: "n/a",
    change30d: "n/a",
    alertLevel: "normal",
    sparkline: "",
    note: "Fallback baseline"
  },
  {
    surface: "Carbon proxy",
    metricKey: "carbon_proxy_usd_per_t",
    source: "CBAM + ECB FX",
    scope: "eu · regulatory_proxy",
    confidence: "0.70",
    lag: "n/a",
    status: "seed",
    value: "88.79 USD/tCO2",
    change1d: "n/a",
    change7d: "n/a",
    change30d: "n/a",
    alertLevel: "normal",
    sparkline: "",
    note: "Fallback baseline"
  },
  {
    surface: "Jet fuel (EU proxy)",
    metricKey: "jet_eu_proxy_usd_per_l",
    source: "Derived from Brent",
    scope: "eu · derived_proxy",
    confidence: "0.65",
    lag: "n/a",
    status: "seed",
    value: "0.99 USD/L",
    change1d: "n/a",
    change7d: "n/a",
    change30d: "n/a",
    alertLevel: "normal",
    sparkline: "",
    note: "Fallback baseline"
  }
];

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

function statusLabel(raw?: string) {
  if (!raw) return "unknown";
  return raw;
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

function buildRows(snapshot: MarketSnapshot, history: MarketHistory | null): SourcesReadModel["rows"] {
  const details = snapshot.source_details ?? {};
  const brent = details.brent ?? {};
  const jet = details.jet ?? {};
  const carbon = details.carbon ?? {};
  const jetEuProxy = details.jet_eu_proxy ?? {};
  const brentHistory = metricHistoryFor(history, "brent_usd_per_bbl");
  const jetHistory = metricHistoryFor(history, "jet_usd_per_l");
  const carbonHistory = metricHistoryFor(history, "carbon_proxy_usd_per_t");
  const jetEuProxyHistory = metricHistoryFor(history, "jet_eu_proxy_usd_per_l");

  return [
    {
      surface: "Brent",
      metricKey: "brent_usd_per_bbl",
      source: sourceLabel(brent.source),
      scope: `${brent.region ?? "unknown"} · ${brent.market_scope ?? "unknown"}`,
      confidence: Number.isFinite(brent.confidence_score ?? NaN)
        ? Number(brent.confidence_score).toFixed(2)
        : "n/a",
      lag: formatLagMinutes(brent.lag_minutes),
      status: statusLabel(brent.status),
      value: `${formatNumber(snapshot.values.brent_usd_per_bbl)} USD/bbl`,
      change1d: formatChange(brentHistory?.change_pct_1d),
      change7d: formatChange(brentHistory?.change_pct_7d),
      change30d: formatChange(brentHistory?.change_pct_30d),
      alertLevel: computeAlertLevel(brentHistory),
      sparkline: encodeSparklinePoints(brentHistory?.points ?? []),
      note: brent.error ?? `${brent.note ?? "live"}${brent.fallback_used ? " | fallback" : ""}`
    },
    {
      surface: "Jet fuel",
      metricKey: "jet_usd_per_l",
      source: sourceLabel(jet.source),
      scope: `${jet.region ?? "unknown"} · ${jet.market_scope ?? "unknown"}`,
      confidence: Number.isFinite(jet.confidence_score ?? NaN)
        ? Number(jet.confidence_score).toFixed(2)
        : "n/a",
      lag: formatLagMinutes(jet.lag_minutes),
      status: statusLabel(jet.status),
      value: `${formatNumber(snapshot.values.jet_usd_per_l, 3)} USD/L`,
      change1d: formatChange(jetHistory?.change_pct_1d),
      change7d: formatChange(jetHistory?.change_pct_7d),
      change30d: formatChange(jetHistory?.change_pct_30d),
      alertLevel: computeAlertLevel(jetHistory),
      sparkline: encodeSparklinePoints(jetHistory?.points ?? []),
      note: jet.error ?? `${jet.note ?? "live"}${jet.fallback_used ? " | fallback" : ""}`
    },
    {
      surface: "Carbon proxy",
      metricKey: "carbon_proxy_usd_per_t",
      source: sourceLabel(carbon.source),
      scope: `${carbon.region ?? "unknown"} · ${carbon.market_scope ?? "unknown"}`,
      confidence: Number.isFinite(carbon.confidence_score ?? NaN)
        ? Number(carbon.confidence_score).toFixed(2)
        : "n/a",
      lag: formatLagMinutes(carbon.lag_minutes),
      status: statusLabel(carbon.status),
      value: `${formatNumber(snapshot.values.carbon_proxy_usd_per_t)} USD/tCO2`,
      change1d: formatChange(carbonHistory?.change_pct_1d),
      change7d: formatChange(carbonHistory?.change_pct_7d),
      change30d: formatChange(carbonHistory?.change_pct_30d),
      alertLevel: computeAlertLevel(carbonHistory),
      sparkline: encodeSparklinePoints(carbonHistory?.points ?? []),
      note:
        carbon.error ??
        (typeof carbon.cbam_eur === "number" && typeof carbon.usd_per_eur === "number"
          ? `CBAM ${formatNumber(carbon.cbam_eur)} EUR × FX ${formatNumber(carbon.usd_per_eur, 4)}`
          : `${carbon.note ?? "live"}${carbon.fallback_used ? " | fallback" : ""}`)
    },
    {
      surface: "Jet fuel (EU proxy)",
      metricKey: "jet_eu_proxy_usd_per_l",
      source: sourceLabel(jetEuProxy.source),
      scope: `${jetEuProxy.region ?? "eu"} · ${jetEuProxy.market_scope ?? "derived_proxy"}`,
      confidence: Number.isFinite(jetEuProxy.confidence_score ?? NaN)
        ? Number(jetEuProxy.confidence_score).toFixed(2)
        : "0.65",
      lag: formatLagMinutes(jetEuProxy.lag_minutes),
      status: statusLabel(jetEuProxy.status ?? "derived"),
      value: `${formatNumber(snapshot.values.jet_eu_proxy_usd_per_l ?? snapshot.values.jet_usd_per_l, 3)} USD/L`,
      change1d: formatChange(jetEuProxyHistory?.change_pct_1d),
      change7d: formatChange(jetEuProxyHistory?.change_pct_7d),
      change30d: formatChange(jetEuProxyHistory?.change_pct_30d),
      alertLevel: computeAlertLevel(jetEuProxyHistory),
      sparkline: encodeSparklinePoints(jetEuProxyHistory?.points ?? []),
      note:
        jetEuProxy.error ??
        `${jetEuProxy.note ?? "ARA/Rotterdam primary feed with Brent-derived fallback"}${jetEuProxy.fallback_used ? " | fallback" : ""}`
    }
  ];
}

function fallback(error: unknown): SourcesReadModel {
  return {
    generatedAt: new Date().toISOString(),
    overallStatus: "degraded",
    rows: FALLBACK_ROWS,
    isFallback: true,
    error: error instanceof Error ? error.message : "unknown error"
  };
}

export async function getSourcesReadModel(): Promise<SourcesReadModel> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const [snapshotResponse, historyResponse] = await Promise.all([
      fetch(buildApiUrl("/market/snapshot"), {
        cache: "no-store",
        signal: controller.signal
      }),
      fetch(buildApiUrl("/market/history"), {
        cache: "no-store",
        signal: controller.signal
      })
    ]);

    if (!snapshotResponse.ok) {
      throw new Error(`snapshot HTTP ${snapshotResponse.status}`);
    }

    const snapshotPayload = (await snapshotResponse.json()) as MarketSnapshot;
    const historyPayload = historyResponse.ok
      ? ((await historyResponse.json()) as MarketHistory)
      : null;

    return {
      generatedAt: snapshotPayload.generated_at,
      overallStatus: snapshotPayload.source_status?.overall ?? "unknown",
      rows: buildRows(snapshotPayload, historyPayload),
      isFallback: false,
      error: null
    };
  } catch (error) {
    return fallback(error);
  } finally {
    clearTimeout(timeout);
  }
}
