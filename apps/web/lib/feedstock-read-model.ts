import { fetchJson } from '@/lib/product-read-model';

// Mirrors API FeedstockSqueezeResponse (/v1/market/feedstock).
export type FeedstockSqueeze = {
  generated_at: string;
  uco: {
    week_ending: string;
    published_at: string;
    ddp_nwe_eur_per_t: number;
    ddp_nwe_low_eur_per_t: number;
    ddp_nwe_high_eur_per_t: number;
    age_days: number;
    stale: boolean;
    source_name: string;
    source_url: string;
    prior_year: {
      year: number;
      low_eur_per_t: number;
      low_date: string;
      high_eur_per_t: number;
      high_date: string;
      vs_high_pct: number;
      vs_low_pct: number;
      source_name: string;
      source_url: string;
    } | null;
  };
  uco_vs_gasoil: {
    week_ending: string;
    uco_cif_ara_bulk_usd_per_t: number;
    ice_gasoil_usd_per_t: number;
    ratio: number;
  };
  structure: {
    period: string;
    published_at: string;
    aviation_biofuel_share_of_saf_pct: number;
    feedstock_imported_pct: number;
    china_share_of_imports_pct: number;
    source_name: string;
    source_url: string;
  };
};

export async function getFeedstockSqueeze(): Promise<FeedstockSqueeze | null> {
  return fetchJson<FeedstockSqueeze>('/market/feedstock').catch(() => null);
}
