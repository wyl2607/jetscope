import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

export type EuEtsPressureSignal = 'low' | 'moderate' | 'high' | 'severe';

export type EuEtsPressurePoint = {
  eu_ets_eur_per_t: number;
  carbon_cost_usd_per_l: number;
  effective_fossil_jet_usd_per_l: number;
  pressure_pct: number | null;
};

export type EuEtsPressureSource = {
  source_type: string;
  confidence_score: number;
  cadence: string;
  updated_at: string;
  fallback_used: boolean;
};

export type EuEtsPressureResponse = {
  generated_at: string;
  inputs: {
    fossil_jet_usd_per_l: number;
    exempt_blend_pct: number;
    eu_ets_min: number;
    eu_ets_max: number;
    eu_ets_step: number;
  };
  points: EuEtsPressurePoint[];
  source: EuEtsPressureSource;
  signal: EuEtsPressureSignal;
};

export type EuEtsPressureViewModel = {
  generatedAt: string;
  signal: EuEtsPressureSignal;
  signalLabel: string;
  peakPressurePct: number | null;
  points: EuEtsPressurePoint[];
  source: EuEtsPressureSource;
};

const SIGNAL_LABELS: Record<EuEtsPressureSignal, string> = {
  low: '低压力',
  moderate: '中等压力',
  high: '高压力',
  severe: '严峻压力'
};

export function signalLabel(signal: EuEtsPressureSignal): string {
  return SIGNAL_LABELS[signal] ?? signal;
}

export function mapPressureToView(response: EuEtsPressureResponse): EuEtsPressureViewModel {
  const pressures = response.points
    .map((point) => point.pressure_pct)
    .filter((value): value is number => value !== null);
  return {
    generatedAt: response.generated_at,
    signal: response.signal,
    signalLabel: signalLabel(response.signal),
    peakPressurePct: pressures.length ? Math.max(...pressures) : null,
    points: response.points,
    source: response.source
  };
}

export type EuEtsPressureQuery = {
  fossilJetUsdPerL: number;
  exemptBlendPct?: number;
  euEtsMin?: number;
  euEtsMax?: number;
  euEtsStep?: number;
};

export async function loadEuEtsPressure(
  query: EuEtsPressureQuery,
  options: { timeoutMs?: number } = {}
): Promise<EuEtsPressureViewModel> {
  const params = new URLSearchParams({ fossil_jet_usd_per_l: String(query.fossilJetUsdPerL) });
  if (query.exemptBlendPct !== undefined) params.set('exempt_blend_pct', String(query.exemptBlendPct));
  if (query.euEtsMin !== undefined) params.set('eu_ets_min', String(query.euEtsMin));
  if (query.euEtsMax !== undefined) params.set('eu_ets_max', String(query.euEtsMax));
  if (query.euEtsStep !== undefined) params.set('eu_ets_step', String(query.euEtsStep));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${buildApiUrl('/policies/eu-ets-pressure')}?${params.toString()}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`eu-ets pressure request failed: ${res.status}`);
    }
    return mapPressureToView((await res.json()) as EuEtsPressureResponse);
  } finally {
    clearTimeout(timeout);
  }
}
