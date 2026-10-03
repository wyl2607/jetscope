import { observationFromDetail, qualityFromDetail, quoteFreshness } from '@/lib/market-quality';
import type { DashboardReadModel, MarketSourceDetail, SafMarketCheck } from '@/lib/product-read-model';

// Product watch assumptions, documented in docs/THRESHOLD_ALERTS.md.
export const EUA_ALERT_EUR_PER_T = 100;
// Mirrors dashboard_contracts.py `_pathway_status` and PR #389.
export const INFLECTION_PREMIUM_PCT = 15;
export const SAF_REFERENCE_MAX_AGE_DAYS = 400;
const LITRES_PER_TONNE = 1250;
const COMBUSTION_TONNES_PER_LITRE = 2.5 / 1000;

type Input = 'market' | 'jet' | 'eua' | 'fx' | 'saf';
type Reason = 'missing' | 'seed' | 'unverified' | 'stale' | 'date' | 'fallback';
export type Suppression = { input: Input; reason: Reason };

function inputSuppression(
  input: Input,
  value: number | null | undefined,
  detail: MarketSourceDetail | undefined,
  now: Date
): Suppression | null {
  if (value == null || !Number.isFinite(value) || value <= 0 || !detail?.source?.trim()) return { input, reason: 'missing' };
  const quality = qualityFromDetail(detail);
  if (quality === 'seed' || detail.source === 'seed-baseline' || detail.status === 'seed') return { input, reason: 'seed' };
  if (quality === 'stale' || detail.status === 'stale' || detail.freshness === 'stale' || detail.freshness === 'expired') return { input, reason: 'stale' };
  if (detail.status === 'missing' || detail.status === 'error') return { input, reason: 'missing' };
  if (quality !== 'observed' && quality !== 'derived') return { input, reason: 'unverified' };
  // Genuine derived proxies may carry fallback_used; fallback observations may not.
  if (quality === 'observed' && (detail.fallback_used || detail.status === 'fallback')) return { input, reason: 'fallback' };
  const observedAt = observationFromDetail(detail);
  if (!observedAt || observedAt > now || !Number.isFinite(now.getTime())) return { input, reason: 'date' };
  // Check every advertised input date, even when the proxy has a newer direct date.
  // observationFromDetail alone ignores invalid constituents and prefers direct dates.
  const directDate = detail.observed_at ?? detail.published_at;
  const dates = [...(directDate == null ? [] : [directDate]), ...Object.values(detail.input_observed_at ?? {})];
  for (const raw of dates) {
    const at = raw ? new Date(raw) : null;
    if (!at || !Number.isFinite(at.getTime()) || at > now) return { input, reason: 'date' };
    if (quoteFreshness({ quality, observedAt: at, lagMinutes: detail.lag_minutes, now }) !== 'current') {
      return { input, reason: 'stale' };
    }
  }
  const freshness = quoteFreshness({ quality, observedAt, lagMinutes: detail.lag_minutes, now });
  if (freshness !== 'current') return { input, reason: 'stale' };
  return null;
}

/** Strictly current inputs only: the general market selector also permits stale quotes. */
export function evaluateThresholdAlerts(
  model: Pick<DashboardReadModel, 'market' | 'tippingPoint' | 'isFallback' | 'analysisInputs'>,
  now = new Date()
) {
  const { market } = model;
  const details = market.source_details ?? {};
  const fallback: Suppression | null = model.isFallback ? { input: 'market', reason: 'fallback' } : null;
  const eua = market.values.eu_ets_price_eur_per_t;
  const euaSuppression = fallback ?? inputSuppression('eua', eua, details.eu_ets, now);
  const fx = market.values.usd_per_eur;
  const fxSuppression = inputSuppression('fx', fx, details.ecb, now);
  const candidates = [
    ['rotterdam_jet_fuel_usd_per_l', 'rotterdam_jet_fuel'],
    ['jet_eu_proxy_usd_per_l', 'jet_eu_proxy'],
    ['jet_usd_per_l', 'jet']
  ] as const;
  // Keep the benchmark used by the report; never silently substitute a different quote.
  const jetValue = model.tippingPoint?.inputs.fossil_jet_usd_per_l;
  const jet = candidates.find(([key]) => key === model.analysisInputs.jetSourceKey && jetValue != null && market.values[key] === jetValue);
  const jetSuppression = jet
    ? inputSuppression('jet', jetValue, details[jet[1]], now)
    : { input: 'jet', reason: 'missing' } as Suppression;
  const reference = model.tippingPoint?.market_check ?? null;
  let safSuppression: Suppression | null = null;
  if (!reference || !Number.isFinite(reference.saf_eur_per_t) || reference.saf_eur_per_t <= 0) {
    safSuppression = { input: 'saf', reason: 'missing' };
  } else if (!['realized_average', 'price_assessment'].includes(reference.kind) || !reference.source_name || !reference.source_url) {
    safSuppression = { input: 'saf', reason: 'unverified' };
  } else {
    const published = Date.parse(reference.published_at);
    if (!Number.isFinite(published) || published > now.getTime()) safSuppression = { input: 'saf', reason: 'date' };
    else if (now.getTime() - published > SAF_REFERENCE_MAX_AGE_DAYS * 86400000) safSuppression = { input: 'saf', reason: 'stale' };
  }
  const spreadSuppression = fallback ?? jetSuppression ?? euaSuppression ?? fxSuppression ?? safSuppression;
  let check: SafMarketCheck | null = null;
  if (!spreadSuppression && reference && jetValue != null && eua != null && fx != null) {
    // Use current ECB FX, never the backend's fixed seed FX conversion.
    const fossil = jetValue + eua * fx * COMBUSTION_TONNES_PER_LITRE;
    const saf = reference.saf_eur_per_t / LITRES_PER_TONNE * fx;
    const premium = (saf - fossil) / fossil * 100;
    const coverage = reference.statutory_allowance_coverage_pct;
    const statutoryPremium = coverage != null && Number.isFinite(coverage) && coverage >= 0 && coverage <= 100
      ? premium - Math.max(0, premium) * coverage / 100
      : null;
    check = {
      ...reference, saf_usd_per_l: saf, fossil_with_ets_usd_per_l: fossil, premium_pct: premium,
      status: premium <= 0 ? 'competitive' : premium <= INFLECTION_PREMIUM_PCT ? 'inflection' : 'premium',
      statutory_allowance_premium_pct: statutoryPremium
    };
  }
  return {
    jetSaf: { check, suppression: spreadSuppression },
    eua: { value: euaSuppression ? null : eua, triggered: !euaSuppression && eua != null && eua >= EUA_ALERT_EUR_PER_T, suppression: euaSuppression }
  };
}
