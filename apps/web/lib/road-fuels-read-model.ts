import { fetchJson } from '@/lib/product-read-model';

// Mirrors API RoadFuelsGermanyResponse (/v1/road-fuels/germany).
export type FuelPumpPrice = {
  with_tax_eur_per_l: number;
  ex_tax_eur_per_l: number;
  tax_share_pct: number;
  change_4w_pct: number | null;
  change_52w_pct: number | null;
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
};

export async function getRoadFuelsGermany(): Promise<RoadFuelsGermany | null> {
  return fetchJson<RoadFuelsGermany>('/road-fuels/germany').catch(() => null);
}
