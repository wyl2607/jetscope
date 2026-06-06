import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

export type GridParityStatus = 'uneconomic' | 'inflection' | 'marginal_switch' | 'dominant';
export type GridParitySignal = 'clear_leader' | 'close_race' | 'no_advantage';

export type FossilReference = {
  plant_key: string;
  name: string;
  efficiency: number;
  fuel_cost_eur_per_mwh_th: number;
  var_o_m_eur_per_mwh: number;
  emission_intensity_t_per_mwh: number;
  marginal_cost_eur_per_mwh: number;
};

export type GridParityRow = {
  tech_key: string;
  name: string;
  lcoe_mid_eur_per_mwh: number;
  maturity_level: string;
  gap_vs_fossil_eur_per_mwh: number;
  spread_pct: number;
  status: GridParityStatus;
};

export type GridCarbonSweepPoint = {
  carbon_price_eur_per_t: number;
  fossil_marginal_cost_eur_per_mwh: number;
  techs: Array<{ tech_key: string; gap_vs_fossil_eur_per_mwh: number; status: GridParityStatus }>;
};

export type GridParityResponse = {
  generated_at: string;
  inputs: {
    carbon_price_eur_per_t: number;
    gas_fuel_eur_per_mwh_th: number;
    coal_fuel_eur_per_mwh_th: number;
    fossil_reference_key: string;
  };
  fossil_reference: FossilReference;
  rows: GridParityRow[];
  carbon_sweep: GridCarbonSweepPoint[];
  signal: GridParitySignal;
};

export type GridHistoryPoint = {
  year: number;
  carbon_price_eur_per_t: number;
  fossil_marginal_cost_eur_per_mwh: number;
  solar_lcoe_eur_per_mwh: number;
  solar_gap_eur_per_mwh: number;
  status: GridParityStatus;
  source: string;
  confidence: number;
  fallback: boolean;
};

export type GridHistoryResponse = {
  generated_at: string;
  region: string;
  disclaimer: string;
  points: GridHistoryPoint[];
};

export type GridLcoeSensitivityCell = {
  discount_rate: number;
  full_load_hours: number;
  lcoe_eur_per_mwh: number;
  breakeven_carbon_price_eur_per_t: number;
};

export type GridLcoeSensitivityResponse = {
  generated_at: string;
  tech_key: string;
  tech_name: string;
  fossil_reference_key: string;
  discount_rates: number[];
  full_load_hours: number[];
  cells: GridLcoeSensitivityCell[];
  disclaimer: string;
};

const STATUS_LABELS: Record<GridParityStatus, string> = {
  uneconomic: '不经济',
  inflection: '拐点临近',
  marginal_switch: '临界切换',
  dominant: '清洁占优'
};

const SIGNAL_LABELS: Record<GridParitySignal, string> = {
  clear_leader: '清洁能源明确领先',
  close_race: '势均力敌',
  no_advantage: '清洁能源暂无优势'
};

const STATUS_TONES: Record<GridParityStatus, string> = {
  uneconomic: 'border-rose-200 bg-rose-50 text-rose-700',
  inflection: 'border-amber-200 bg-amber-50 text-amber-800',
  marginal_switch: 'border-sky-200 bg-sky-50 text-sky-800',
  dominant: 'border-emerald-200 bg-emerald-50 text-emerald-800'
};

export function gridStatusLabel(status: GridParityStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function gridSignalLabel(signal: GridParitySignal): string {
  return SIGNAL_LABELS[signal] ?? signal;
}

export function gridStatusTone(status: GridParityStatus): string {
  return STATUS_TONES[status] ?? STATUS_TONES.inflection;
}

export type GridParityQuery = {
  carbonPriceEurPerT?: number;
  gasFuelEurPerMwhTh?: number;
  coalFuelEurPerMwhTh?: number;
  fossilReferenceKey?: string;
};

export type GridLcoeSensitivityQuery = {
  techKey?: string;
  fossilReferenceKey?: string;
  gasFuelEurPerMwhTh?: number;
};

function buildGridEndpoint(apiPath: string, proxyPath: string): string {
  return typeof window === 'undefined' ? buildApiUrl(apiPath) : proxyPath;
}

function buildGridParityUrl(query: GridParityQuery): string {
  const params = new URLSearchParams();
  if (query.carbonPriceEurPerT !== undefined) params.set('carbon_price_eur_per_t', String(query.carbonPriceEurPerT));
  if (query.gasFuelEurPerMwhTh !== undefined) params.set('gas_fuel_eur_per_mwh_th', String(query.gasFuelEurPerMwhTh));
  if (query.coalFuelEurPerMwhTh !== undefined) params.set('coal_fuel_eur_per_mwh_th', String(query.coalFuelEurPerMwhTh));
  if (query.fossilReferenceKey !== undefined) params.set('fossil_reference_key', query.fossilReferenceKey);
  const qs = params.toString();
  const path = buildGridEndpoint('/analysis/grid-parity', '/api/analysis/grid-parity');
  return qs ? `${path}?${qs}` : path;
}

function buildGridLcoeSensitivityUrl(query: GridLcoeSensitivityQuery): string {
  const params = new URLSearchParams();
  if (query.techKey !== undefined) params.set('tech_key', query.techKey);
  if (query.fossilReferenceKey !== undefined) params.set('fossil_reference_key', query.fossilReferenceKey);
  if (query.gasFuelEurPerMwhTh !== undefined) params.set('gas_fuel_eur_per_mwh_th', String(query.gasFuelEurPerMwhTh));
  const qs = params.toString();
  const path = buildGridEndpoint(
    '/analysis/grid-parity/lcoe-sensitivity',
    '/api/analysis/grid-parity/lcoe-sensitivity'
  );
  return qs ? `${path}?${qs}` : path;
}

export async function loadGridParity(
  query: GridParityQuery = {},
  options: { timeoutMs?: number } = {}
): Promise<GridParityResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(buildGridParityUrl(query), {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`grid-parity request failed: ${res.status}`);
    }
    return (await res.json()) as GridParityResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadGridHistory(
  options: { timeoutMs?: number } = {}
): Promise<GridHistoryResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(buildGridEndpoint('/analysis/grid-parity/history', '/api/analysis/grid-parity/history'), {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`grid-parity history request failed: ${res.status}`);
    }
    return (await res.json()) as GridHistoryResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadGridLcoeSensitivity(
  query: GridLcoeSensitivityQuery = {},
  options: { timeoutMs?: number } = {}
): Promise<GridLcoeSensitivityResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(buildGridLcoeSensitivityUrl(query), {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`lcoe-sensitivity request failed: ${res.status}`);
    }
    return (await res.json()) as GridLcoeSensitivityResponse;
  } finally {
    clearTimeout(timeout);
  }
}
