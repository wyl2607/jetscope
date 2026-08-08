import { buildApiUrl } from '@/lib/api-config';
import { assumed, derived, observed, type Figure } from '@/lib/figure';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;
const PATHWAY_COST_SOURCE_ID = 'pathways-read-model';

/**
 * Pathway net-cost band carried as Figures (UI_CONTRACT.md §3).
 * Low/high are an uncertainty range — two independent Figures, not one pair.
 */
export type PathwayCostRow = {
  pathway_key: string;
  display_name: string;
  netCostLow: Figure; // unit 'USD/L'
  netCostHigh: Figure; // unit 'USD/L'
  spreadLow: Figure; // unit '%'
  spreadHigh: Figure; // unit '%'
  status: string;
};

type PathwayCostWire = {
  pathway_key: string;
  display_name: string;
  net_cost_low_usd_per_l: number;
  net_cost_high_usd_per_l: number;
  spread_low_pct: number;
  spread_high_pct: number;
  status: string;
};

/**
 * Sole constructor for pathway cost rows. Page adapters call this; JSX call
 * sites must not assemble Figures inline.
 */
export function toPathwayCostRow(
  input: PathwayCostWire,
  opts: {
    asOf: string | null;
    basis: 'observed' | 'assumption';
    method?: string;
    sourceId?: string;
  }
): PathwayCostRow {
  const sourceId = opts.sourceId ?? PATHWAY_COST_SOURCE_ID;

  const costFigure = (value: number): Figure => {
    if (opts.basis === 'assumption') {
      return assumed({
        value,
        unit: 'USD/L',
        sourceId,
        precision: 2,
        method: opts.method ?? 'scenario or demo pathway cost constant'
      });
    }
    if (opts.asOf) {
      return observed({
        value,
        unit: 'USD/L',
        sourceId,
        precision: 2,
        asOf: opts.asOf
      });
    }
    // Observed intent without a source timestamp — cannot call observed().
    return derived({
      value,
      unit: 'USD/L',
      sourceId,
      precision: 2,
      asOf: null,
      method: opts.method ?? 'pathway cost from API without source timestamp'
    });
  };

  const spreadFigure = (value: number): Figure => {
    if (opts.basis === 'assumption') {
      return assumed({
        value,
        unit: '%',
        sourceId,
        precision: 1,
        method: opts.method ?? 'scenario or demo pathway spread constant'
      });
    }
    if (opts.asOf) {
      return observed({
        value,
        unit: '%',
        sourceId,
        precision: 1,
        asOf: opts.asOf
      });
    }
    return derived({
      value,
      unit: '%',
      sourceId,
      precision: 1,
      asOf: null,
      method: opts.method ?? 'pathway spread from API without source timestamp'
    });
  };

  return {
    pathway_key: input.pathway_key,
    display_name: input.display_name,
    netCostLow: costFigure(input.net_cost_low_usd_per_l),
    netCostHigh: costFigure(input.net_cost_high_usd_per_l),
    spreadLow: spreadFigure(input.spread_low_pct),
    spreadHigh: spreadFigure(input.spread_high_pct),
    status: input.status
  };
}

export type PathwayComparisonStatus =
  | 'below_fossil'
  | 'competitive'
  | 'inflection'
  | 'premium'
  | 'not_computable';

export type PathwayComparisonSignal =
  | 'clear_leader'
  | 'close_race'
  | 'no_advantage'
  | 'insufficient_data';

export type PathwaySourceMeta = {
  source_type: string;
  confidence_score: number;
  cadence: string;
  updated_at: string;
  fallback_used: boolean;
};

export type PathwayComparisonRow = {
  pathway_key: string;
  name: string;
  min_usd_per_l: number;
  max_usd_per_l: number;
  midpoint_usd_per_l: number;
  carbon_reduction_pct: number;
  maturity_level: string;
  effective_saf_cost_usd_per_l: number;
  gap_vs_fossil_usd_per_l: number;
  spread_pct: number | null;
  status: PathwayComparisonStatus;
  source: PathwaySourceMeta;
};

export type PathwayCarbonSweepPoint = {
  carbon_price_eur_per_t: number;
  pathways: Array<{ pathway_key: string; effective_saf_cost_usd_per_l: number }>;
};

export type PathwayComparisonResponse = {
  generated_at: string;
  inputs: {
    fossil_jet_usd_per_l: number;
    carbon_price_eur_per_t: number;
    subsidy_usd_per_l: number;
    blend_rate_pct: number;
  };
  fossil_jet_usd_per_l: number;
  rows: PathwayComparisonRow[];
  carbon_sweep: PathwayCarbonSweepPoint[];
  signal: PathwayComparisonSignal;
};

export type PathwaySourceView = {
  sourceType: string;
  confidencePct: number;
  confidenceLabel: string;
  freshnessLabel: string;
  fallbackUsed: boolean;
};

export type PathwayComparisonViewModel = {
  generatedAt: string;
  fossilJetUsdPerL: number;
  signal: PathwayComparisonSignal;
  signalLabel: string;
  rows: PathwayComparisonRow[];
  sourceByKey: Record<string, PathwaySourceView>;
  sweep: PathwayCarbonSweepPoint[];
};

const SIGNAL_LABELS: Record<PathwayComparisonSignal, string> = {
  clear_leader: '明确领先',
  close_race: '势均力敌',
  no_advantage: '暂无优势',
  insufficient_data: '数据不足'
};

export function signalLabel(signal: PathwayComparisonSignal): string {
  return SIGNAL_LABELS[signal] ?? signal;
}

export function confidenceLabel(score: number): string {
  if (score >= 0.75) return '高';
  if (score >= 0.6) return '中';
  return '低';
}

export function freshnessLabel(updatedAt: string, cadence: string): string {
  return `${updatedAt} · ${cadence}`;
}

export function toSourceView(source: PathwaySourceMeta): PathwaySourceView {
  return {
    sourceType: source.source_type,
    confidencePct: Math.round(source.confidence_score * 100),
    confidenceLabel: confidenceLabel(source.confidence_score),
    freshnessLabel: freshnessLabel(source.updated_at, source.cadence),
    fallbackUsed: source.fallback_used
  };
}

export function mapComparisonToView(response: PathwayComparisonResponse): PathwayComparisonViewModel {
  const sourceByKey: Record<string, PathwaySourceView> = {};
  for (const row of response.rows) {
    sourceByKey[row.pathway_key] = toSourceView(row.source);
  }
  return {
    generatedAt: response.generated_at,
    fossilJetUsdPerL: response.fossil_jet_usd_per_l,
    signal: response.signal,
    signalLabel: signalLabel(response.signal),
    rows: response.rows,
    sourceByKey,
    sweep: response.carbon_sweep
  };
}

export type PathwayComparisonQuery = {
  fossilJetUsdPerL: number;
  carbonPriceEurPerT?: number;
  subsidyUsdPerL?: number;
  blendRatePct?: number;
  carbonSweepMax?: number;
  carbonSweepStep?: number;
};

export async function loadPathwayComparison(
  query: PathwayComparisonQuery,
  options: { timeoutMs?: number } = {}
): Promise<PathwayComparisonViewModel> {
  const params = new URLSearchParams({
    fossil_jet_usd_per_l: String(query.fossilJetUsdPerL)
  });
  if (query.carbonPriceEurPerT !== undefined) params.set('carbon_price_eur_per_t', String(query.carbonPriceEurPerT));
  if (query.subsidyUsdPerL !== undefined) params.set('subsidy_usd_per_l', String(query.subsidyUsdPerL));
  if (query.blendRatePct !== undefined) params.set('blend_rate_pct', String(query.blendRatePct));
  if (query.carbonSweepMax !== undefined) params.set('carbon_sweep_max', String(query.carbonSweepMax));
  if (query.carbonSweepStep !== undefined) params.set('carbon_sweep_step', String(query.carbonSweepStep));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${buildApiUrl('/pathways/compare')}?${params.toString()}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`pathway comparison request failed: ${res.status}`);
    }
    const body = (await res.json()) as PathwayComparisonResponse;
    return mapComparisonToView(body);
  } finally {
    clearTimeout(timeout);
  }
}
