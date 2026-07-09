import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

export type TransitionTech = {
  tech_key: string;
  name: string;
  breakeven_carbon_price_eur_per_t: number;
  competitive_at_reference: boolean;
};

export type TransitionDomain = {
  domain_key: string;
  domain_name: string;
  carbon_driver: string;
  reference_carbon_price_eur_per_t: number;
  techs: TransitionTech[];
};

export type TransitionSummaryResponse = {
  generated_at: string;
  disclaimer: string;
  domains: TransitionDomain[];
};

function buildTransitionSummaryUrl(): string {
  return typeof window === 'undefined'
    ? buildApiUrl('/analysis/transition-summary')
    : '/api/analysis/transition-summary';
}

export async function loadTransitionSummary(
  options: { timeoutMs?: number } = {}
): Promise<TransitionSummaryResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(buildTransitionSummaryUrl(), {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`transition-summary request failed: ${res.status}`);
    }
    return (await res.json()) as TransitionSummaryResponse;
  } finally {
    clearTimeout(timeout);
  }
}
