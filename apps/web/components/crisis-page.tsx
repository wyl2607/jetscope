import { MetricCard } from '@/components/cards';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import { getCrisisBriefReadModel, type CrisisBriefReadModel } from '@/lib/crisis-brief-read-model';
import { assumed, derived, observed, type Figure } from '@/lib/figure';
import { messagesFor, type CrisisMessages, type Locale } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import {
  getDashboardReadModel,
  toDecisionReadModel,
  toTippingPointReadModel
} from '@/lib/product-read-model';
import { buildResearchDecisionBrief, getResearchSignals } from '@/lib/research-signals-read-model';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * One crisis index for three real routes. Copy comes from `src/locales/*.json`.
 * The thin `app/crisis`, `app/de/crisis` and `app/en/crisis` pages pass the
 * locale they already own; they do not rewrite the public URL.
 *
 * Do not unify the index. zh is the full monitor (flags in zh.json). de/en are
 * the slimmer brief (flags default false). Hrefs come from NAV_ENTRIES plus a
 * suffix, never a hardcoded locale prefix. zh-only subpages stay behind
 * `show_zh_subpage_links`.
 */

const CRISIS_CHART_SOURCE_ID = 'saf-tipping-model';
const ZH_RESERVES_HREF = '/crisis/eu-jet-reserves' as Route;
const ZH_WORKBENCH_PATH = '/crisis/saf-tipping-point';

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

function hrefFor(locale: Locale, navId: string, suffix = ''): Route {
  const path = NAV_ENTRIES.find((entry) => entry.id === navId)?.path[locale];
  if (!path) {
    throw new Error(`Crisis has no ${locale} path for ${navId}`);
  }
  return `${path}${suffix}` as Route;
}

function usesMonitor(copy: CrisisMessages): boolean {
  return (
    copy.show_price_chart ||
    copy.show_reserves_strip ||
    copy.show_event_timeline ||
    copy.show_simulator ||
    copy.show_research_brief ||
    copy.show_zh_subpage_links
  );
}

function isoDaysAgo(days: number): string { // figure-contract-lint-ignore: lookback window, not a measurement
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function fossilJetFigure(
  value: number, // figure-contract-lint-ignore: constructor input, not a display prop
  asOf: string | null,
  isAssumed: boolean,
  method: string
): Figure {
  if (isAssumed || !asOf) {
    return assumed({
      value,
      unit: 'USD/L',
      sourceId: CRISIS_CHART_SOURCE_ID,
      precision: 2,
      method
    });
  }
  return observed({
    value,
    unit: 'USD/L',
    sourceId: CRISIS_CHART_SOURCE_ID,
    asOf,
    precision: 2
  });
}

function effectiveFossilJetFigure(
  value: number, // figure-contract-lint-ignore: constructor input, not a display prop
  asOf: string | null,
  method: string
): Figure {
  return derived({
    value,
    unit: 'USD/L',
    sourceId: CRISIS_CHART_SOURCE_ID,
    asOf,
    precision: 2,
    method
  });
}

function buildSafWorkbenchHref({
  fallbackFossil,
  carbonPriceEurPerT,
  reserveWeeks
}: {
  fallbackFossil: number; // figure-contract-lint-ignore: constructor input, not a display prop
  carbonPriceEurPerT: number; // figure-contract-lint-ignore: constructor input, not a display prop
  reserveWeeks: number | null; // figure-contract-lint-ignore: constructor input, not a display prop
}): Route {
  const params = new URLSearchParams({
    fuel: fallbackFossil.toFixed(3),
    carbon: carbonPriceEurPerT.toFixed(2),
    subsidy: '0.000',
    blend: '6.00',
    reserve: reserveWeeks?.toFixed(2) ?? '3.00',
    pathway: 'hefa'
  });
  return `${ZH_WORKBENCH_PATH}?${params.toString()}` as Route;
}

function formatNumber(value: number | null | undefined, digits = 2, locale: Locale = 'en'): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  const tag = locale === 'de' ? 'de-DE' : locale === 'zh' ? 'zh-CN' : 'en-DE';
  return Number(value).toLocaleString(tag, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function formatPrice(value: number | null | undefined, locale: Locale): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  return `${formatNumber(value, 3, locale)} USD/L`;
}

function formatPercent(value: number | null | undefined): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return `${Number(value).toFixed(0)}%`;
}

function formatBriefAsOf(value: string | null | undefined, locale: Locale, unavailable: string): string {
  if (!value) return unavailable;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const tag = locale === 'de' ? 'de-DE' : locale === 'zh' ? 'zh-CN' : 'en-DE';
  return parsed.toLocaleString(tag, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function stressLabel(level: string | undefined, copy: CrisisMessages['stress']): string {
  if (level === 'critical') return copy.critical;
  if (level === 'elevated') return copy.elevated;
  if (level === 'guarded') return copy.guarded;
  if (level === 'normal') return copy.normal;
  return copy.unknown;
}

function briefStressLabel(level: string | undefined, copy: CrisisMessages['stress']): string {
  if (level === 'critical') return copy.critical;
  if (level === 'elevated') return copy.elevated;
  if (level === 'normal') return copy.normal;
  return copy.unknown;
}

function sourceTypeLabel(sourceType: string | undefined, copy: CrisisMessages['source_type']): string {
  if (sourceType === 'official') return copy.official;
  if (sourceType === 'manual') return copy.manual;
  if (sourceType === 'derived') return copy.derived;
  if (!sourceType) return copy.unknown;
  return sourceType;
}

function confidenceLabel(value: number | undefined, copy: CrisisMessages['confidence']): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  if (value == null) return copy.missing;
  if (value >= 0.85) return copy.high;
  if (value >= 0.7) return copy.medium_high;
  return copy.medium;
}

function signalLabel(signal: string | undefined, copy: CrisisMessages['signal']): string {
  if (signal === 'saf_cost_advantaged') return copy.saf_cost_advantaged;
  if (signal === 'switch_window_opening') return copy.switch_window_opening;
  if (signal === 'fossil_still_advantaged') return copy.fossil_still_advantaged;
  return copy.unknown;
}

function sourceStatusLabel(status: string, copy: CrisisMessages['source_status']): string {
  if (status === 'ok') return copy.ok;
  if (status === 'degraded') return copy.degraded;
  if (status === 'offline') return copy.offline;
  if (status === 'unknown') return copy.unknown;
  return status;
}

function researchPosture(
  status: string,
  count: number, // figure-contract-lint-ignore: internal formatter parameter, not a prop
  copy: CrisisMessages['research_posture']
): string {
  if (status === 'disabled') return copy.disabled;
  if (status === 'empty') return copy.empty;
  return count > 0 ? copy.backed : copy.empty;
}

// Text-only variants for the signal row. Section 1 rule 5: the tint is a claim
// about the data, so an unrecognised signal must not read like a result.
function signalTextTone(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'text-success';
  if (signal === 'switch_window_opening') return 'text-warning';
  if (signal === 'fossil_still_advantaged') return 'text-accent';
  return 'text-danger';
}

function stressTextTone(level?: string): string {
  if (level === 'critical') return 'text-danger';
  if (level === 'elevated') return 'text-warning';
  if (level === 'normal') return 'text-success';
  return 'text-danger';
}

function confidenceTextTone(value?: number): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  if (value == null) return 'text-danger';
  if (value >= 0.85) return 'text-success';
  if (value >= 0.7) return 'text-accent';
  return 'text-warning';
}

// Abschnitt 1 Regel 5 / Section 1 rule 5: an unknown reserve level is not a
// normal reserve level. Elevated and unknown stay warning, not muted.
function reserveStressTone(level: string | undefined): string {
  if (level === 'critical') return 'text-danger';
  if (level === 'normal') return 'text-success';
  return 'text-warning';
}

function sourceStatusTone(status: string): string {
  if (status === 'ok') return 'text-success';
  if (status === 'offline') return 'text-danger';
  return 'text-warning';
}

// Section 3: an official filing, a model output and a hand estimate are three
// different kinds of claim and the footer has to say which one this is.
function reserveBasis(sourceType?: string): SourceRef['basis'] {
  if (sourceType === 'official') return 'observed';
  if (sourceType === 'derived') return 'derived';
  return 'assumption';
}

function actionHref(readModel: CrisisBriefReadModel, id: string, fallback: Route): Route {
  return (readModel.actions.find((action) => action.id === id)?.href ?? fallback) as Route;
}

function reserveWeeksFigure(
  reserveWeeks: number | null, // figure-contract-lint-ignore: constructor input, not a display prop
  reserve: { source_type: string; source_name: string; generated_at: string } | null,
  methods: CrisisMessages['monitor']['methods']
): Figure {
  if (reserveWeeks != null && reserve) {
    if (reserve.source_type === 'official') {
      return observed({
        value: reserveWeeks,
        unit: 'weeks',
        sourceId: 'eu-reserve',
        asOf: reserve.generated_at,
        precision: 1
      });
    }
    if (reserve.source_type === 'derived') {
      return derived({
        value: reserveWeeks,
        unit: 'weeks',
        sourceId: 'eu-reserve',
        asOf: reserve.generated_at,
        precision: 1,
        method: fill(methods.reserve_derived, { name: reserve.source_name })
      });
    }
    return assumed({
      value: reserveWeeks,
      unit: 'weeks',
      sourceId: 'eu-reserve',
      precision: 1,
      method: fill(methods.reserve_named, { name: reserve.source_name, type: reserve.source_type })
    });
  }
  if (reserveWeeks != null) {
    return assumed({
      value: reserveWeeks,
      unit: 'weeks',
      sourceId: 'eu-reserve',
      precision: 1,
      method: methods.reserve_dashboard
    });
  }
  return assumed({
    value: 3,
    unit: 'weeks',
    sourceId: 'eu-reserve',
    precision: 1,
    method: methods.reserve_baseline
  });
}

async function CrisisMonitor({ locale, copy }: { locale: Locale; copy: CrisisMessages }) {
  const [dashboardReadModel, reserve, events, researchSignals] = await Promise.all([
    getDashboardReadModel(),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);

  const tippingPoint = toTippingPointReadModel(dashboardReadModel.tippingPoint);
  const decision = toDecisionReadModel(dashboardReadModel.airlineDecision);
  const fallbackFossil =
    dashboardReadModel.market.values.jet_eu_proxy_usd_per_l ??
    dashboardReadModel.market.values.jet_usd_per_l ??
    0.657;
  const researchBrief = buildResearchDecisionBrief(researchSignals);
  const reserveWeeks = reserve?.coverage_weeks ?? dashboardReadModel.reserve?.coverage_weeks ?? null;
  const reserveStatus = reserve ? copy.monitor.reserve_connected : copy.monitor.reserve_baseline;
  const sourceType = reserve?.source_type ?? copy.source_type.unknown;
  const confidence = reserve ? `${Math.round(reserve.confidence_score * 100)}%` : copy.confidence.unavailable;
  const marketConfidence = dashboardReadModel.market.source_status.confidence;
  const marketConfidenceText =
    typeof marketConfidence === 'number' ? `${Math.round(marketConfidence * 100)}%` : copy.confidence.unavailable;
  const carbonPriceEurPerT = Number(
    ((dashboardReadModel.market.values.carbon_proxy_usd_per_t ?? 102.6) / 1.08).toFixed(2)
  );
  const safWorkbenchHref = buildSafWorkbenchHref({
    fallbackFossil,
    carbonPriceEurPerT,
    reserveWeeks
  });
  const reviewSourcesHref = hrefFor(locale, 'sources', '?filter=review');
  const crisisLinks = copy.show_zh_subpage_links
    ? [
        {
          title: copy.zh_links.reserves.title,
          description: copy.zh_links.reserves.description,
          href: ZH_RESERVES_HREF,
          eyebrow: copy.zh_links.reserves.eyebrow
        },
        {
          title: copy.zh_links.workbench.title,
          description: copy.zh_links.workbench.description,
          href: safWorkbenchHref,
          eyebrow: copy.zh_links.workbench.eyebrow
        },
        {
          title: copy.zh_links.sources.title,
          description: copy.zh_links.sources.description,
          href: reviewSourcesHref,
          eyebrow: copy.zh_links.sources.eyebrow
        }
      ]
    : [];

  // 储备读数没连上时不盖时间戳：兜底值带着"刚刚"的时间会被当成实测。
  const asOf = reserve?.generated_at ?? null;

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      <SignalRow label={copy.signals_label}>
        {/* 契约第 2 节规则 2：结论在最前。后面三张都是"这个结论能信几分"。 */}
        <MetricCard
          label={copy.monitor.decision_label}
          value={signalLabel(tippingPoint?.signal, copy.signal)}
          valueClassName={signalTextTone(tippingPoint?.signal)}
          hint={fill(copy.monitor.decision_hint, {
            status: reserveStatus,
            price: fallbackFossil.toFixed(2)
          })}
        />
        <MetricCard
          label={copy.monitor.coverage_label}
          value={
            reserveWeeks
              ? fill(copy.monitor.coverage_weeks, { weeks: reserveWeeks.toFixed(2) })
              : copy.monitor.coverage_missing
          }
          valueClassName={stressTextTone(reserve?.stress_level)}
          hint={fill(copy.monitor.coverage_hint, {
            stress: stressLabel(reserve?.stress_level, copy.stress),
            source: reserve?.source_name ?? copy.monitor.coverage_source_missing
          })}
        />
        <MetricCard
          label={copy.monitor.reserve_confidence_label}
          value={confidence}
          valueClassName={confidenceTextTone(reserve?.confidence_score)}
          hint={fill(copy.monitor.reserve_confidence_hint, {
            confidence: confidenceLabel(reserve?.confidence_score, copy.confidence),
            source_type: sourceTypeLabel(sourceType, copy.source_type)
          })}
        />
        <MetricCard
          label={copy.monitor.market_confidence_label}
          value={marketConfidenceText}
          hint={copy.monitor.market_confidence_hint}
          cardHref={reviewSourcesHref}
        />
      </SignalRow>

      {crisisLinks.length > 0 ? (
        <Panel locale={locale} title={copy.monitor.actions_title} why={copy.monitor.actions_why}>
          <div className="grid gap-4 md:grid-cols-3">
            {crisisLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-accent">{item.eyebrow}</p>
                <p className="mt-2 font-medium text-ink">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{item.description}</p>
              </Link>
            ))}
          </div>
        </Panel>
      ) : null}

      {copy.show_reserves_strip ? (
        <Panel locale={locale} title={copy.monitor.reserves_panel_title} why={copy.monitor.reserves_panel_why}>
          <ReservesCoverageStrip reserve={reserve} />
        </Panel>
      ) : null}

      {copy.show_event_timeline ? (
        <Panel locale={locale} title={copy.monitor.timeline_title} why={copy.monitor.timeline_why}>
          <TippingEventTimeline events={events} />
        </Panel>
      ) : null}

      {copy.show_research_brief ? (
        <Panel locale={locale} title={copy.monitor.research_title} why={copy.monitor.research_why}>
          <ResearchDecisionBriefCard brief={researchBrief} compact />
        </Panel>
      ) : null}

      {copy.show_price_chart ? (
        <Panel locale={locale} title={copy.monitor.chart_title} why={copy.monitor.chart_why}>
          <FuelVsSafPriceChart
            fossilJetUsdPerL={fossilJetFigure(
              tippingPoint?.inputs.fossilJetUsdPerL ?? fallbackFossil,
              tippingPoint?.generatedAt ?? null,
              tippingPoint == null,
              copy.monitor.methods.fossil_fallback
            )}
            effectiveFossilJetUsdPerL={effectiveFossilJetFigure(
              tippingPoint?.effectiveFossilJetUsdPerL ?? fallbackFossil,
              tippingPoint?.generatedAt ?? null,
              copy.monitor.methods.effective_fossil
            )}
            pathways={tippingPoint?.pathways ?? []}
          />
        </Panel>
      ) : null}

      {copy.show_simulator ? (
        <Panel locale={locale} title={copy.monitor.simulator_title} why={copy.monitor.simulator_why}>
          <TippingPointSimulator
            tippingPoint={tippingPoint}
            decision={decision}
            reserveWeeks={reserveWeeksFigure(reserveWeeks, reserve, copy.monitor.methods)}
          />
        </Panel>
      ) : null}

      <SourceFooter
        locale={locale}
        sources={[
          {
            id: 'eu-reserve',
            label: reserve
              ? fill(copy.footer.reserve_connected, {
                  type: sourceTypeLabel(sourceType, copy.source_type),
                  name: reserve.source_name
                })
              : copy.footer.reserve_missing,
            asOf,
            basis: reserve ? reserveBasis(sourceType) : 'assumption'
          },
          {
            id: 'market-snapshot',
            label: fill(copy.footer.market_snapshot, {
              price: fallbackFossil.toFixed(2),
              carbon: carbonPriceEurPerT.toFixed(2)
            }),
            asOf: dashboardReadModel.market.generated_at,
            basis: 'observed'
          },
          {
            id: 'tipping-events',
            label: fill(copy.footer.tipping_events, { count: String(events.length) }),
            basis: 'observed'
          },
          {
            id: 'tipping-model',
            label: copy.footer.tipping_model,
            basis: 'derived'
          }
        ]}
        methodHref={hrefFor(locale, 'sources')}
        methodLabel={copy.footer.method_label}
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}

async function CrisisBrief({ locale, copy }: { locale: Locale; copy: CrisisMessages }) {
  const readModel = await getCrisisBriefReadModel(locale);

  const sourceStatus = readModel.sourceStatus;
  const latestEvent = readModel.tippingEvents[0] ?? null;
  const reserveWeeks = readModel.reserve?.coverage_weeks ?? null;
  const reserveConfidence = readModel.reserve?.confidence_score ?? null;
  const reserveSourceName = readModel.reserve?.source_name ?? copy.brief.fallback_source;
  const fossilPrice = readModel.fossilJetUsdPerL;
  const sourceConfidence = formatPercent((sourceStatus.confidence ?? 0) * 100);
  const researchStatus = researchPosture(readModel.research.status, readModel.research.signal_count, copy.research_posture);
  const reviewSourcesRoute = actionHref(readModel, 'review_sources', hrefFor(locale, 'sources', '?filter=review'));
  const reportRoute = actionHref(readModel, 'open_report', hrefFor(locale, 'reports', '/tipping-point-analysis'));
  const scenariosRoute = actionHref(readModel, 'review_scenarios', hrefFor(locale, 'scenarios'));

  // On fallback the read model stamps itself with the current time, so
  // rendering that as a data timestamp would present invented values as fresh.
  const asOf = readModel.error ? null : (readModel.reserve?.generated_at ?? readModel.marketGeneratedAt);

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      <SignalRow label={copy.signals_label}>
        {/* Section 2 rule 2: the reserve level is the answer; everything else
            in this row says how much you may trust it. */}
        <MetricCard
          label={copy.brief.stress_label}
          value={
            reserveWeeks == null
              ? copy.na
              : fill(copy.brief.stress_weeks, { weeks: formatNumber(reserveWeeks, 1, locale) })
          }
          valueClassName={reserveStressTone(readModel.reserve?.stress_level)}
          hint={fill(copy.brief.stress_hint, {
            stress: briefStressLabel(readModel.reserve?.stress_level, copy.stress),
            source: reserveSourceName
          })}
        />
        <MetricCard
          label={copy.brief.source_label}
          value={sourceConfidence}
          valueClassName={sourceStatusTone(sourceStatus.overall)}
          hint={fill(copy.brief.source_hint, {
            status: sourceStatusLabel(sourceStatus.overall, copy.source_status),
            reserve: formatPercent((reserveConfidence ?? 0) * 100)
          })}
          cardHref={reviewSourcesRoute}
        />
        <MetricCard
          label={copy.brief.events_label}
          value={`${readModel.tippingEvents.length}`}
          hint={
            latestEvent
              ? fill(copy.brief.events_hint, {
                  type: latestEvent.event_type.toLowerCase(),
                  pathway: latestEvent.saf_pathway.toUpperCase(),
                  when: formatBriefAsOf(latestEvent.observed_at, locale, copy.brief.as_of_unavailable)
                })
              : copy.brief.events_empty
          }
        />
        <MetricCard
          label={copy.brief.research_label}
          value={researchStatus}
          hint={
            readModel.research.signal_count
              ? fill(copy.brief.research_hint, { count: String(readModel.research.signal_count) })
              : copy.brief.research_hint_empty
          }
        />
      </SignalRow>

      <Panel locale={locale} title={copy.brief.readout_title} why={copy.brief.readout_why}>
        <div className="space-y-4 text-sm leading-7 text-muted">
          <p>
            {copy.brief.readout_p1_lead}{' '}
            <strong className="text-ink">{formatPrice(fossilPrice, locale)}</strong>
            {copy.brief.readout_p1_tail}
          </p>
          <p>{copy.brief.readout_p2}</p>
        </div>
      </Panel>

      <Panel locale={locale} title={copy.brief.evidence_title} why={copy.brief.evidence_why}>
        <dl className="space-y-3 text-sm text-muted">
          <div className="flex items-center justify-between gap-4">
            <dt>{copy.brief.freshness_label}</dt>
            <dd className="font-medium tabular-nums text-ink">
              {typeof sourceStatus.freshness_minutes === 'number'
                ? fill(copy.brief.freshness_minutes, { minutes: String(sourceStatus.freshness_minutes) })
                : copy.brief.freshness_review}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>{copy.brief.fallback_rate_label}</dt>
            <dd className="font-medium tabular-nums text-ink">{formatPercent(sourceStatus.fallback_rate)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>{copy.brief.reserve_timestamp_label}</dt>
            <dd className="font-medium tabular-nums text-ink">
              {formatBriefAsOf(readModel.reserve?.generated_at, locale, copy.brief.as_of_unavailable)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>{copy.brief.contract_label}</dt>
            <dd className={`font-medium ${readModel.error ? 'text-warning' : 'text-success'}`}>
              {readModel.error ? copy.brief.contract_fallback : copy.brief.contract_connected}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel locale={locale} title={copy.brief.actions_title} why={copy.brief.actions_why}>
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            {
              title: copy.recovery.review_sources.title,
              description: copy.recovery.review_sources.description,
              href: reviewSourcesRoute
            },
            {
              title: copy.recovery.open_report.title,
              description: copy.recovery.open_report.description,
              href: reportRoute
            },
            {
              title: copy.recovery.review_scenarios.title,
              description: copy.recovery.review_scenarios.description,
              href: scenariosRoute
            }
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-medium text-ink">{action.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        locale={locale}
        sources={[
          {
            id: 'crisis-brief-api',
            label: readModel.error
              ? fill(copy.footer.brief_error, { error: readModel.error })
              : copy.footer.brief_ok,
            asOf,
            basis: readModel.error ? 'assumption' : 'observed'
          },
          {
            id: 'reserve-source',
            label: fill(copy.footer.reserve_via, { name: reserveSourceName }),
            asOf: readModel.reserve?.generated_at ?? null,
            basis: reserveBasis(readModel.reserve?.source_type)
          },
          {
            id: 'tipping-events',
            label: fill(copy.footer.events_observed, { count: String(readModel.tippingEvents.length) }),
            basis: 'observed'
          },
          {
            id: 'fossil-anchor',
            label: fill(copy.footer.fossil_anchor, { price: formatPrice(fossilPrice, locale) }),
            basis: 'derived'
          }
        ]}
        methodHref={hrefFor(locale, 'sources')}
        methodLabel={copy.footer.method_label}
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}

export async function CrisisPage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).crisis;
  if (usesMonitor(copy)) {
    return CrisisMonitor({ locale, copy });
  }
  return CrisisBrief({ locale, copy });
}
