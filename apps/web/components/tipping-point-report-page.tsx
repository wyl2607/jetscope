import { MetricCard } from '@/components/cards';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { SourceFooter } from '@/components/source-footer';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';
import { assumed, derived, observed, type Figure } from '@/lib/figure';
import { messagesFor, type Locale, type TippingPointReportMessages } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import {
  getDashboardReadModel,
  toTippingPointReadModel,
  type DashboardReadModel
} from '@/lib/product-read-model';
import { AI_RESEARCH_ENABLED, buildResearchDecisionBrief, getResearchSignals } from '@/lib/research-signals-read-model';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * One tipping-point report view for three real routes. Copy comes from
 * `src/locales/*.json`. The thin `app/reports/tipping-point-analysis`,
 * `app/de/reports/tipping-point-analysis` and `app/en/reports/tipping-point-analysis`
 * pages pass the locale they already own; they do not rewrite the public URL.
 *
 * zh is artifact-heavy. de/en stay evidence reviews. Missing artifacts are
 * locale flags that default false — do not give de/en the zh chart pieces.
 */

const REPORT_CHART_SOURCE_ID = 'saf-tipping-model';
const ASSUMED_FOSSIL_JET_USD_PER_L = 0.657;

const DEFAULT_REPORT_FEATURES = {
  priceChart: false,
  reservesStrip: false,
  eventTimeline: false,
  researchBrief: false,
  decisionImplications: false,
  assumedFossilFallback: false,
  sourceConfidence: false,
  nextActions: false,
  dashboardSource: false
} as const;

type ReportFeatures = { [K in keyof typeof DEFAULT_REPORT_FEATURES]: boolean };

const REPORT_FEATURES: Record<Locale, ReportFeatures> = {
  zh: {
    ...DEFAULT_REPORT_FEATURES,
    priceChart: true,
    reservesStrip: true,
    eventTimeline: true,
    researchBrief: true,
    decisionImplications: true,
    assumedFossilFallback: true
  },
  de: {
    ...DEFAULT_REPORT_FEATURES,
    sourceConfidence: true,
    nextActions: true,
    dashboardSource: true
  },
  en: {
    ...DEFAULT_REPORT_FEATURES,
    sourceConfidence: true,
    nextActions: true,
    dashboardSource: true
  }
};

const NEXT_ACTIONS = [
  { id: 'sources', navId: 'sources', query: 'filter=review' },
  { id: 'scenarios', navId: 'scenarios' },
  { id: 'reports', navId: 'reports' }
] as const;

type FossilJetSource = 'model' | 'proxy' | 'spot' | 'assumed';

function featuresFor(locale: Locale): ReportFeatures {
  return REPORT_FEATURES[locale] ?? { ...DEFAULT_REPORT_FEATURES };
}

function hrefFor(locale: Locale, navId: 'sources' | 'scenarios' | 'reports', query?: string): Route {
  const path = NAV_ENTRIES.find((entry) => entry.id === navId)?.path[locale];
  if (!path) {
    throw new Error(`Tipping-point report has no ${locale} path for ${navId}`);
  }
  return (query ? `${path}?${query}` : path) as Route;
}

function isoDaysAgo(days: number): string { // figure-contract-lint-ignore: events query lookback, not a measurement
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function tippingSignalTone(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'text-success';
  if (signal === 'switch_window_opening') return 'text-warning';
  if (signal === 'fossil_still_advantaged') return 'text-danger';
  return 'text-warning';
}

function probabilityTone(probability: number | null): string { // figure-contract-lint-ignore: internal tone helper parameter, not a prop
  if (probability == null) return 'text-warning';
  if (probability >= 67) return 'text-success';
  if (probability >= 34) return 'text-warning';
  return 'text-danger';
}

function formatNumber(
  value: number | null | undefined, // figure-contract-lint-ignore: internal formatter parameter, not a prop
  locale: Locale,
  digits = 2,
  unavailable: string
): string {
  if (!Number.isFinite(value ?? NaN)) return unavailable;
  const tag = locale === 'de' ? 'de-DE' : locale === 'zh' ? 'zh-CN' : 'en-US';
  return Number(value).toLocaleString(tag, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function formatPrice(
  value: number | null | undefined, // figure-contract-lint-ignore: internal formatter parameter, not a prop
  locale: Locale,
  unavailable: string
): string {
  return `${formatNumber(value, locale, 3, unavailable)} USD/L`;
}

function formatPercent(
  value: number | null | undefined, // figure-contract-lint-ignore: internal formatter parameter, not a prop
  unavailable: string
): string {
  if (!Number.isFinite(value ?? NaN)) return unavailable;
  return `${Number(value).toFixed(0)}%`;
}

function sourceStatusLabel(status: string, copy: TippingPointReportMessages): string {
  if (status === 'ok') return copy.source_status.ok;
  if (status === 'degraded') return copy.source_status.degraded;
  if (status === 'offline') return copy.source_status.offline;
  if (status === 'unknown') return copy.source_status.unknown;
  return status;
}

function researchPosture(
  status: string,
  count: number, // figure-contract-lint-ignore: signal count for posture label, not a measurement
  copy: TippingPointReportMessages
): string {
  if (!AI_RESEARCH_ENABLED) return copy.research_posture.disabled;
  if (status === 'error') return copy.research_posture.error;
  if (status === 'not_found') return copy.research_posture.not_found;
  return count > 0 ? copy.research_posture.with_signals : copy.research_posture.waiting;
}

function fossilJetFigure(
  value: number, // figure-contract-lint-ignore: constructor input, not a display prop
  asOf: string | null,
  source: FossilJetSource,
  assumedMethod: string
): Figure {
  if (source === 'assumed' || !asOf) {
    return assumed({
      value,
      unit: 'USD/L',
      sourceId: REPORT_CHART_SOURCE_ID,
      precision: 2,
      method: assumedMethod
    });
  }
  return observed({
    value,
    unit: 'USD/L',
    sourceId: REPORT_CHART_SOURCE_ID,
    asOf,
    precision: 2
  });
}

function effectiveFossilJetFigure(
  value: number, // figure-contract-lint-ignore: constructor input, not a display prop
  asOf: string | null,
  method: string,
  isAssumed: boolean
): Figure {
  if (isAssumed) {
    return assumed({
      value,
      unit: 'USD/L',
      sourceId: REPORT_CHART_SOURCE_ID,
      precision: 2,
      method
    });
  }
  return derived({
    value,
    unit: 'USD/L',
    sourceId: REPORT_CHART_SOURCE_ID,
    asOf,
    precision: 2,
    method
  });
}

function resolveZhFossil(readModel: DashboardReadModel) {
  const tipping = toTippingPointReadModel(readModel.tippingPoint);
  const source: FossilJetSource =
    tipping?.inputs.fossilJetUsdPerL != null
      ? 'model'
      : readModel.market.values.jet_eu_proxy_usd_per_l != null
        ? 'proxy'
        : readModel.market.values.jet_usd_per_l != null
          ? 'spot'
          : 'assumed';
  const fossilJetUsdPerL =
    tipping?.inputs.fossilJetUsdPerL ??
    readModel.market.values.jet_eu_proxy_usd_per_l ??
    readModel.market.values.jet_usd_per_l ??
    ASSUMED_FOSSIL_JET_USD_PER_L;
  return {
    source,
    tipping,
    fossilJetUsdPerL,
    effectiveFossilJetUsdPerL: tipping?.effectiveFossilJetUsdPerL ?? fossilJetUsdPerL
  };
}

function resolveEvidenceFossil(readModel: DashboardReadModel) {
  const tipping = readModel.tippingPoint;
  const source: FossilJetSource =
    tipping?.effective_fossil_jet_usd_per_l != null
      ? 'model'
      : readModel.market.values.jet_eu_proxy_usd_per_l != null
        ? 'proxy'
        : readModel.market.values.jet_usd_per_l != null
          ? 'spot'
          : 'assumed';
  const fossilPrice =
    tipping?.effective_fossil_jet_usd_per_l ??
    readModel.market.values.jet_eu_proxy_usd_per_l ??
    readModel.market.values.jet_usd_per_l;
  return { source, tipping, fossilPrice };
}

function HighlightedCopy({
  template,
  values
}: {
  template: string;
  values: { price?: string; status?: string; confidence?: string };
}) {
  const tokens = template.split(/(\{price\}|\{status\}|\{confidence\})/g);
  return (
    <p>
      {tokens.map((token, index) => {
        if (token === '{price}') {
          return (
            <strong key={index} className="tabular-nums text-ink">
              {values.price}
            </strong>
          );
        }
        if (token === '{status}') {
          return (
            <strong key={index} className="text-ink">
              {values.status}
            </strong>
          );
        }
        if (token === '{confidence}') {
          return (
            <strong key={index} className="tabular-nums text-ink">
              {values.confidence}
            </strong>
          );
        }
        return token;
      })}
    </p>
  );
}

export async function TippingPointReportPage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).tipping_point_report;
  const features = featuresFor(locale);
  const [readModel, reserve, events, research] = await Promise.all([
    getDashboardReadModel(locale),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 20 }),
    getResearchSignals()
  ]);

  const zhFossil = features.assumedFossilFallback ? resolveZhFossil(readModel) : null;
  const evidenceFossil = features.assumedFossilFallback ? null : resolveEvidenceFossil(readModel);
  const fossilJetSource = zhFossil?.source ?? evidenceFossil?.source ?? 'assumed';
  const signal = features.assumedFossilFallback ? zhFossil?.tipping?.signal : evidenceFossil?.tipping?.signal;
  const decision = readModel.airlineDecision;
  const latestEvent = events[0] ?? null;
  const decisionProbabilities = decision
    ? [decision.probabilities.buy_spot_saf, decision.probabilities.sign_long_term_offtake].filter(
        (value): value is number => typeof value === 'number' && Number.isFinite(value)
      )
    : [];
  const switchProbability = decisionProbabilities.length > 0
    ? Math.round(Math.max(...decisionProbabilities) * 100)
    : null;
  const sourceStatus = readModel.market.source_status;
  const sourceConfidence = formatPercent(
    readModel.isFallback || sourceStatus.confidence == null ? null : sourceStatus.confidence * 100,
    copy.number_unavailable
  );
  const researchStatus = researchPosture(research.status, research.signals.length, copy);
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;
  const fossilJetAsOf = zhFossil?.tipping?.generatedAt ?? evidenceFossil?.tipping?.generated_at ?? asOf;
  const fossilJetIsAssumed = readModel.isFallback || fossilJetSource === 'assumed' || fossilJetAsOf == null;
  const researchBrief = features.researchBrief ? buildResearchDecisionBrief(research) : null;
  const fossilPrice = evidenceFossil?.fossilPrice;
  const eventsHint = features.sourceConfidence
    ? latestEvent
      ? copy.events_hint_latest.replace('{event}', latestEvent.event_type.toLowerCase())
      : copy.events_hint_empty
    : copy.events_hint;

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      <SignalRow label={copy.signal_row_label}>
        <MetricCard
          label={copy.signal_label}
          value={signal ?? copy.signal_unknown}
          valueClassName={tippingSignalTone(signal)}
          hint={copy.signal_hint}
        />
        <MetricCard
          label={copy.probability_label}
          value={switchProbability == null ? copy.number_unavailable : `${switchProbability}%`}
          valueClassName={probabilityTone(switchProbability)}
          hint={copy.probability_hint}
        />
        {features.sourceConfidence ? (
          <MetricCard
            label={copy.confidence_metric_label}
            value={sourceConfidence}
            hint={copy.confidence_metric_hint.replace('{status}', sourceStatusLabel(sourceStatus.overall, copy))}
          />
        ) : null}
        <MetricCard
          label={copy.events_label}
          value={`${events.length}`}
          valueClassName="text-ink"
          hint={eventsHint}
        />
      </SignalRow>

      <Panel locale={locale} title={copy.thesis_title} why={copy.thesis_why}>
        {features.assumedFossilFallback ? (
          <div className="space-y-4 text-sm leading-7 text-muted">
            <p className="text-2xl font-semibold leading-tight text-ink">{copy.thesis_lead}</p>
            <p>{copy.thesis_body}</p>
          </div>
        ) : (
          <div className="space-y-4 text-sm leading-7 text-muted">
            <HighlightedCopy
              template={copy.thesis_lead}
              values={{ price: formatPrice(fossilPrice, locale, copy.number_unavailable) }}
            />
            <HighlightedCopy
              template={copy.thesis_body}
              values={{
                status: sourceStatusLabel(sourceStatus.overall, copy),
                confidence: sourceConfidence
              }}
            />
          </div>
        )}
      </Panel>

      {features.reservesStrip ? (
        <Panel locale={locale} title={copy.reserves_title} why={copy.reserves_why}>
          <ReservesCoverageStrip reserve={reserve} />
        </Panel>
      ) : null}

      {features.priceChart && zhFossil ? (
        <Panel
          locale={locale}
          title={copy.chart_title}
          why={fossilJetIsAssumed ? copy.chart_why_assumed : copy.chart_why}
        >
          <FuelVsSafPriceChart
            fossilJetUsdPerL={fossilJetFigure(
              zhFossil.fossilJetUsdPerL,
              fossilJetIsAssumed ? null : fossilJetAsOf,
              fossilJetIsAssumed ? 'assumed' : fossilJetSource,
              copy.figure_methods.fossil_assumed
            )}
            effectiveFossilJetUsdPerL={effectiveFossilJetFigure(
              zhFossil.effectiveFossilJetUsdPerL,
              fossilJetIsAssumed ? null : fossilJetAsOf,
              copy.figure_methods.effective_fossil,
              fossilJetIsAssumed
            )}
            pathways={zhFossil.tipping?.pathways ?? []}
          />
        </Panel>
      ) : null}

      {features.decisionImplications ? (
        <Panel locale={locale} title={copy.decision_title} why={copy.decision_why}>
          <p className="text-sm leading-7 text-muted">{copy.decision_body}</p>
        </Panel>
      ) : null}

      {features.researchBrief && researchBrief ? (
        <Panel locale={locale} title={copy.research_title} why={copy.research_why}>
          <ResearchDecisionBriefCard brief={researchBrief} />
        </Panel>
      ) : null}

      {features.eventTimeline ? (
        <Panel locale={locale} title={copy.timeline_title} why={copy.timeline_why}>
          <TippingEventTimeline events={events} />
        </Panel>
      ) : null}

      {features.sourceConfidence ? (
        <Panel locale={locale} title={copy.confidence_title} why={copy.confidence_why}>
          <dl className="space-y-3 text-sm text-muted">
            <div className="flex items-center justify-between gap-4">
              <dt>{copy.market_status_label}</dt>
              <dd className="font-medium text-ink">{sourceStatusLabel(sourceStatus.overall, copy)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>{copy.fallback_rate_label}</dt>
              <dd className="font-medium tabular-nums text-ink">
                {formatPercent(sourceStatus.fallback_rate, copy.number_unavailable)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>{copy.latest_event_label}</dt>
              <dd className="font-medium text-ink">
                {latestEvent ? latestEvent.event_type.toLowerCase() : copy.latest_event_none}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>{copy.research_status_label}</dt>
              <dd className="font-medium text-ink">{researchStatus}</dd>
            </div>
          </dl>
        </Panel>
      ) : null}

      {features.nextActions ? (
        <Panel locale={locale} title={copy.next_title} why={copy.next_why}>
          <div className="grid gap-6 lg:grid-cols-3">
            {NEXT_ACTIONS.map((action) => {
              const item = copy.next_actions[action.id];
              const href = hrefFor(locale, action.navId, 'query' in action ? action.query : undefined);
              return (
                <Link
                  key={action.id}
                  href={href}
                  className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
                >
                  <p className="font-medium text-ink">{item.title}</p>
                  <p className="mt-2 text-sm leading-7 text-muted">{item.description}</p>
                </Link>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <SourceFooter
        locale={locale}
        sources={[
          ...(features.dashboardSource
            ? [
                {
                  id: 'dashboard-read-model',
                  label: copy.source_dashboard,
                  asOf,
                  basis: readModel.isFallback ? ('assumption' as const) : ('observed' as const)
                }
              ]
            : []),
          {
            id: 'reserve-signal',
            label: copy.source_reserve.replace('{source}', reserve?.source_name ?? copy.source_unavailable),
            asOf: reserve?.generated_at ?? null,
            basis:
              reserve?.source_type === 'official'
                ? 'observed'
                : reserve?.source_type === 'derived'
                  ? 'derived'
                  : 'assumption'
          },
          {
            id: 'report-fossil-anchor',
            label: fossilJetIsAssumed ? copy.source_fossil_assumed : copy.source_fossil_live,
            asOf: fossilJetIsAssumed ? null : fossilJetAsOf,
            basis: fossilJetIsAssumed ? 'assumption' : fossilJetSource === 'spot' ? 'observed' : 'derived'
          },
          {
            id: 'tipping-events',
            label: copy.source_events.replace('{count}', String(events.length)),
            asOf: latestEvent?.observed_at ?? null,
            basis: 'observed'
          },
          {
            id: 'research-signals',
            label: copy.source_research.replace('{count}', String(research.signals.length)),
            asOf: research.signals[0]?.published_at ?? null,
            basis: 'derived'
          }
        ]}
        methodHref={hrefFor(locale, 'sources')}
        methodLabel={copy.method_label}
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}
