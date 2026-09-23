import { GermanyJetFuelMonitor } from '@/components/germany-jet-fuel-monitor';
import { GermanyRoadFuelsPanel } from '@/components/germany-road-fuels-panel';
import { PageTemplate } from '@/components/page-template';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { germanyJetFuelCopy } from '@/lib/germany-jet-fuel-copy';
import {
  getGermanyJetFuelReadModel,
  isLiveSourceStatus,
  type GermanyJetFuelMetric,
  type GermanyJetFuelReadModel
} from '@/lib/germany-jet-fuel-read-model';
import { messagesFor, type Locale } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import { getPriceTrendChartReadModel } from '@/lib/price-trend-chart-read-model';
import { getRoadFuelsGermany, type SearchParams } from '@/lib/road-fuels-read-model';
import type { Route } from 'next';

/**
 * One Germany jet-fuel price view for three real routes. Copy comes from
 * `src/locales/*.json`. The thin `app/prices`, `app/de/prices` and
 * `app/en/prices` pages pass the locale they already own.
 *
 * The trend chart is locale data, not a rewrite: only zh ships it today.
 * de/en keep the signal row + footer they already had. The monitor owns the
 * selected-quote signal, quote-versus-fetch time, and the cost estimate.
 */

const SOURCE_KEYS = [
  'brent_usd_per_bbl',
  'jet_usd_per_l',
  'rotterdam_jet_fuel_usd_per_l',
  'jet_eu_proxy_usd_per_l',
  'carbon_proxy_usd_per_t'
] as const;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

function sourceBasis(metric: GermanyJetFuelMetric | undefined, fetchFailed: boolean): SourceRef['basis'] {
  if (fetchFailed || !metric || metric.value == null) return 'assumption';
  if (metric.quality === 'missing' || metric.quality === 'seed') return 'assumption';
  if (isLiveSourceStatus(metric.sourceStatus) && metric.quality === 'observed' && metric.sourceMetricKey === metric.metricKey) {
    return 'observed';
  }
  return 'derived';
}

function readModelSource(
  readModel: GermanyJetFuelReadModel,
  copy: ReturnType<typeof messagesFor>['prices'],
  asOf: string | null
): SourceRef {
  const { sourceHealth } = readModel;
  if (readModel.isFallback && !sourceHealth) {
    return {
      id: 'germany-jet-fuel-read-model',
      label: fill(copy.source_read_model_fallback, { error: readModel.error ?? copy.source_unknown_error }),
      asOf,
      basis: 'assumption'
    };
  }
  const degraded = sourceHealth != null && sourceHealth.live < sourceHealth.total;
  return {
    id: 'germany-jet-fuel-read-model',
    label: degraded
      ? fill(copy.source_read_model_degraded, {
          live: String(sourceHealth.live),
          total: String(sourceHealth.total)
        })
      : copy.source_read_model,
    asOf,
    basis: readModel.isFallback ? 'assumption' : 'observed'
  };
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
  if (key === 'rotterdam_jet_fuel_usd_per_l') return copy.source_rotterdam;
  if (key === 'jet_eu_proxy_usd_per_l') return copy.source_jet_eu;
  return copy.source_carbon;
}

export async function GermanyJetFuelPage({
  locale,
  searchParams
}: {
  locale: Locale;
  searchParams?: SearchParams;
}) {
  const copy = messagesFor(locale).prices;
  const [readModel, priceChartData, roadFuels] = await Promise.all([
    getGermanyJetFuelReadModel(locale),
    copy.show_trend_chart ? getPriceTrendChartReadModel() : Promise.resolve(null),
    getRoadFuelsGermany(searchParams)
  ]);
  const observedAsOf =
    readModel.quoteAsOf ??
    readModel.metrics
      .map((metric) => metric.latestAsOf)
      .filter((value): value is string => value !== null && !Number.isNaN(new Date(value).getTime()))
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
      .pop() ??
    readModel.generatedAt;
  const asOf = readModel.isFallback ? null : observedAsOf;
  const fetchFailed = readModel.isFallback && !readModel.sourceHealth;

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      <GermanyJetFuelMonitor
        locale={locale}
        copy={germanyJetFuelCopy[locale]}
        pageDecision={{
          hold: copy.decision_hold,
          review: copy.decision_review,
          revisit: copy.decision_revisit,
          insufficient: copy.decision_review_source
        }}
        initialReadModel={readModel}
        initialChart={priceChartData}
        showChart={Boolean(copy.show_trend_chart) && priceChartData != null}
        showFooter={false}
      />

      <GermanyRoadFuelsPanel locale={locale} data={roadFuels} />

      <SourceFooter
        locale={locale}
        sources={[
          readModelSource(readModel, copy, asOf),
          ...SOURCE_KEYS.map((key) => {
            const metric = readModel.metrics.find((item) => item.metricKey === key);
            return {
              id: key,
              label: sourceLinkLabel(key, copy),
              href: sourcesHref(locale, key),
              asOf: fetchFailed ? null : metric?.latestAsOf ?? null,
              basis: sourceBasis(metric, fetchFailed)
            };
          }),
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
