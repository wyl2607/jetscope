import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { getGermanyJetFuelReadModel } from '@/lib/germany-jet-fuel-read-model';
import { messagesFor, type Locale } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import { getPriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model';
import type { Route } from 'next';

/**
 * One Germany jet-fuel price view for three real routes. Copy comes from
 * `src/locales/*.json`. The thin `app/prices`, `app/de/prices` and
 * `app/en/prices` pages pass the locale they already own.
 *
 * The trend chart is locale data, not a rewrite: only zh ships it today.
 * de/en keep the signal row + footer they already had.
 */

const SOURCE_KEYS = [
  'brent_usd_per_bbl',
  'jet_usd_per_l',
  'jet_eu_proxy_usd_per_l',
  'carbon_proxy_usd_per_t'
] as const;

const NUMBER_LOCALE: Record<Locale, string> = {
  zh: 'en-US',
  de: 'de-DE',
  en: 'en-US'
};

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

function formatMetricValue(
  locale: Locale,
  value: number | null, // figure-contract-lint-ignore: internal formatter parameter, not a prop
  digits: number, // figure-contract-lint-ignore: display-digit count, not a measurement
  unit: string,
  na: string
): string {
  if (!Number.isFinite(value ?? NaN)) return `${na} ${unit}`;
  return `${Number(value).toLocaleString(NUMBER_LOCALE[locale], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })} ${unit}`;
}

function formatChange(value: number | null, na: string): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  if (!Number.isFinite(value ?? NaN)) return na;
  const numeric = Number(value);
  const sign = numeric > 0 ? '+' : '';
  return `${sign}${numeric.toFixed(2)}%`;
}

function changeClass(value: number | null): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  if (!Number.isFinite(value ?? NaN)) return 'text-warning';
  const magnitude = Math.abs(Number(value));
  if (magnitude >= 20) return 'text-danger';
  if (magnitude >= 10) return 'text-warning';
  return 'text-success';
}

function decisionLabel(
  change: number | null, // figure-contract-lint-ignore: internal formatter parameter, not a prop
  isFallback: boolean,
  copy: ReturnType<typeof messagesFor>['prices']
): string {
  if (isFallback || !Number.isFinite(change ?? NaN)) return copy.decision_review_source;
  const magnitude = Math.abs(Number(change));
  if (magnitude >= 20) return copy.decision_revisit;
  if (magnitude >= 10) return copy.decision_review;
  return copy.decision_hold;
}

function decisionTone(change: number | null, isFallback: boolean): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  if (isFallback || !Number.isFinite(change ?? NaN)) return 'text-danger';
  const magnitude = Math.abs(Number(change));
  if (magnitude >= 20) return 'text-danger';
  if (magnitude >= 10) return 'text-warning';
  return 'text-success';
}

function statusLabel(status: string, copy: ReturnType<typeof messagesFor>['prices']): string {
  if (status === 'live') return copy.status_live;
  if (status === 'proxy') return copy.status_proxy;
  if (status === 'degraded') return copy.status_degraded;
  return copy.use_status_fallback ? copy.status_fallback : status;
}

function sourceBasis(sourceKey: string, isFallback: boolean): SourceRef['basis'] {
  if (isFallback) return 'assumption';
  // The price read model does not expose source_type. Proxy keys are explicit;
  // every other unmapped source follows the contract's assumption default.
  return sourceKey.includes('proxy') ? 'derived' : 'assumption';
}

function sourcesHref(locale: Locale, focus?: string): Route {
  const path = NAV_ENTRIES.find((entry) => entry.id === 'sources')?.path[locale];
  if (!path) {
    throw new Error(`prices page has no ${locale} sources path`);
  }
  return (focus ? `${path}?focus=${focus}` : path) as Route;
}

function sourceLinkLabel(
  key: (typeof SOURCE_KEYS)[number],
  copy: ReturnType<typeof messagesFor>['prices']
): string {
  if (key === 'brent_usd_per_bbl') return copy.source_brent;
  if (key === 'jet_usd_per_l') return copy.source_jet;
  if (key === 'jet_eu_proxy_usd_per_l') return copy.source_jet_eu;
  return copy.source_carbon;
}

export async function GermanyJetFuelPage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).prices;
  const [readModel, priceChartData] = await Promise.all([
    getGermanyJetFuelReadModel(locale),
    copy.show_trend_chart ? getPriceTrendChartReadModel() : Promise.resolve(null)
  ]);
  const euJetMetric =
    readModel.metrics.find((metric) => metric.metricKey === 'jet_eu_proxy_usd_per_l') ??
    readModel.metrics[0];
  // Verdict + 3 keeps the signal row within the 2-4 the contract allows. The
  // metric config is exactly four, so nothing is dropped today - a fifth one
  // would need a home rather than silently falling off the end.
  const signalMetrics = readModel.metrics
    .filter((metric) => metric.metricKey !== euJetMetric?.metricKey)
    .slice(0, 3);
  const observedAsOf =
    readModel.metrics
      .map((metric) => metric.latestAsOf)
      .filter((value): value is string => value !== null && !Number.isNaN(new Date(value).getTime()))
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
      .pop() ?? readModel.generatedAt;
  const asOf = readModel.isFallback ? null : observedAsOf;

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      <SignalRow label={copy.signal_label}>
        <MetricCard
          label={copy.decision_label}
          value={decisionLabel(euJetMetric?.changePct30d ?? null, readModel.isFallback, copy)}
          valueClassName={decisionTone(euJetMetric?.changePct30d ?? null, readModel.isFallback)}
          hint={
            euJetMetric
              ? fill(copy.decision_hint, {
                  value: formatMetricValue(
                    locale,
                    euJetMetric.value,
                    euJetMetric.digits,
                    euJetMetric.unit,
                    copy.na
                  ),
                  window30: copy.window_30d,
                  change: formatChange(euJetMetric.changePct30d, copy.na),
                  status: statusLabel(readModel.overallStatus, copy)
                })
              : copy.decision_missing
          }
        />
        {signalMetrics.map((metric) => (
          <MetricCard
            key={metric.metricKey}
            label={metric.label}
            value={formatMetricValue(locale, metric.value, metric.digits, metric.unit, copy.na)}
            valueClassName={readModel.isFallback ? 'text-warning' : changeClass(metric.changePct30d)}
            hint={`${copy.window_1d} ${formatChange(metric.changePct1d, copy.na)} · ${copy.window_7d} ${formatChange(metric.changePct7d, copy.na)} · ${copy.window_30d} ${formatChange(metric.changePct30d, copy.na)}${metric.note ? ` · ${metric.note}` : ''}`}
          />
        ))}
      </SignalRow>

      {copy.show_trend_chart && priceChartData ? (
        <Panel title={copy.trend_title} why={copy.trend_why}>
          <PriceTrendsChart
            metrics={priceChartData.metrics}
            isLoading={false}
            error={priceChartData.error}
          />
        </Panel>
      ) : null}

      <SourceFooter
        locale={locale}
        sources={[
          {
            id: 'germany-jet-fuel-read-model',
            label: readModel.isFallback
              ? fill(copy.source_read_model_fallback, {
                  error: readModel.error ?? copy.source_unknown_error
                })
              : copy.source_read_model,
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          ...SOURCE_KEYS.map((key) => ({
            id: key,
            label: sourceLinkLabel(key, copy),
            href: sourcesHref(locale, key),
            asOf: readModel.isFallback
              ? null
              : readModel.metrics.find((metric) => metric.metricKey === key)?.latestAsOf ?? null,
            basis: sourceBasis(key, readModel.isFallback)
          })),
          ...(copy.show_trend_chart && priceChartData
            ? [
                {
                  id: 'price-trend-read-model',
                  label: priceChartData.isFallback
                    ? fill(copy.source_trend_fallback, {
                        error: priceChartData.error ?? copy.source_unknown_error
                      })
                    : copy.source_trend,
                  asOf: priceChartData.isFallback ? null : priceChartData.generatedAt,
                  basis: (priceChartData.isFallback ? 'assumption' : 'observed') as SourceRef['basis']
                }
              ]
            : [])
        ]}
        methodHref={sourcesHref(locale)}
        methodLabel={copy.method_label}
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}
