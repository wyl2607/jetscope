import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

export type ReserveCoverage = {
  generated_at: string;
  region: string;
  coverage_days: number;
  coverage_weeks: number;
  stress_level: string;
  estimated_supply_gap_pct: number;
  source_type: string;
  source_name: string;
  confidence_score: number;
};

export type TippingEvent = {
  id: string;
  event_type: 'CRITICAL' | 'ALERT' | 'CROSSOVER';
  saf_pathway: string;
  fossil_price_usd_per_l: number;
  saf_effective_cost_usd_per_l: number;
  gap_usd_per_l: number;
  observed_at: string;
  metadata: Record<string, unknown>;
};

function portfolioFetchTimeoutMs(): number {
  const parsed = Number(process.env.JETSCOPE_PORTFOLIO_FETCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 100) {
    return DEFAULT_FETCH_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

async function fetchJsonWithStatus<T>(path: string): Promise<{ status: number; data: T | null; error?: string }> {
  const controller = new AbortController();
  const timeoutMs = portfolioFetchTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(buildApiUrl(path), {
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        status: response.status,
        data: null
      };
    }

    return {
      status: response.status,
      data: (await response.json()) as T
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        status: 408,
        data: null,
        error: `timeout after ${timeoutMs}ms`
      };
    }

    if (error instanceof SyntaxError) {
      return {
        status: 502,
        data: null,
        error: 'invalid JSON response'
      };
    }

    return {
      status: 502,
      data: null,
      error: error instanceof Error ? error.message : 'portfolio fetch failed'
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getEuReserveCoverage(): Promise<ReserveCoverage | null> {
  try {
    const response = await fetchJsonWithStatus<ReserveCoverage>('/reserves/eu');
    if (response.status >= 400 || !response.data) {
      return null;
    }
    return response.data;
  } catch {
    return null;
  }
}

export async function getTippingPointEvents(params: { since: string; limit?: number }): Promise<TippingEvent[]> {
  const search = new URLSearchParams({
    since: params.since,
    limit: String(params.limit ?? 50)
  });

  try {
    const response = await fetchJsonWithStatus<TippingEvent[]>(`/analysis/tipping-point/events?${search.toString()}`);
    if (response.status >= 400 || !Array.isArray(response.data)) {
      return [];
    }
    return response.data;
  } catch {
    return [];
  }
}
