import { buildApiUrl } from '@/lib/api-config';
import { toPathwayCostRow, type PathwayCostRow } from '@/lib/pathways-read-model';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

export type MarketSourceDetail = {
  source: string;
  status: string;
  value?: number | null;
  quality?: string | null;
  freshness?: string | null;
  quote_kind?: string | null;
  product_id?: string | null;
  observed_at?: string | null;
  as_of?: string | null;
  method?: string | null;
  unit?: string | null;
  published_at?: string | null;
  fetched_at?: string | null;
  fallback_used?: boolean | null;
  lag_minutes?: number | null;
  input_observed_at?: Record<string, string | null | undefined> | null;
  note?: string | null;
};

export type MarketSnapshot = {
  generated_at: string | null;
  fetched_at?: string | null;
  source_status: {
    overall: string;
    confidence?: number | null;
    freshness_minutes?: number | null;
    fallback_rate?: number | null;
    is_fallback?: boolean | null;
    quote_coverage_rate?: number | null;
    fetched_at?: string | null;
  };
  values: Record<string, number | null | undefined>;
  source_details?: Record<string, MarketSourceDetail>;
  assumptions?: Record<
    string,
    { value: number; unit: string; kind: 'assumption'; as_of: string; note?: string | null }
  >;
  derived?: Record<string, number | string>;
};

export type ReserveSignal = {
  generated_at: string;
  region: string;
  coverage_days: number;
  coverage_weeks: number;
  stress_level: string;
  estimated_supply_gap_pct: number | null;
  source_type: string;
  source_name: string;
  confidence_score: number;
};

/** Wire shape from `/analysis/tipping-point` JSON — bare numbers, not Figures. */
export type TippingPointPathway = {
  pathway_key: string;
  display_name: string;
  net_cost_low_usd_per_l: number;
  net_cost_high_usd_per_l: number;
  spread_low_pct: number;
  spread_high_pct: number;
  status: string;
  allowance_coverage_pct?: number;
  allowance_category_assumed?: boolean;
};

export type SafAllowanceMode = 'none' | 'statutory' | 'remote_airport';
export const SAF_ALLOWANCE_MODES: readonly SafAllowanceMode[] = ['none', 'statutory', 'remote_airport'];

// EU ETS SAF allowance rules behind the toggle (API SafAllowanceBasis).
export type SafAllowanceBasis = {
  legal_basis_name: string;
  legal_basis_url: string;
  period: string;
  reserve_allowances: number;
  rates_pct: Record<string, number>;
  latest_fuel_year: number;
  latest_published_at: string;
  latest_allowances: number;
  latest_value_eur: number;
  latest_saf_tonnes: number;
  latest_source_name: string;
  latest_source_url: string;
};

export type TippingPointReadModel = {
  generatedAt: string | null;
  effectiveFossilJetUsdPerL: number;
  signal: string;
  inputs: {
    fossilJetUsdPerL: number;
    carbonPriceEurPerT: number;
    subsidyUsdPerL: number;
    blendRatePct: number;
  };
  pathways: PathwayCostRow[];
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
  fare_pass_through_pct?: number | null;
  labor_cost_impact_eur_m?: number | null;
  extra_fuel_cost_eur_m?: number | null;
  residual_fuel_cost_exposure?: number | null;
};

export type TippingPointResponse = {
  generated_at: string | null;
  inputs: {
    fossil_jet_usd_per_l: number;
    carbon_price_eur_per_t: number;
    subsidy_usd_per_l: number;
    blend_rate_pct: number;
    saf_allowance?: SafAllowanceMode;
  };
  effective_fossil_jet_usd_per_l: number;
  pathways: TippingPointPathway[];
  market_check?: SafMarketCheck | null;
  saf_allowance?: SafAllowanceBasis | null;
  signal: string;
  signal_basis?: 'market_reference' | 'production_cost';
};

// Dated SAF purchase price vs fossil jet plus its EU ETS cost (API SafMarketCheck).
export type SafMarketCheck = {
  reference_id: string;
  kind: string;
  region: string;
  period: string;
  published_at: string;
  source_name: string;
  source_url: string;
  pathway_key: string;
  saf_eur_per_t: number;
  saf_usd_per_l: number;
  fossil_with_ets_usd_per_l: number;
  premium_pct: number;
  status: 'competitive' | 'inflection' | 'premium';
  allowance_coverage_pct?: number;
  allowance_support_usd_per_l?: number;
  statutory_allowance_coverage_pct?: number | null;
  statutory_allowance_premium_pct?: number | null;
};

export type AirlineDecisionResponse = {
  generated_at: string | null;
  inputs: {
    fossil_jet_usd_per_l: number;
    reserve_weeks: number;
    carbon_price_eur_per_t: number;
    pathway_key: string;
    fare_pass_through_pct?: number | null;
    labor_cost_impact_eur_m?: number | null;
    extra_fuel_cost_eur_m?: number | null;
  };
  signal: string;
  probabilities: {
    raise_fares: number;
    cut_capacity: number;
    buy_spot_saf: number;
    sign_long_term_offtake: number;
    ground_routes: number;
  };
  fare_pass_through_pct?: number | null;
  labor_cost_impact_eur_m?: number | null;
  extra_fuel_cost_eur_m?: number | null;
  residual_fuel_cost_exposure?: number | null;
};

export type MarketHistoryMetric = {
  metric_key: string;
  unit: string;
  latest_value?: number | null;
  latest_as_of?: string | null;
  change_pct_1d?: number | null;
  change_pct_7d?: number | null;
  change_pct_30d?: number | null;
  quality?: string | null;
  points?: Array<{ as_of: string; value: number; quality?: string | null; source?: string | null }>;
};

export type MarketHistory = {
  generated_at?: string;
  metrics: Record<string, MarketHistoryMetric>;
};

export async function fetchJson<T>(path: string, options: { fresh?: boolean } = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.JETSCOPE_MARKET_FETCH_TIMEOUT_MS ?? DEFAULT_FETCH_TIMEOUT_MS);
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) && timeoutMs >= 100 ? timeoutMs : DEFAULT_FETCH_TIMEOUT_MS
  );
  try {
    const cacheOptions = options.fresh
      ? { cache: 'no-store' as const }
      : { next: { revalidate: 300 } };
    const response = await fetch(buildApiUrl(path), { ...cacheOptions, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export type DisplayLocale = 'zh' | 'de' | 'en';

export function metricLabel(metric: string, locale: DisplayLocale = 'zh'): string {
  if (metric === 'brent_usd_per_bbl') return 'Brent';
  if (metric === 'jet_usd_per_l') {
    if (locale === 'de') return 'Jet-Fuel';
    if (locale === 'en') return 'Jet fuel';
    return '航煤';
  }
  if (metric === 'rotterdam_jet_fuel_usd_per_l') {
    if (locale === 'de') return 'Rotterdam Jet';
    if (locale === 'en') return 'Rotterdam jet';
    return '鹿特丹航煤';
  }
  if (metric === 'jet_eu_proxy_usd_per_l') {
    if (locale === 'de') return 'EU-Jet-Proxy';
    if (locale === 'en') return 'EU jet proxy';
    return '航煤（欧盟代理）';
  }
  if (metric === 'carbon_proxy_usd_per_t') {
    if (locale === 'de') return 'Carbon-Proxy';
    if (locale === 'en') return 'Carbon proxy';
    return '碳价代理';
  }
  return metric;
}

export function finiteNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'boolean') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function resolveSnapshotMetric(
  values: Record<string, number | null | undefined>,
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
  const asOf = response.generated_at ?? null;
  const pathwayOpts = asOf
    ? ({
        asOf: null,
        basis: 'observed' as const,
        method: 'EASA 2025 production-cost estimate, minus support (not a market print)'
      })
    : ({
        asOf: null,
        basis: 'assumption' as const,
        method: 'tipping-point pathway cost without source timestamp'
      });
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
    pathways: (response.pathways ?? []).map((row) => toPathwayCostRow(row, pathwayOpts)),
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
    fare_pass_through_pct: response.fare_pass_through_pct ?? null,
    labor_cost_impact_eur_m: response.labor_cost_impact_eur_m ?? null,
    extra_fuel_cost_eur_m: response.extra_fuel_cost_eur_m ?? null,
    residual_fuel_cost_exposure: response.residual_fuel_cost_exposure ?? null,
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
