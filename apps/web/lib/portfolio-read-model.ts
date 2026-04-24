import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_FETCH_TIMEOUT_MS = 5000;

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

export type ResearchSignal = {
  id: string;
  signal_type: string;
  title: string;
  impact_direction: 'positive' | 'negative' | 'neutral' | 'unknown';
  confidence: number;
  summary_cn: string;
  summary_en: string;
  published_at: string;
};

export type ResearchSignalsResult =
  | {
      status: 'ok';
      signals: ResearchSignal[];
    }
  | {
      status: 'not_found';
      signals: [];
    }
  | {
      status: 'error';
      signals: [];
      message: string;
    };

export const AI_RESEARCH_ENABLED =
  String(process.env.JETSCOPE_AI_RESEARCH_ENABLED ?? process.env.AI_RESEARCH_ENABLED ?? '').toLowerCase() === 'true';

function portfolioFetchTimeoutMs(): number {
  const parsed = Number(process.env.JETSCOPE_PORTFOLIO_FETCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 100) {
    return DEFAULT_FETCH_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

function normalizeImpactDirection(value: unknown): ResearchSignal['impact_direction'] {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'positive' || normalized === 'negative' || normalized === 'neutral') {
    return normalized;
  }
  if (normalized === 'bullish_saf' || normalized === 'bullish') {
    return 'positive';
  }
  if (normalized === 'bearish_saf' || normalized === 'bearish') {
    return 'negative';
  }
  return 'unknown';
}

function clampConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, numeric));
}

function normalizeSignal(raw: Record<string, unknown>, index: number): ResearchSignal {
  const signalType = String(raw.signal_type ?? raw.type ?? 'uncategorized');
  const title = String(raw.title ?? raw.raw_title ?? raw.headline ?? `${signalType} signal ${index + 1}`);

  return {
    id: String(raw.id ?? raw.signal_id ?? `${signalType}-${index}`),
    signal_type: signalType,
    title,
    impact_direction: normalizeImpactDirection(raw.impact_direction),
    confidence: clampConfidence(raw.confidence ?? raw.confidence_score),
    summary_cn: String(raw.summary_cn ?? raw.summary_zh ?? raw.summary ?? '暂无中文摘要。'),
    summary_en: String(raw.summary_en ?? raw.summary ?? 'No English summary available.'),
    published_at: String(raw.published_at ?? raw.created_at ?? raw.generated_at ?? new Date().toISOString())
  };
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

export async function getResearchSignals(): Promise<ResearchSignalsResult> {
  if (!AI_RESEARCH_ENABLED) {
    return {
      status: 'ok',
      signals: []
    };
  }

  try {
    const search = new URLSearchParams({
      since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      limit: '20'
    });
    const response = await fetchJsonWithStatus<unknown>(`/research/signals?${search.toString()}`);
    if (response.status === 404) {
      return {
        status: 'not_found',
        signals: []
      };
    }

    if (response.status >= 400 || response.data == null) {
      return {
        status: 'error',
        signals: [],
        message: response.error ? `HTTP ${response.status}: ${response.error}` : `HTTP ${response.status}`
      };
    }

    const rawSignals = Array.isArray(response.data)
      ? response.data
      : Array.isArray((response.data as { signals?: unknown[] }).signals)
        ? (response.data as { signals: unknown[] }).signals
        : [];

    const signals = rawSignals
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map((item, index) => normalizeSignal(item, index));

    return {
      status: 'ok',
      signals
    };
  } catch (error) {
    return {
      status: 'error',
      signals: [],
      message: error instanceof Error ? error.message : 'failed to load research signals'
    };
  }
}
