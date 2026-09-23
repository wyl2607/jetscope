/**
 * How a market quote is allowed to appear.
 * `missing` never contributes a number. Seeds stay out of this layer.
 */

export type PublicQuoteStatus = 'live' | 'stale' | 'estimated' | 'missing';

export type QuoteFields = {
  value?: number | null;
  status?: string | null;
  asOf?: string | null;
  method?: string | null;
};

export type QuotePresentation = {
  /** Visible number, or an em dash when the quote is missing. */
  text: string;
  badge: string | null;
  /** Hover text for an estimate. */
  title: string | null;
  slot: 'primary' | 'secondary' | 'missing' | 'legacy';
};

const DETAIL_BY_METRIC: Record<string, string> = {
  brent_usd_per_bbl: 'brent',
  jet_usd_per_l: 'jet',
  carbon_proxy_usd_per_t: 'carbon',
  jet_eu_proxy_usd_per_l: 'jet_eu_proxy',
  rotterdam_jet_fuel_usd_per_l: 'rotterdam_jet_fuel',
  eu_ets_price_eur_per_t: 'eu_ets',
  germany_premium_pct: 'germany_premium',
  usd_per_eur: 'ecb'
};

const COPY = {
  zh: { missing: '数据缺失', estimated: '估算', asOf: (day: string) => `截至 ${day}`, latest: '最新价' },
  de: { missing: 'Daten fehlen', estimated: 'Schätzung', asOf: (day: string) => `Stand ${day}`, latest: 'Aktuell' },
  en: { missing: 'missing', estimated: 'estimated', asOf: (day: string) => `as of ${day}`, latest: 'Latest' }
} as const;

export type QuoteLocale = keyof typeof COPY;

type SnapshotLike = {
  values?: Record<string, number | null | undefined> | null;
  source_details?: Record<
    string,
    {
      status?: string | null;
      value?: number | null;
      as_of?: string | null;
      observed_at?: string | null;
      method?: string | null;
    }
  > | null;
};

export function isPublicQuoteStatus(status: string | null | undefined): status is PublicQuoteStatus {
  return status === 'live' || status === 'stale' || status === 'estimated' || status === 'missing';
}

export function observationDay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : raw;
}

function formatNumber(value: number, digits: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function digitsFor(metricKey: string): number {
  if (metricKey === 'brent_usd_per_bbl' || metricKey === 'carbon_proxy_usd_per_t' || metricKey === 'eu_ets_price_eur_per_t') {
    return 2;
  }
  if (metricKey === 'germany_premium_pct') return 1;
  if (metricKey === 'usd_per_eur') return 4;
  return 3;
}

export function presentQuote(metricKey: string, quote: QuoteFields, locale: QuoteLocale = 'zh'): QuotePresentation {
  const copy = COPY[locale];
  const status = quote.status ?? null;
  if (!isPublicQuoteStatus(status)) {
    return { text: '', badge: null, title: null, slot: 'legacy' };
  }
  if (status === 'missing' || quote.value == null || !Number.isFinite(quote.value)) {
    return { text: '—', badge: copy.missing, title: null, slot: 'missing' };
  }
  const text = formatNumber(quote.value, digitsFor(metricKey));
  if (status === 'stale') {
    const day = observationDay(quote.asOf);
    return {
      text,
      badge: day ? copy.asOf(day) : copy.asOf(''),
      title: null,
      slot: 'primary'
    };
  }
  if (status === 'estimated') {
    return {
      text,
      badge: copy.estimated,
      title: quote.method ?? null,
      slot: 'secondary'
    };
  }
  return { text, badge: null, title: null, slot: 'primary' };
}

export function quoteFieldsFor(snapshot: SnapshotLike, metricKey: string): QuoteFields {
  const detailKey = DETAIL_BY_METRIC[metricKey] ?? metricKey;
  const detail = snapshot.source_details?.[detailKey] ?? snapshot.source_details?.[metricKey];
  const rawValue = snapshot.values?.[metricKey];
  return {
    value: detail?.status === 'missing' ? null : rawValue ?? detail?.value ?? null,
    status: detail?.status ?? null,
    asOf: detail?.as_of ?? detail?.observed_at ?? null,
    method: detail?.method ?? null
  };
}

const DASHBOARD_METRICS: Array<{ key: string; label: Record<QuoteLocale, string> }> = [
  { key: 'brent_usd_per_bbl', label: { zh: 'Brent', de: 'Brent', en: 'Brent' } },
  { key: 'jet_usd_per_l', label: { zh: '航煤', de: 'Kerosin', en: 'Jet' } },
  { key: 'jet_eu_proxy_usd_per_l', label: { zh: 'EU 航煤', de: 'EU-Kerosin', en: 'EU jet' } },
  { key: 'rotterdam_jet_fuel_usd_per_l', label: { zh: '鹿特丹', de: 'Rotterdam', en: 'Rotterdam' } },
  { key: 'carbon_proxy_usd_per_t', label: { zh: '碳价', de: 'CO2', en: 'Carbon' } }
];

export function presentDashboardMarket(
  snapshot: SnapshotLike,
  locale: QuoteLocale = 'zh'
): { mode: 'legacy' | 'quotes'; primary: string; secondary: string } {
  const copy = COPY[locale];
  const rows = DASHBOARD_METRICS.map((metric) => ({
    label: metric.label[locale],
    quote: presentQuote(metric.key, quoteFieldsFor(snapshot, metric.key), locale)
  }));
  if (rows.every((row) => row.quote.slot === 'legacy')) {
    return { mode: 'legacy', primary: '', secondary: '' };
  }
  const primary = rows
    .filter((row) => row.quote.slot === 'primary')
    .map((row) => (row.quote.badge ? `${row.label} ${row.quote.text} ${row.quote.badge}` : `${row.label} ${row.quote.text}`));
  const secondary = rows
    .filter((row) => row.quote.slot === 'secondary' || row.quote.slot === 'missing')
    .map((row) => {
      if (row.quote.slot === 'missing') return `${row.label} — ${row.quote.badge ?? copy.missing}`;
      const method = row.quote.title ? ` (${row.quote.title})` : '';
      return `${row.label} ${row.quote.text} ${row.quote.badge ?? copy.estimated}${method}`;
    });
  return {
    mode: 'quotes',
    primary: primary.length ? `${copy.latest} ${primary.join(' · ')}` : '—',
    secondary: secondary.join(' · ')
  };
}
