import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

export type HeatParityStatus = 'uneconomic' | 'inflection' | 'marginal_switch' | 'dominant';
export type HeatParitySignal = 'clear_leader' | 'close_race' | 'no_advantage';

export type HeatPumpReference = {
  tech_key: string;
  name: string;
  cop: number;
};

export type GasBoilerReference = {
  name: string;
  efficiency: number;
  gas_price_eur_per_mwh_th: number;
  emission_intensity_t_per_mwh_th: number;
  heat_cost_eur_per_mwh: number;
};

export type HeatParityRow = {
  tech_key: string;
  name: string;
  cop: number;
  hp_heat_cost_eur_per_mwh: number;
  gas_heat_cost_eur_per_mwh: number;
  gap_vs_gas_eur_per_mwh: number;
  spread_pct: number;
  breakeven_carbon_price_eur_per_t: number;
  status: HeatParityStatus;
};

export type HeatCarbonSweepPoint = {
  carbon_price_eur_per_t: number;
  gas_heat_cost_eur_per_mwh: number;
  techs: Array<{ tech_key: string; gap_vs_gas_eur_per_mwh: number; status: HeatParityStatus }>;
};

export type HeatParityResponse = {
  generated_at: string;
  inputs: {
    carbon_price_eur_per_t: number;
    elec_price_eur_per_mwh_el: number;
    gas_price_eur_per_mwh_th: number;
  };
  gas_boiler_reference: GasBoilerReference;
  heat_pump_references: HeatPumpReference[];
  rows: HeatParityRow[];
  carbon_sweep: HeatCarbonSweepPoint[];
  signal: HeatParitySignal;
};

const STATUS_LABELS: Record<HeatParityStatus, string> = {
  uneconomic: '暂不经济',
  inflection: '拐点临近',
  marginal_switch: '临界切换',
  dominant: '热泵占优'
};

const SIGNAL_LABELS: Record<HeatParitySignal, string> = {
  clear_leader: '热泵明确领先',
  close_race: '接近平价',
  no_advantage: '热泵暂无优势'
};

const STATUS_TONES: Record<HeatParityStatus, string> = {
  uneconomic: 'border-rose-200 bg-rose-50 text-rose-700',
  inflection: 'border-amber-200 bg-amber-50 text-amber-800',
  marginal_switch: 'border-sky-200 bg-sky-50 text-sky-800',
  dominant: 'border-emerald-200 bg-emerald-50 text-emerald-800'
};

export function heatStatusLabel(status: HeatParityStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function heatSignalLabel(signal: HeatParitySignal): string {
  return SIGNAL_LABELS[signal] ?? signal;
}

export function heatStatusTone(status: HeatParityStatus): string {
  return STATUS_TONES[status] ?? STATUS_TONES.inflection;
}

export type HeatParityQuery = {
  carbonPriceEurPerT?: number;
  elecPriceEurPerMwhEl?: number;
  gasPriceEurPerMwhTh?: number;
};

function buildHeatParityUrl(query: HeatParityQuery): string {
  const params = new URLSearchParams();
  if (query.carbonPriceEurPerT !== undefined) params.set('carbon_price', String(query.carbonPriceEurPerT));
  if (query.elecPriceEurPerMwhEl !== undefined) params.set('elec_price', String(query.elecPriceEurPerMwhEl));
  if (query.gasPriceEurPerMwhTh !== undefined) params.set('gas_price', String(query.gasPriceEurPerMwhTh));
  const qs = params.toString();
  const path =
    typeof window === 'undefined'
      ? buildApiUrl('/analysis/heat-parity')
      : '/api/analysis/heat-parity';
  return qs ? `${path}?${qs}` : path;
}

export async function loadHeatParity(
  query: HeatParityQuery = {},
  options: { timeoutMs?: number } = {}
): Promise<HeatParityResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(buildHeatParityUrl(query), {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`heat-parity request failed: ${res.status}`);
    }
    return (await res.json()) as HeatParityResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export type HeatSensitivityCell = {
  cop: number;
  elec_price_eur_per_mwh_el: number;
  hp_heat_cost_eur_per_mwh: number;
  breakeven_carbon_price_eur_per_t: number;
};

export type HeatSensitivityResponse = {
  generated_at: string;
  gas_price_eur_per_mwh_th: number;
  cops: number[];
  elec_prices: number[];
  cells: HeatSensitivityCell[];
  disclaimer: string;
};

export type HeatSensitivityQuery = {
  gasPriceEurPerMwhTh?: number;
};

function buildHeatSensitivityUrl(query: HeatSensitivityQuery): string {
  const params = new URLSearchParams();
  if (query.gasPriceEurPerMwhTh !== undefined) params.set('gas_price', String(query.gasPriceEurPerMwhTh));
  const qs = params.toString();
  const path =
    typeof window === 'undefined'
      ? buildApiUrl('/analysis/heat-parity/sensitivity')
      : '/api/analysis/heat-parity/sensitivity';
  return qs ? `${path}?${qs}` : path;
}

export async function loadHeatSensitivity(
  query: HeatSensitivityQuery = {},
  options: { timeoutMs?: number } = {}
): Promise<HeatSensitivityResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(buildHeatSensitivityUrl(query), {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`heat-sensitivity request failed: ${res.status}`);
    }
    return (await res.json()) as HeatSensitivityResponse;
  } finally {
    clearTimeout(timeout);
  }
}
