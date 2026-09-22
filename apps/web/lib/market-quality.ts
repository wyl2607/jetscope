export type MarketQuality =
  | 'observed'
  | 'stale'
  | 'derived'
  | 'seed'
  | 'unknown'
  | 'legacy'
  | 'unverified'
  | 'missing';

export type MarketFreshness = 'current' | 'stale' | 'expired' | 'unverifiable' | 'not_applicable';

export const SIGNAL_QUALITIES = new Set(['observed', 'stale', 'derived']);
export const QUALITY_RANK: Record<string, number> = {
  observed: 0,
  stale: 1,
  derived: 2,
  seed: 3,
  unknown: 4,
  legacy: 4,
  unverified: 4,
  missing: 5
};

const JET_CANDIDATES: Array<[string, string]> = [
  ['rotterdam_jet_fuel_usd_per_l', 'rotterdam_jet_fuel'],
  ['jet_eu_proxy_usd_per_l', 'jet_eu_proxy'],
  ['jet_usd_per_l', 'jet']
];
const STALE_USABLE_MULTIPLIER = 7;
const DEFAULT_LAG_MINUTES = 1440;

type Detail = {
  quality?: string | null;
  freshness?: string | null;
  status?: string | null;
  source?: string | null;
  fallback_used?: boolean | null;
  value?: number | null;
  observed_at?: string | null;
  published_at?: string | null;
  fetched_at?: string | null;
  lag_minutes?: number | null;
  input_observed_at?: Record<string, string | null | undefined> | null;
};

function positiveFloat(value: unknown): number | null { // figure-contract-lint-ignore: parser
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function qualityFromDetail(detail: Detail | undefined | null): MarketQuality {
  if (!detail) return 'missing';
  const explicit = String(detail.quality || '').trim().toLowerCase();
  if (explicit in QUALITY_RANK) return explicit as MarketQuality;
  const status = String(detail.status || '').trim().toLowerCase();
  const source = String(detail.source || '').trim().toLowerCase();
  const fallbackUsed = Boolean(detail.fallback_used);
  if ((status === 'missing' || status === 'error') && detail.value == null) return 'missing';
  if (status === 'missing') return 'missing';
  if (status === 'seed' || source === 'seed-baseline') return 'seed';
  if (fallbackUsed || status === 'fallback' || status === 'seed') {
    if (source.includes('derived') || source === 'brent-derived' || source === 'cbam+ecb' || source === 'eua+ecb') {
      return 'derived';
    }
    return 'seed';
  }
  if (status === 'stale') return 'stale';
  if (status === 'ok') {
    if (source.includes('derived') || source === 'brent-derived') return 'derived';
    return 'observed';
  }
  return 'unknown';
}

function parseIso(raw?: string | null): Date | null {
  if (!raw) return null;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? null : new Date(at);
}

export function observationFromDetail(detail: Detail | undefined | null): Date | null {
  const direct = parseIso(detail?.observed_at ?? null) ?? parseIso(detail?.published_at ?? null);
  if (direct) return direct;
  const inputs = detail?.input_observed_at;
  if (!inputs || typeof inputs !== 'object') return null;
  const dates = Object.values(inputs)
    .map((value) => parseIso(value ?? null))
    .filter((value): value is Date => value != null);
  if (!dates.length) return null;
  return dates.reduce((earliest, item) => (item < earliest ? item : earliest));
}

export function quoteFreshness({
  quality,
  observedAt,
  lagMinutes,
  now
}: {
  quality: string;
  observedAt: Date | null;
  lagMinutes?: number | null;
  now?: Date;
}): MarketFreshness {
  if (quality === 'seed' || quality === 'missing') return 'not_applicable';
  if (!observedAt) {
    return quality === 'observed' || quality === 'stale' || quality === 'derived' ? 'unverifiable' : 'not_applicable';
  }
  const clock = now ?? new Date();
  const ageMinutes = Math.max(0, (clock.getTime() - observedAt.getTime()) / 60000);
  const lag = lagMinutes && lagMinutes > 0 ? lagMinutes : DEFAULT_LAG_MINUTES;
  if (ageMinutes <= lag) return 'current';
  if (ageMinutes <= lag * STALE_USABLE_MULTIPLIER) return 'stale';
  return 'expired';
}

export function classifyQuoteFreshness({
  quality,
  observedAt,
  lagMinutes,
  now
}: {
  quality: string;
  observedAt: Date | null;
  lagMinutes?: number | null;
  now?: Date;
}): MarketQuality {
  const ranked = quality in QUALITY_RANK ? (quality as MarketQuality) : 'unknown';
  if (ranked === 'derived') return 'derived';
  if (ranked !== 'observed' && ranked !== 'stale') return ranked;
  if (!observedAt) return ranked;
  const freshness = quoteFreshness({ quality: ranked, observedAt, lagMinutes, now });
  if (freshness === 'current') return 'observed';
  if (freshness === 'stale') return 'stale';
  if (freshness === 'expired') return 'missing';
  return ranked;
}

export function usableForSignal(quality: string, freshness?: string | null): boolean {
  if (!SIGNAL_QUALITIES.has(quality)) return false;
  if (freshness === 'expired' || freshness === 'unverifiable') return false;
  return true;
}

export function selectFossilJetBenchmark(
  values: Record<string, number | null | undefined>,
  details: Record<string, Detail | undefined>,
  now?: Date
): {
  value: number | null; // figure-contract-lint-ignore: selected quote
  metricKey: string | null;
  quality: MarketQuality;
  freshness: MarketFreshness;
  usableForSignal: boolean;
} {
  const ranked: Array<{
    usable: number;
    rank: number;
    index: number;
    metricKey: string;
    value: number;
    quality: MarketQuality;
    freshness: MarketFreshness;
  }> = [];
  JET_CANDIDATES.forEach(([metricKey, detailKey], index) => {
    const value = positiveFloat(values[metricKey]);
    if (value == null) return;
    const detail = details[detailKey] ?? details[metricKey];
    const observedAt = observationFromDetail(detail);
    let quality = qualityFromDetail(detail);
    if (quality === 'missing') return;
    quality = classifyQuoteFreshness({
      quality,
      observedAt,
      lagMinutes: detail?.lag_minutes,
      now
    });
    const freshness = quoteFreshness({
      quality,
      observedAt,
      lagMinutes: detail?.lag_minutes,
      now
    });
    if (quality === 'missing') return;
    const usable = usableForSignal(quality, freshness) ? 0 : 1;
    ranked.push({ usable, rank: QUALITY_RANK[quality] ?? 99, index, metricKey, value, quality, freshness });
  });
  ranked.sort((left, right) => left.usable - right.usable || left.rank - right.rank || left.index - right.index);
  if (!ranked.length) {
    return {
      value: null,
      metricKey: null,
      quality: 'missing',
      freshness: 'not_applicable',
      usableForSignal: false
    };
  }
  const selected = ranked[0];
  return {
    value: selected.value,
    metricKey: selected.metricKey,
    quality: selected.quality,
    freshness: selected.freshness,
    usableForSignal: usableForSignal(selected.quality, selected.freshness)
  };
}

export function selectQualifiedInput(
  value: unknown,
  detail: Detail | undefined | null,
  now?: Date
): {
  value: number | null; // figure-contract-lint-ignore: selected input
  quality: MarketQuality;
  freshness: MarketFreshness;
  usableForCost: boolean;
} {
  const number = positiveFloat(value);
  const observedAt = observationFromDetail(detail);
  let quality: MarketQuality = number == null ? 'missing' : qualityFromDetail(detail);
  if (number != null) {
    quality = classifyQuoteFreshness({
      quality,
      observedAt,
      lagMinutes: detail?.lag_minutes,
      now
    });
  }
  const freshness = quoteFreshness({
    quality,
    observedAt,
    lagMinutes: detail?.lag_minutes,
    now
  });
  const usable = number != null && SIGNAL_QUALITIES.has(quality) && freshness !== 'expired' && freshness !== 'unverifiable';
  return { value: usable ? number : null, quality, freshness, usableForCost: usable };
}
