import { buildApiUrl } from '@/lib/api-config';

const DEFAULT_FETCH_TIMEOUT_MS = 2000;

export type CrisisBriefLocale = 'zh' | 'de' | 'en';

export type CrisisBriefReserve = {
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

export type CrisisBriefEvent = {
  id: string;
  event_type: 'CRITICAL' | 'ALERT' | 'CROSSOVER' | string;
  saf_pathway: string;
  fossil_price_usd_per_l: number;
  saf_effective_cost_usd_per_l: number;
  gap_usd_per_l: number;
  observed_at: string;
  metadata: Record<string, unknown>;
};

export type CrisisBriefResponse = {
  generated_at: string;
  market_generated_at: string;
  fossil_jet_usd_per_l: number;
  source_status: {
    overall: string;
    confidence?: number | null;
    freshness_minutes?: number | null;
    fallback_rate?: number | null;
    is_fallback?: boolean | null;
  };
  reserve: CrisisBriefReserve;
  tipping_events: CrisisBriefEvent[];
  research: {
    status: 'disabled' | 'empty' | 'signal_backed' | string;
    signal_count: number;
    top_signal_title?: string | null;
    top_signal_confidence?: number | null;
    latest_published_at?: string | null;
  };
  actions: Array<{
    id: 'review_sources' | 'open_report' | 'review_scenarios' | string;
    label: string;
    href: string;
    reason: string;
  }>;
};

export type CrisisBriefReadModel = {
  generatedAt: string;
  marketGeneratedAt: string;
  fossilJetUsdPerL: number;
  sourceStatus: CrisisBriefResponse['source_status'];
  reserve: CrisisBriefReserve | null;
  tippingEvents: CrisisBriefEvent[];
  research: CrisisBriefResponse['research'];
  actions: Array<{
    id: string;
    label: string;
    href: string;
    reason: string;
  }>;
  error: string | null;
};

function fetchTimeoutMs(): number {
  const parsed = Number(process.env.JETSCOPE_CRISIS_BRIEF_FETCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 100) {
    return DEFAULT_FETCH_TIMEOUT_MS;
  }
  return Math.floor(parsed);
}

function localizeHref(href: string, locale: CrisisBriefLocale): string {
  if (locale === 'zh') {
    return href;
  }
  const prefix = locale === 'de' ? '/de' : '/en';
  if (href === '/sources?filter=review') return `${prefix}/sources?filter=review`;
  if (href === '/reports/tipping-point-analysis') return `${prefix}/reports/tipping-point-analysis`;
  if (href === '/scenarios') return `${prefix}/scenarios`;
  return href.startsWith('/') ? `${prefix}${href}` : href;
}

function fallbackReadModel(error: unknown): CrisisBriefReadModel {
  return {
    generatedAt: new Date().toISOString(),
    marketGeneratedAt: new Date().toISOString(),
    fossilJetUsdPerL: 0.657,
    sourceStatus: {
      overall: 'degraded',
      confidence: 0,
      freshness_minutes: null,
      fallback_rate: 100,
      is_fallback: true
    },
    reserve: null,
    tippingEvents: [],
    research: {
      status: 'empty',
      signal_count: 0,
      top_signal_title: null,
      top_signal_confidence: null,
      latest_published_at: null
    },
    actions: [],
    error: error instanceof Error ? error.message : 'crisis brief unavailable'
  };
}

export async function getCrisisBriefReadModel(
  locale: CrisisBriefLocale = 'zh',
  limit = 20
): Promise<CrisisBriefReadModel> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs());
  try {
    const search = new URLSearchParams({ limit: String(limit) });
    const response = await fetch(buildApiUrl(`/analysis/crisis-brief?${search.toString()}`), {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`crisis brief HTTP ${response.status}`);
    }
    const payload = (await response.json()) as CrisisBriefResponse;
    return {
      generatedAt: payload.generated_at,
      marketGeneratedAt: payload.market_generated_at,
      fossilJetUsdPerL: payload.fossil_jet_usd_per_l,
      sourceStatus: payload.source_status,
      reserve: payload.reserve,
      tippingEvents: payload.tipping_events ?? [],
      research: payload.research,
      actions: (payload.actions ?? []).map((action) => ({
        ...action,
        href: localizeHref(action.href, locale)
      })),
      error: null
    };
  } catch (error) {
    return fallbackReadModel(error);
  } finally {
    clearTimeout(timeout);
  }
}
