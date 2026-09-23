import { fetchJson } from '@/lib/product-read-model';

// Mirrors API RoadFuelsGermanyResponse (/v1/road-fuels/germany).
export type FuelPumpPrice = {
  with_tax_eur_per_l: number;
  ex_tax_eur_per_l: number;
  tax_share_pct: number;
  change_4w_pct: number | null;
  change_52w_pct: number | null;
};

export type ElectricityPrice = {
  eur_per_kwh: number;
  period: string;
  published_at: string;
  basis: string;
  source_name: string;
  source_url: string;
};

export type ConsumptionAssumptions = {
  diesel_l_per_100km: number;
  petrol_l_per_100km: number;
  ev_kwh_per_100km: number;
};

export type RoadFuelsGermany = {
  generated_at: string;
  pump: {
    week: string;
    fetched_at: string;
    source_name: string;
    source_url: string;
    euro95: FuelPumpPrice;
    diesel: FuelPumpPrice;
  } | null;
  inflation: {
    period: string;
    published_at: string;
    cpi_yoy_pct: number;
    energy_yoy_pct: number;
    motor_fuels_yoy_pct: number;
    heating_oil_yoy_pct: number;
    cpi_ex_heating_oil_and_motor_fuels_yoy_pct: number;
    motor_fuels_weight_per_mille: number;
    motor_fuels_contribution_pp: number;
    source_name: string;
    source_url: string;
  } | null;
  cost_per_100km: {
    assumptions: ConsumptionAssumptions;
    diesel_eur: number | null;
    petrol_eur: number | null;
    ev_home_eur: number | null;
    ev_home_reference_eur: number | null;
    electricity: ElectricityPrice | null;
    electricity_reference: ElectricityPrice | null;
  };
};

// Reader-adjustable consumptions carried in the page URL (?diesel_l=&petrol_l=&ev_kwh=).
// Bounds mirror the API's Query limits; anything else falls back to the API default.
const CONSUMPTION_PARAMS = [
  ['diesel_l', 'diesel_l_per_100km', 30],
  ['petrol_l', 'petrol_l_per_100km', 30],
  ['ev_kwh', 'ev_kwh_per_100km', 60]
] as const;

export type SearchParams = Record<string, string | string[] | undefined>;

export function consumptionQuery(searchParams: SearchParams | undefined): string {
  const query = new URLSearchParams();
  for (const [param, apiName, max] of CONSUMPTION_PARAMS) {
    const raw = searchParams?.[param];
    const value = Number(Array.isArray(raw) ? raw[0] : raw);
    if (raw != null && Number.isFinite(value) && value > 0 && value <= max) {
      query.set(apiName, String(value));
    }
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

export async function getRoadFuelsGermany(searchParams?: SearchParams): Promise<RoadFuelsGermany | null> {
  return fetchJson<RoadFuelsGermany>(`/road-fuels/germany${consumptionQuery(searchParams)}`).catch(() => null);
}
