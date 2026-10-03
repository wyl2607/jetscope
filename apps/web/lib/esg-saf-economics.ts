import { derived, missing, type Figure } from '@/lib/figure';
import { messagesFor, type Locale } from '@/lib/i18n';
import { isPublicQuoteStatus } from '@/lib/market-quote-read-model';
import type { MarketSnapshot, MarketSourceDetail } from '@/lib/product-read-model';

const PRESETS: Record<string, string> = {
  hefa: 'HEFA_EU',
  atj: 'ATJ_Brazil',
  ft: 'FT_biomass_DE',
  ptl: 'PtL_EU_2025'
};

function usableQuote(value: number | null | undefined, detail?: MarketSourceDetail): boolean {
  const asOf = detail?.as_of ?? detail?.observed_at;
  return value != null && Number.isFinite(value) && value > 0 && Boolean(detail?.source) &&
    isPublicQuoteStatus(detail?.status) && detail?.status !== 'missing' &&
    detail?.quality !== 'seed' && detail?.source !== 'seed-baseline' &&
    Boolean(asOf && Number.isFinite(Date.parse(asOf)));
}

/** Use only published quotes, never slider seeds, US jet, or analysis fallback FX. */
export function esgSafJetReference(market: MarketSnapshot, locale: Locale = 'zh'): Figure {
  const copy = messagesFor(locale).saf_project_economics;
  const jet = market.values.jet_eu_proxy_usd_per_l;
  const fx = market.values.usd_per_eur;
  const jetDetail = market.source_details?.jet_eu_proxy;
  const fxDetail = market.source_details?.ecb;
  const unavailable = () => missing({
    unit: 'EUR/L', sourceId: 'saf-tipping-model', reason: copy.missing_reference
  });
  if (!usableQuote(jet, jetDetail) || !usableQuote(fx, fxDetail)) return unavailable();
  const value = jet! / fx!;
  if (!Number.isFinite(value) || value <= 0) return unavailable();
  const jetAsOf = (jetDetail!.as_of ?? jetDetail!.observed_at)!;
  const fxAsOf = (fxDetail!.as_of ?? fxDetail!.observed_at)!;
  const method = copy.conversion_method
    .replace('{jetSource}', jetDetail!.source)
    .replace('{jetStatus}', copy.status[jetDetail!.status as keyof typeof copy.status])
    .replace('{jetAsOf}', jetAsOf)
    .replace('{fxSource}', fxDetail!.source)
    .replace('{fxStatus}', copy.status[fxDetail!.status as keyof typeof copy.status])
    .replace('{fxAsOf}', fxAsOf);
  return derived({
    value, unit: 'EUR/L', sourceId: 'saf-tipping-model', precision: 4,
    asOf: Date.parse(jetAsOf) <= Date.parse(fxAsOf) ? jetAsOf : fxAsOf,
    method, methodHref: '/sources'
  });
}

/** The external model owns project economics and producer-side policy assumptions. */
export function esgSafEconomicsHref(pathwayKey: string, jetReference?: Figure): string | null {
  if (!Object.hasOwn(PRESETS, pathwayKey)) return null;
  const preset = PRESETS[pathwayKey];
  const url = new URL('https://esg.meichen.beauty/saf');
  url.searchParams.set('preset', preset);
  if (jetReference?.basis === 'derived' && jetReference.unit === 'EUR/L' && jetReference.asOf &&
      jetReference.value != null && Number.isFinite(jetReference.value) && jetReference.value > 0) {
    const price = jetReference.value.toFixed(4);
    if (Number(price) > 0) url.searchParams.set('jet_fuel_price_eur_per_litre', price);
  }
  return url.toString();
}
