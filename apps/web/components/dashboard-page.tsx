import { MetricCard } from '@/components/cards';
import { EuEtsPressurePanel } from '@/components/eu-ets-pressure-panel';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { PolicyTimelineWithMarketTime } from '@/components/policy-timeline-with-market-time';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { SafPathwayComparisonTable } from '@/components/saf-pathway-comparison-table';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { StatusBanner } from '@/components/status-banner';
import { getDashboardReadModel, type DashboardReadModel } from '@/lib/dashboard-read-model';
import { loadEuEtsPressure } from '@/lib/eu-ets-pressure-read-model';
import { messagesFor, type DashboardMessages, type Locale } from '@/lib/i18n';
import { computeDashboardAlertBanners } from '@/lib/market-signals';
import { NAV_ENTRIES } from '@/lib/navigation';
import { loadPathwayComparison, toPathwayCostRow } from '@/lib/pathways-read-model';
import { getPriceTrendChartReadModel } from '@/lib/product-read-model';
import { getSourcesReadModel, type SourcesReadModel } from '@/lib/sources-read-model';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * One dashboard view for three real routes. Copy and panel flags come from
 * `src/locales/*.json`. The thin `app/dashboard`, `app/de/dashboard` and
 * `app/en/dashboard` pages pass the locale they already own; they do not
 * rewrite the public URL.
 *
 * Extra panels default off. A locale only turns on what its previous page
 * already rendered — these three files evolved separately.
 */

const SIGNAL_IDS = ['decision', 'delivery', 'risk', 'market'] as const;
type SignalId = (typeof SIGNAL_IDS)[number];

const LH_CRISIS_HREF = '/crisis/saf-tipping-point?lh=1';

function hrefFor(locale: Locale, navId: string): Route {
  const path = NAV_ENTRIES.find((entry) => entry.id === navId)?.path[locale];
  if (!path) {
    throw new Error(`Dashboard has no ${locale} path for ${navId}`);
  }
  return path as Route;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => vars[key] ?? '');
}

function numberLocale(locale: Locale): string {
  if (locale === 'de') return 'de-DE';
  if (locale === 'en') return 'en-US';
  return 'zh';
}

function dateLocale(locale: Locale): string {
  if (locale === 'de') return 'de-DE';
  if (locale === 'en') return 'en-US';
  return 'zh';
}

// figure-contract-lint-ignore: internal formatter parameter, not a prop
function formatNumber(value: number, digits = 2, locale: Locale): string {
  return Number(value).toLocaleString(numberLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatStamp(value: string | null, locale: Locale, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(dateLocale(locale));
}

// figure-contract-lint-ignore: internal formatter parameter, not a prop
function formatEta(seconds: number | null | undefined, fallback: string): string {
  if (seconds == null || !Number.isFinite(seconds)) return fallback;
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function sourceStatusLabel(status: string, copy: DashboardMessages): string {
  if (status === 'ok') return copy.source_ok;
  if (status === 'degraded') return copy.source_degraded;
  if (status === 'offline') return copy.source_offline;
  if (status === 'unknown') return copy.source_unknown;
  return status;
}

function freshnessLabel(level: string, copy: DashboardMessages): string {
  if (level === 'fresh') return copy.freshness_fresh;
  if (level === 'stale') return copy.freshness_stale;
  if (level === 'critical') return copy.freshness_critical;
  return level;
}

function riskLevelLabel(level: string, copy: DashboardMessages): string {
  if (level === 'normal') return copy.risk_normal;
  if (level === 'watch') return copy.risk_watch;
  if (level === 'alert') return copy.risk_alert;
  return level;
}

function sourceStatusTone(status: string): string {
  if (status === 'ok') return 'text-success';
  if (status === 'offline') return 'text-danger';
  return 'text-warning';
}

function deliveryTone(locale: Locale, isFallback: boolean, overall: string): string {
  if (isFallback) return 'text-danger';
  if (overall === 'ok') return 'text-success';
  // zh treated any non-ok live status as warning; de/en keep offline as danger.
  if (overall === 'offline' && locale !== 'zh') return 'text-danger';
  return 'text-warning';
}

function isSignalId(id: string): id is SignalId {
  return (SIGNAL_IDS as readonly string[]).includes(id);
}

function decisionHint(copy: DashboardMessages, readModel: DashboardReadModel, overall: string): string {
  const risk = readModel.topRiskSignal;
  if (readModel.isFallback) return copy.decision_hint_fallback;
  if (risk?.level === 'alert') return copy.decision_hint_alert;
  if (risk == null) return copy.decision_hint_unknown;
  if (overall !== 'ok') return copy.decision_hint_source;
  if (risk.level === 'watch') return copy.decision_hint_watch;
  return copy.decision_hint_ok;
}

export async function DashboardPage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).dashboard;
  const needSources = copy.show_provenance || copy.show_sources_matrix;

  const [readModel, priceChartData, sourcesReadModel] = await Promise.all([
    getDashboardReadModel(locale),
    copy.show_price_trends ? getPriceTrendChartReadModel() : Promise.resolve(null),
    needSources ? getSourcesReadModel() : Promise.resolve(null)
  ]);

  const market = readModel.market.values;
  const risk = readModel.topRiskSignal;
  const freshness = readModel.freshnessSignal;
  const sourceStatus = readModel.market.source_status;
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  const riskColor =
    risk == null
      ? 'text-warning'
      : risk.level === 'alert'
        ? 'text-danger'
        : risk.level === 'watch'
          ? 'text-warning'
          : 'text-success';
  const riskValue =
    risk == null
      ? copy.na
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHref =
    copy.show_risk_href && risk != null
      ? `${hrefFor(locale, 'sources')}?focus=${encodeURIComponent(risk.metricKey)}`
      : undefined;
  const riskHint =
    risk == null
      ? copy.risk_hint_none
      : fill(copy.risk_hint, {
          level: riskLevelLabel(risk.level, copy),
          asOf: formatStamp(risk.latestAsOf, locale, copy.na),
          samples: String(risk.sampleCount)
        });

  const scenarioNeedsReview =
    readModel.isFallback || sourceStatus.overall !== 'ok' || risk == null || risk.level !== 'normal';
  const decisionPosture =
    risk?.level === 'alert' ? copy.decision_rerun : scenarioNeedsReview ? copy.decision_review : copy.decision_keep;
  const decisionTone =
    risk?.level === 'alert' || sourceStatus.overall === 'offline'
      ? 'text-danger'
      : scenarioNeedsReview
        ? 'text-warning'
        : 'text-success';

  const deliveryHint = readModel.isFallback
    ? fill(copy.delivery_hint_fallback, { error: readModel.error ?? copy.unknown_cause })
    : fill(copy.delivery_hint_live, {
        status: sourceStatusLabel(sourceStatus.overall, copy),
        freshness: freshnessLabel(freshness.level, copy),
        minutes: String(freshness.minutes)
      });

  const marketJet = market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l;
  const brent = formatNumber(market.brent_usd_per_bbl, 2, locale);
  const jet = formatNumber(market.jet_usd_per_l, 3, locale);
  const jetEu = formatNumber(marketJet, 3, locale);
  const carbon = formatNumber(market.carbon_proxy_usd_per_t, 2, locale);

  const cards: Record<SignalId, ReactNode> = {
    decision: (
      <MetricCard
        key="decision"
        label={copy.decision_label}
        value={decisionPosture}
        hint={decisionHint(copy, readModel, sourceStatus.overall)}
        valueClassName={decisionTone}
      />
    ),
    delivery: (
      <MetricCard
        key="delivery"
        label={copy.delivery_label}
        value={readModel.isFallback ? copy.delivery_fallback : copy.delivery_live}
        hint={deliveryHint}
        valueClassName={deliveryTone(locale, readModel.isFallback, sourceStatus.overall)}
      />
    ),
    risk: (
      <MetricCard
        key="risk"
        label={copy.risk_label}
        value={riskValue}
        hint={riskHint}
        valueClassName={riskColor}
        valueHref={riskHref}
      />
    ),
    market: (
      <MetricCard
        key="market"
        label={copy.market_label}
        value={fill(copy.market_value, { brent })}
        hint={fill(copy.market_hint, { jet, jetEu, carbon })}
      />
    )
  };

  let pathwayComparison: Awaited<ReturnType<typeof loadPathwayComparison>> | null = null;
  if (copy.show_pathways) {
    try {
      pathwayComparison = await loadPathwayComparison({
        fossilJetUsdPerL: readModel.analysisInputs?.fossilJetUsdPerL ?? marketJet ?? 0.9,
        carbonPriceEurPerT: Number(((market.carbon_proxy_usd_per_t ?? 0) / 1.08).toFixed(2)),
        subsidyUsdPerL: 0,
        blendRatePct: 6
      });
    } catch {
      pathwayComparison = null;
    }
  }

  let euEtsPressure: Awaited<ReturnType<typeof loadEuEtsPressure>> | null = null;
  if (copy.show_ets) {
    try {
      euEtsPressure = await loadEuEtsPressure({
        fossilJetUsdPerL: marketJet ?? 0.9,
        exemptBlendPct: 6,
        euEtsMin: 0,
        euEtsMax: 200,
        euEtsStep: 50
      });
    } catch {
      euEtsPressure = null;
    }
  }

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      {copy.show_status_banners ? (
        <DashboardStatusBanners
          locale={locale}
          copy={copy}
          readModel={readModel}
          asOf={asOf}
        />
      ) : null}

      <SignalRow label={copy.signal_row_label}>
        {copy.signal_order.filter(isSignalId).map((id) => cards[id])}
      </SignalRow>

      <Panel locale={locale} title={copy.work_title} why={copy.work_why}>
        <div className="grid gap-6 md:grid-cols-2">
          {copy.work_entries.map((entry) => (
            <MetricCard
              key={entry.nav}
              label={entry.label}
              value={entry.value}
              hint={entry.hint}
              cardHref={hrefFor(locale, entry.nav)}
            />
          ))}
        </div>
      </Panel>

      {copy.show_provenance && sourcesReadModel ? (
        <Panel locale={locale} title={copy.provenance_title} why={copy.provenance_why}>
          <ProvenanceSummary
            summary={sourcesReadModel.summary}
            completeness={sourcesReadModel.completeness}
            generatedAt={sourcesReadModel.isFallback ? null : sourcesReadModel.generatedAt}
            href={hrefFor(locale, 'sources')}
          />
        </Panel>
      ) : null}

      {copy.show_price_trends && priceChartData ? (
        <Panel locale={locale} title={copy.price_trends_title} why={copy.price_trends_why}>
          <PriceTrendsChart metrics={priceChartData.metrics} isLoading={false} error={priceChartData.error} />
        </Panel>
      ) : null}

      <Panel locale={locale} title={copy.capabilities_title} why={copy.capabilities_why}>
        <ul className="space-y-3 text-sm leading-7 text-muted">
          {copy.priorities.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </Panel>

      {copy.migration_items.length ? (
        <Panel locale={locale} title={copy.migration_title} why={copy.migration_why}>
          <div className="space-y-3 text-sm leading-7 text-muted">
            {copy.migration_items.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </Panel>
      ) : null}

      <Panel
        locale={locale}
        title={copy.scenarios_title}
        why={copy.scenarios_why}
        action={
          copy.scenarios_action ? (
            <Link
              href={hrefFor(locale, 'scenarios')}
              className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-muted transition hover:border-accent hover:bg-accent-soft"
            >
              {copy.scenarios_action}
            </Link>
          ) : undefined
        }
      >
        {readModel.recentScenarioNames.length ? (
          <ul className="space-y-2 text-sm leading-7 text-muted">
            {readModel.recentScenarioNames.map((name, index) => (
              <li key={`${name}-${index}`}>• {name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-7 text-muted">{copy.scenarios_empty}</p>
        )}
      </Panel>

      {copy.show_sources_matrix && sourcesReadModel ? (
        <SourcesMatrixPanel locale={locale} copy={copy} sourcesReadModel={sourcesReadModel} />
      ) : null}

      {copy.show_pathways && pathwayComparison ? (
        <Panel
          locale={locale}
          title={copy.pathways_title}
          why={copy.pathways_why}
          action={
            <span className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted">
              {fill(copy.pathways_signal, { signal: pathwayComparison.signalLabel })}
            </span>
          }
        >
          <SafPathwayComparisonTable
            selectedPathwayKey="hefa"
            pathways={pathwayComparison.rows.map((row) =>
              toPathwayCostRow(
                {
                  pathway_key: row.pathway_key,
                  display_name: row.name,
                  net_cost_low_usd_per_l: row.min_usd_per_l,
                  net_cost_high_usd_per_l: row.max_usd_per_l,
                  spread_low_pct: row.spread_pct ?? 0,
                  spread_high_pct: row.spread_pct ?? 0,
                  status: row.status
                },
                { asOf: pathwayComparison.generatedAt, basis: 'observed' }
              )
            )}
            sources={pathwayComparison.sourceByKey}
          />
        </Panel>
      ) : null}

      {copy.show_ets && euEtsPressure ? (
        <Panel locale={locale} title={copy.ets_title} why={copy.ets_why}>
          <EuEtsPressurePanel model={euEtsPressure} />
        </Panel>
      ) : null}

      {copy.show_policy_timeline ? (
        <Panel locale={locale} title={copy.policy_timeline_title} why={copy.policy_timeline_why}>
          <PolicyTimelineWithMarketTime locale={locale === 'de' ? 'de' : 'zh'} />
        </Panel>
      ) : null}

      <DashboardFooter locale={locale} copy={copy} readModel={readModel} sourcesReadModel={sourcesReadModel} asOf={asOf} />
    </PageTemplate>
  );
}

function DashboardStatusBanners({
  locale,
  copy,
  readModel,
  asOf
}: {
  locale: Locale;
  copy: DashboardMessages;
  readModel: DashboardReadModel;
  asOf: string | null;
}) {
  const market = readModel.market.values;
  const risk = readModel.topRiskSignal;
  const freshness = readModel.freshnessSignal;
  const sourceStatus = readModel.market.source_status;
  const derived = readModel.market.derived ?? {};
  const health = readModel.marketHealth;
  const event = readModel.aviationEvent;
  const analysis = readModel.analysisInputs;
  const decision = readModel.airlineDecision;
  const alertBanners = computeDashboardAlertBanners(readModel.market, risk);
  const spread =
    typeof derived.jet_vs_brent_spread_usd_per_l === 'number' ? derived.jet_vs_brent_spread_usd_per_l : null;
  const multiplier =
    typeof derived.jet_vs_brent_multiplier === 'number' ? derived.jet_vs_brent_multiplier : null;
  const facts = (event?.verified_facts ?? {}) as Record<string, unknown>;
  const statusTone: 'success' | 'warning' | 'danger' =
    readModel.isFallback || sourceStatus.overall === 'offline'
      ? 'danger'
      : sourceStatus.overall === 'ok' && health?.healthy !== false
        ? 'success'
        : 'warning';
  const jetPrice = formatNumber(analysis?.fossilJetUsdPerL ?? market.jet_eu_proxy_usd_per_l ?? 0, 3, locale);
  const ets = formatNumber(analysis?.carbonPriceEurPerT ?? 0, 2, locale);
  const healthLabel = health == null ? copy.na : health.healthy ? copy.status_health_ok : copy.status_health_attention;
  const runs =
    health?.runs_total != null
      ? fill(copy.status_runs, { ok: String(health.runs_ok), total: String(health.runs_total) })
      : '';

  return (
    <>
      <StatusBanner
        tone={statusTone}
        label={copy.status_market_label}
        title={`${sourceStatusLabel(sourceStatus.overall, copy)} · ${freshnessLabel(freshness.level, copy)}`}
        detail={
          <>
            {fill(copy.status_detail, {
              jetSource: analysis?.jetSourceKey ?? copy.na,
              jetPrice,
              ets,
              interval: health?.refresh_interval_seconds != null ? String(health.refresh_interval_seconds) : '—',
              eta: formatEta(health?.next_refresh_eta_seconds, copy.na),
              health: healthLabel,
              runs
            })}
          </>
        }
        actions={
          <>
            <a href={hrefFor(locale, 'sources')} className="js-status-action js-status-action-primary">
              {copy.status_sources_action}
            </a>
            <a href={LH_CRISIS_HREF} className="js-status-action js-status-action-secondary">
              {copy.status_lh_action}
            </a>
          </>
        }
      >
        {copy.status_snapshot} <strong>{formatStamp(asOf, locale, copy.na)}</strong> · {copy.status_freshness}{' '}
        <strong>{freshnessLabel(freshness.level, copy)}</strong>（{freshness.minutes}m） · {copy.status_source_overall}{' '}
        <code>{sourceStatusLabel(sourceStatus.overall, copy)}</code>
        {spread != null ? (
          <>
            {' · '}
            {copy.status_spread} <strong>${formatNumber(spread, 3, locale)}/L</strong>
            {multiplier != null ? ` (×${formatNumber(multiplier, 3, locale)})` : ''}
          </>
        ) : null}
      </StatusBanner>

      {health?.note ? <p className="js-dashboard-note">{health.note}</p> : null}

      {event ? (
        <StatusBanner
          tone="info"
          label={fill(copy.status_event_label, { asOf: event.as_of ?? copy.na })}
          title={`${event.entity?.name ?? 'Lufthansa'} — ${event.source?.title ?? event.id}`}
        >
          {fill(copy.status_event_summary, {
            profit: String(facts.q2_adjusted_operating_profit_eur_m ?? copy.na),
            profitYoy: String(facts.q2_adjusted_operating_profit_yoy_change_pct ?? copy.na),
            kerosene: String(facts.q2_extra_kerosene_cost_iran_war_eur_m ?? copy.na),
            strikes: String(facts.q2_strike_cost_eur_m_approx ?? copy.na),
            passThrough: String(facts.kerosene_cost_pass_through_pct_approx ?? copy.na),
            fuel: String(facts.fy_fuel_cost_expected_eur_bn ?? copy.na)
          })}
          {decision?.residual_fuel_cost_exposure != null ? (
            <span className="js-status-inline-emphasis">
              {fill(copy.status_residual, {
                exposure: formatNumber(decision.residual_fuel_cost_exposure, 3, locale),
                passThrough:
                  decision.fare_pass_through_pct != null
                    ? `${Math.round(decision.fare_pass_through_pct * 100)}%`
                    : copy.na
              })}
            </span>
          ) : null}
        </StatusBanner>
      ) : null}

      {alertBanners.length > 0 ? (
        <div className="js-status-stack">
          {alertBanners.map((banner) => (
            <StatusBanner
              key={banner.title}
              tone={banner.level === 'alert' ? 'danger' : 'warning'}
              label={banner.title}
              actions={
                banner.href ? (
                  <a href={banner.href} className="js-status-action js-status-action-primary">
                    {copy.status_alert_action}
                  </a>
                ) : null
              }
            >
              {banner.message}
            </StatusBanner>
          ))}
        </div>
      ) : null}
    </>
  );
}

function SourcesMatrixPanel({
  locale,
  copy,
  sourcesReadModel
}: {
  locale: Locale;
  copy: DashboardMessages;
  sourcesReadModel: SourcesReadModel;
}) {
  const sourceSummary = sourcesReadModel.summary;
  const sourcePosture =
    sourceSummary.degradedCount > 0 || sourceSummary.fallbackCount > 0
      ? copy.sources_matrix_review
      : sourceSummary.proxyCount > 0
        ? copy.sources_matrix_proxy_backed
        : copy.sources_matrix_healthy;
  const sourcePostureTone =
    sourceSummary.degradedCount > 0 || sourceSummary.fallbackCount > 0
      ? 'text-danger'
      : sourceSummary.proxyCount > 0
        ? 'text-warning'
        : 'text-success';
  const completeness =
    sourcesReadModel.completeness.value == null ? '—' : `${Math.round(sourcesReadModel.completeness.value)}%`;

  return (
    <Panel locale={locale} title={copy.sources_matrix_title} why={copy.sources_matrix_why}>
      <div className="grid gap-6 text-sm md:grid-cols-4">
        <p className="rounded-xl border border-line bg-success-soft p-3 text-muted">
          <span className="block text-xs uppercase tracking-[0.18em] text-muted">{copy.sources_matrix_live}</span>
          <span className="mt-1 block text-lg font-semibold tabular-nums text-success">{sourceSummary.liveCount}</span>
        </p>
        <p className="rounded-xl border border-line bg-warning-soft p-3 text-muted">
          <span className="block text-xs uppercase tracking-[0.18em] text-muted">{copy.sources_matrix_proxy}</span>
          <span className="mt-1 block text-lg font-semibold tabular-nums text-warning">{sourceSummary.proxyCount}</span>
        </p>
        <p className="rounded-xl border border-line bg-danger-soft p-3 text-muted">
          <span className="block text-xs uppercase tracking-[0.18em] text-muted">{copy.sources_matrix_fallback}</span>
          <span className="mt-1 block text-lg font-semibold tabular-nums text-danger">{sourceSummary.fallbackCount}</span>
        </p>
        <p className="rounded-xl border border-line bg-surface-muted p-3 text-muted">
          <span className="block text-xs uppercase tracking-[0.18em] text-muted">{copy.sources_matrix_confidence}</span>
          <span className="mt-1 block text-lg font-semibold tabular-nums text-ink">
            {Math.round(sourceSummary.averageConfidence * 100)}%
          </span>
        </p>
      </div>
      <p className={`mt-4 text-sm leading-7 ${sourcePostureTone}`}>
        {fill(copy.sources_matrix_summary, { posture: sourcePosture, completeness })}
      </p>
    </Panel>
  );
}

function DashboardFooter({
  locale,
  copy,
  readModel,
  sourcesReadModel,
  asOf
}: {
  locale: Locale;
  copy: DashboardMessages;
  readModel: DashboardReadModel;
  sourcesReadModel: SourcesReadModel | null;
  asOf: string | null;
}) {
  const sources: SourceRef[] = [
    {
      id: 'dashboard-read-model',
      label: readModel.isFallback
        ? fill(copy.footer_read_model_fallback, { error: readModel.error ?? copy.unknown_cause })
        : copy.footer_read_model_live,
      asOf,
      basis: readModel.isFallback ? 'assumption' : 'observed'
    }
  ];

  if (sourcesReadModel) {
    sources.push({
      id: 'source-coverage',
      label: sourcesReadModel.isFallback
        ? fill(copy.footer_coverage_fallback, { error: sourcesReadModel.error ?? copy.unknown_cause })
        : copy.footer_coverage_live,
      asOf: sourcesReadModel.isFallback ? null : sourcesReadModel.generatedAt,
      basis: sourcesReadModel.isFallback ? 'assumption' : 'derived'
    });
  }

  sources.push(
    {
      id: 'risk-signal',
      label: copy.footer_risk,
      basis: 'derived'
    },
    {
      id: 'scenario-store',
      label: fill(copy.footer_scenarios, { count: String(readModel.scenarioCount) }),
      basis: 'assumption'
    }
  );

  return (
    <SourceFooter
      locale={locale}
      sources={sources}
      methodHref={hrefFor(locale, 'sources')}
      methodLabel={copy.method_label}
      limitations={copy.limitations}
    />
  );
}
