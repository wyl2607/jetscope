import { FocusScroll } from '@/app/sources/focus-scroll';
import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { SourceCoveragePanel } from '@/components/source-coverage-panel';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { buildApiUrl } from '@/lib/api-config';
import { messagesFor, type Locale, type SourcesMessages } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import { formatSourceCoverageLag } from '@/lib/source-coverage-contract';
import { getSourcesReadModel, type SourcesReadModel } from '@/lib/sources-read-model';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * One sources view for three real routes. Copy comes from `src/locales/*.json`.
 * The thin `app/sources`, `app/de/sources` and `app/en/sources` pages pass the
 * locale they already own; they do not rewrite the public URL.
 *
 * zh is a richer Trust Center. de/en stay a slimmer review surface. Those
 * differences are flags, not three forks of the page.
 */
export const SOURCES_FEATURES = {
  zh: {
    show_market_health: true,
    show_provenance_summary: true,
    show_coverage_panel: true,
    show_focus_scroll: true
  },
  de: {
    show_market_health: false,
    show_provenance_summary: false,
    show_coverage_panel: false,
    show_focus_scroll: false
  },
  en: {
    show_market_health: false,
    show_provenance_summary: false,
    show_coverage_panel: false,
    show_focus_scroll: false
  }
} as const satisfies Record<
  Locale,
  {
    show_market_health: boolean;
    show_provenance_summary: boolean;
    show_coverage_panel: boolean;
    show_focus_scroll: boolean;
  }
>;

export type MarketHealth = {
  healthy: boolean;
  refresh_interval_seconds: number; // figure-contract-lint-ignore: refresh cadence, not a measurement
  age_seconds: number | null; // figure-contract-lint-ignore: refresh age, not a measurement
  next_refresh_eta_seconds: number | null; // figure-contract-lint-ignore: refresh eta, not a measurement
  runs_total: number; // figure-contract-lint-ignore: run counter, not a measurement
  runs_ok: number; // figure-contract-lint-ignore: run counter, not a measurement
  success_rate: number | null; // figure-contract-lint-ignore: run ratio, not a measurement
  latest_status: string | null;
  note: string;
  recent_runs: Array<{ refreshed_at: string; source_status: string; ingest: string; ok: boolean }>;
};

type SourceRow = SourcesReadModel['rows'][number];
type SourceFilter = 'all' | 'review' | 'fallback' | 'proxy' | 'live';
type AlertLevel = SourceRow['alertLevel'];
type ActionPriority = SourceRow['reviewAction']['priority'];

const SOURCE_FILTERS: readonly SourceFilter[] = ['all', 'review', 'fallback', 'proxy', 'live'];
const CJK = /[\u4e00-\u9fff]/;
const DATE_TAG: Record<Locale, string | undefined> = {
  zh: undefined,
  de: 'de-DE',
  en: 'en-US'
};

export async function getMarketHealth(): Promise<MarketHealth | null> {
  try {
    const response = await fetch(buildApiUrl('/market/health?runs_window=10'), { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as MarketHealth;
  } catch {
    return null;
  }
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hrefFor(locale: Locale, navId: 'admin' | 'dashboard' | 'reports' | 'sources'): Route {
  const path = NAV_ENTRIES.find((entry) => entry.id === navId)?.path[locale];
  if (!path) {
    throw new Error(`Sources page has no ${locale} path for ${navId}`);
  }
  return path as Route;
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (_, key: string) => String(vars[key] ?? ''));
}

function lookupTable(table: Record<string, string>, key: string): string | undefined {
  return table[key];
}

function normalizeSourceFilter(filter: string | undefined): SourceFilter {
  if (filter === 'review' || filter === 'fallback' || filter === 'proxy' || filter === 'live') {
    return filter;
  }
  return 'all';
}

function rowMatchesSourceFilter(row: SourceRow, filter: SourceFilter, locale: Locale): boolean {
  if (filter === 'all') return true;
  if (filter === 'review') {
    return row.trustState !== 'live' || row.alertLevel !== 'normal' || row.status !== 'ok';
  }
  if (filter === 'fallback') return row.trustState === 'fallback' || row.status === 'seed' || row.status === 'fallback';
  if (filter === 'proxy') {
    if (locale === 'zh') {
      return row.trustState === 'proxy' || row.sourceType.includes('代理') || row.sourceType.includes('派生');
    }
    return row.trustState === 'proxy';
  }
  return row.trustState === 'live';
}

function sourcesQueryHref(locale: Locale, filter: SourceFilter, focusMetricKey?: string): Route {
  const params = new URLSearchParams();
  if (filter !== 'all') params.set('filter', filter);
  if (focusMetricKey) params.set('focus', focusMetricKey);
  const base = hrefFor(locale, 'sources');
  const query = params.toString();
  return (query ? `${base}?${query}` : base) as Route;
}

function trustClass(state: string): string {
  if (state === 'live') return 'border-success bg-success-soft text-success';
  if (state === 'proxy') return 'border-accent bg-accent-soft text-accent';
  if (state === 'fallback') return 'border-warning bg-warning-soft text-warning';
  return 'border-danger bg-danger-soft text-danger';
}

function alertColor(level: AlertLevel): string {
  if (level === 'alert') return 'text-danger';
  if (level === 'watch') return 'text-warning';
  return 'text-success';
}

function actionToneClass(priority: ActionPriority): string {
  if (priority === 'critical') return 'border-danger bg-danger-soft text-danger';
  if (priority === 'review') return 'border-warning bg-warning-soft text-warning';
  return 'border-line bg-surface-muted text-muted';
}

function labeled(
  table: Record<string, string>,
  key: string,
  fallback: string
): string {
  return lookupTable(table, key) ?? fallback;
}

function localizeSource(value: string, copy: SourcesMessages, locale: Locale): string {
  const literals = copy.read_model_literals as Record<string, string>;
  if (!value) return copy.read_model_fallbacks.no_data;
  const exact = literals[value];
  if (exact) return exact;
  let next = value;
  for (const [from, to] of Object.entries(copy.read_model_replacements as Record<string, string>)) {
    next = next.replaceAll(from, to);
  }
  if (locale !== 'zh' && CJK.test(next)) {
    return copy.read_model_fallbacks.coverage_unavailable;
  }
  return next;
}

function localizeScalar(value: string, copy: SourcesMessages, locale: Locale): string {
  const literals = copy.read_model_literals as Record<string, string>;
  const exact = literals[value];
  if (exact) return exact;
  if (locale !== 'zh' && CJK.test(value)) {
    return copy.read_model_fallbacks.coverage_unavailable;
  }
  return value;
}

function surfaceLabel(metricKey: string, fallback: string, copy: SourcesMessages): string {
  return labeled(copy.surfaces as Record<string, string>, metricKey, fallback);
}

function trustLabel(state: string, copy: SourcesMessages): string {
  return labeled(copy.trust as Record<string, string>, state, state);
}

function statusLabel(status: string, copy: SourcesMessages): string {
  return labeled(copy.status as Record<string, string>, status, status);
}

function alertLabel(level: AlertLevel, copy: SourcesMessages): string {
  return labeled(copy.alert as Record<string, string>, level, level);
}

function sourceTypeLabel(row: SourceRow, copy: SourcesMessages, locale: Locale): string {
  if (locale === 'zh') return row.sourceType;
  return labeled(copy.source_type as Record<string, string>, row.trustState, row.sourceType);
}

function reviewHref(locale: Locale, priority: ActionPriority): Route {
  if (priority === 'critical') return hrefFor(locale, 'admin');
  if (priority === 'review') return hrefFor(locale, 'reports');
  return hrefFor(locale, locale === 'de' ? 'dashboard' : 'reports');
}

function localizedReviewAction(
  row: SourceRow,
  locale: Locale,
  copy: SourcesMessages
): { label: string; detail: string; href: Route } {
  const href = reviewHref(locale, row.reviewAction.priority);
  if (locale === 'zh') {
    return { label: row.reviewAction.label, detail: row.reviewAction.detail, href };
  }
  const action = copy.review_actions[row.reviewAction.priority];
  return { label: action.label, detail: action.detail, href };
}

function reasonFor(row: SourceRow, copy: SourcesMessages): string {
  if (row.trustState === 'fallback') return copy.reasons.fallback;
  if (row.status !== 'ok') {
    return interpolate(copy.reasons.status, { status: statusLabel(row.status, copy) });
  }
  if (row.trustState === 'proxy') return copy.reasons.proxy;
  if (row.alertLevel !== 'normal') {
    return interpolate(copy.reasons.alert, { alert: alertLabel(row.alertLevel, copy) });
  }
  return copy.reasons.ok;
}

function postureKey(readModel: SourcesReadModel): 'review' | 'proxy' | 'ready' {
  if (readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0) {
    return 'review';
  }
  if (readModel.summary.proxyCount > 0) return 'proxy';
  return 'ready';
}

function freshnessFor(rows: SourceRow[], copy: SourcesMessages): string {
  const lags = rows
    .map((row) => row.lagMinutes)
    .filter((value): value is number => Number.isFinite(value));
  if (!lags.length) return copy.freshness.unknown;
  return interpolate(copy.freshness.latest, { lag: formatSourceCoverageLag(Math.min(...lags)) });
}

// figure-contract-lint-ignore: refresh countdown, not a measurement
function formatEta(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'n/a';
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function sparklinePoints(encoded: string): string | null {
  if (!encoded) return null;
  const values = encoded
    .split(',')
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item));
  if (values.length < 2) return null;
  const width = 120;
  const height = 28;
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => {
      const x = Number((index * step).toFixed(2));
      const y = Number((height - (value / 100) * height).toFixed(2));
      return `${x},${y}`;
    })
    .join(' ');
  return points;
}

export type SourcesPageProps = {
  locale: Locale;
  readModel: SourcesReadModel;
  marketHealth?: MarketHealth | null;
  focusMetricKey?: string;
  filter?: string;
};

export async function loadSourcesPageProps(
  locale: Locale,
  searchParams?: Promise<Record<string, string | string[] | undefined>>
): Promise<SourcesPageProps> {
  const resolvedParams = searchParams ? await searchParams : {};
  const focusRaw = resolvedParams?.focus;
  const filterRaw = resolvedParams?.filter;
  const features = SOURCES_FEATURES[locale];
  const [readModel, marketHealth] = await Promise.all([
    getSourcesReadModel(),
    features.show_market_health ? getMarketHealth() : Promise.resolve(null)
  ]);
  return {
    locale,
    readModel,
    marketHealth,
    focusMetricKey: firstParam(focusRaw),
    filter: firstParam(filterRaw)
  };
}

export function SourcesPage({
  locale,
  readModel,
  marketHealth = null,
  focusMetricKey,
  filter
}: SourcesPageProps) {
  const copy = messagesFor(locale).sources;
  const features = SOURCES_FEATURES[locale];
  const showExtendedColumns = locale === 'zh';
  const activeFilter = normalizeSourceFilter(filter);
  const visibleRows = readModel.rows.filter((row) => rowMatchesSourceFilter(row, activeFilter, locale));
  const reviewRows = readModel.rows.filter((row) => rowMatchesSourceFilter(row, 'review', locale));
  const actionRows = reviewRows.filter((row) => row.reviewAction.priority !== 'normal').slice(0, 4);
  const hasActionRows = actionRows.length > 0;
  const asOf = readModel.isFallback ? null : readModel.generatedAt;
  const needsReview = reviewRows.length;
  const reviewTone =
    needsReview > 0
      ? readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
        ? 'text-danger'
        : 'text-warning'
      : 'text-success';
  const trustTone =
    readModel.isFallback || readModel.summary.fallbackCount > 0 || readModel.summary.degradedCount > 0
      ? 'text-danger'
      : readModel.summary.proxyCount > 0
        ? 'text-warning'
        : 'text-success';
  const posture = postureKey(readModel);
  const trustPosture = copy.trust_posture[posture];
  const freshness = freshnessFor(readModel.rows, copy);
  const completenessLabel =
    readModel.completeness.value == null ? '—' : `${Math.round(readModel.completeness.value)}%`;
  const columnCount = showExtendedColumns ? 17 : 15;

  const sourceFilterHref = (key: SourceFilter) => sourcesQueryHref(locale, key, focusMetricKey);
  const sourceFocusHref = (metricKey: string) => sourcesQueryHref(locale, activeFilter, metricKey);
  const clearFocusHref = sourcesQueryHref(locale, activeFilter);
  const reviewFilterHref = sourcesQueryHref(locale, 'review');

  const footerSources: SourceRef[] = [
    {
      id: 'sources-read-model',
      label: readModel.isFallback
        ? interpolate(copy.footer.source_fallback, {
            error: readModel.error ?? copy.footer.unknown_error
          })
        : copy.footer.source_ok,
      asOf,
      basis: readModel.isFallback ? 'assumption' : 'observed'
    }
  ];
  if (features.show_market_health) {
    footerSources.push({
      id: 'market-health-api',
      label: marketHealth ? copy.footer.health_ok : copy.footer.health_unavailable,
      basis: marketHealth ? 'observed' : 'assumption'
    });
  }

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      {features.show_focus_scroll ? <FocusScroll focusMetricKey={focusMetricKey} /> : null}
      <SignalRow label={copy.signal_row_label}>
        <MetricCard
          label={copy.metrics.needs_review.label}
          value={`${needsReview}`}
          valueClassName={`${reviewTone} tabular-nums`}
          hint={
            needsReview > 0
              ? interpolate(copy.metrics.needs_review.hint_open, {
                  fallback: readModel.summary.fallbackCount,
                  degraded: readModel.summary.degradedCount
                })
              : copy.metrics.needs_review.hint_clear
          }
        />
        <MetricCard
          label={copy.metrics.trust_posture.label}
          value={trustPosture}
          valueClassName={trustTone}
          hint={copy.trust_hint[posture]}
        />
        <MetricCard
          label={copy.metrics.average_confidence.label}
          value={`${Math.round(readModel.summary.averageConfidence * 100)}%`}
          valueClassName={`${trustTone} tabular-nums`}
          hint={interpolate(copy.metrics.average_confidence.hint, {
            completeness: completenessLabel,
            freshness
          })}
        />
        <MetricCard
          label={copy.metrics.input_mix.label}
          value={interpolate(copy.metrics.input_mix.value, { live: readModel.summary.liveCount })}
          valueClassName="tabular-nums"
          hint={interpolate(copy.metrics.input_mix.hint, {
            proxy: readModel.summary.proxyCount,
            fallback: readModel.summary.fallbackCount,
            degraded: readModel.summary.degradedCount
          })}
        />
      </SignalRow>

      {features.show_provenance_summary ? (
        <Panel locale={locale} title={copy.panels.provenance.title} why={copy.panels.provenance.why}>
          <ProvenanceSummary
            summary={readModel.summary}
            completeness={readModel.completeness}
            generatedAt={readModel.isFallback ? null : readModel.generatedAt}
          />
        </Panel>
      ) : null}

      {features.show_coverage_panel ? (
        <Panel locale={locale} title={copy.panels.coverage.title} why={copy.panels.coverage.why}>
          <SourceCoveragePanel
            metrics={readModel.coverageMetrics}
            completeness={readModel.completeness}
            degraded={readModel.degraded}
          />
        </Panel>
      ) : null}

      {features.show_market_health ? (
        <Panel locale={locale} title={copy.panels.market_health.title} why={copy.panels.market_health.why}>
          {marketHealth ? (
            <div className="space-y-2 text-sm text-muted">
              <p>
                {interpolate(copy.market_health.line1, {
                  interval: marketHealth.refresh_interval_seconds,
                  age: formatEta(marketHealth.age_seconds),
                  eta: formatEta(marketHealth.next_refresh_eta_seconds)
                })}{' '}
                <code>{marketHealth.latest_status ?? copy.table.na}</code>
              </p>
              <p>
                {interpolate(copy.market_health.line2, {
                  ok: marketHealth.runs_ok,
                  total: marketHealth.runs_total
                })}
                {marketHealth.success_rate != null
                  ? interpolate(copy.market_health.success, {
                      rate: (marketHealth.success_rate * 100).toFixed(0)
                    })
                  : ''}
              </p>
              <p className="text-xs text-subtle">{marketHealth.note}</p>
            </div>
          ) : (
            <p className="rounded-xl border border-warning bg-warning-soft p-4 text-sm text-warning">
              {copy.market_health.unavailable}
            </p>
          )}
        </Panel>
      ) : null}

      <Panel locale={locale} title={copy.panels.recovery.title} why={copy.panels.recovery.why}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
            {interpolate(copy.recovery.review_badge, { count: reviewRows.length })}
          </span>
          <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
            {interpolate(copy.recovery.priority_badge, { count: actionRows.length })}
          </span>
          <Link
            href={hrefFor(locale, 'admin')}
            className="rounded-xl border border-accent bg-accent-soft px-3 py-1.5 font-semibold text-accent hover:bg-accent-hover"
          >
            {copy.recovery.open_admin}
          </Link>
          <Link
            href={reviewFilterHref}
            className="rounded-xl border border-line bg-surface px-3 py-1.5 font-semibold text-muted hover:border-accent hover:bg-accent-soft"
          >
            {copy.recovery.show_review}
          </Link>
          {locale === 'de' ? (
            <Link
              href={hrefFor(locale, 'dashboard')}
              className="rounded-xl border border-line bg-surface px-3 py-1.5 font-semibold text-muted hover:border-accent hover:bg-accent-soft"
            >
              {copy.recovery.back_dashboard}
            </Link>
          ) : null}
        </div>
        {hasActionRows ? (
          <ol className="mt-4 divide-y divide-line border-y border-line">
            {actionRows.map((row) => {
              const action = localizedReviewAction(row, locale, copy);
              return (
                <li
                  key={row.metricKey}
                  className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(10rem,14rem)_1fr_auto] md:items-start"
                >
                  <div>
                    <p className="font-semibold text-ink">
                      {surfaceLabel(row.metricKey, locale === 'zh' ? row.surface : row.metricKey, copy)}
                    </p>
                    <p className="mt-1 text-xs text-subtle">
                      {localizeSource(row.source, copy, locale)} · {statusLabel(row.status, copy)}
                    </p>
                  </div>
                  <div>
                    <span
                      className={`inline-flex rounded-xl border px-2.5 py-1 text-xs font-semibold ${actionToneClass(row.reviewAction.priority)}`}
                    >
                      {action.label}
                    </span>
                    <p className="mt-2 leading-6 text-muted">{action.detail}</p>
                  </div>
                  <Link
                    href={action.href}
                    className="rounded-xl border border-line bg-surface px-3 py-1.5 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                  >
                    {copy.recovery.open_action}
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-4 border-y border-line py-3 text-sm leading-6 text-muted">{copy.recovery.empty}</p>
        )}
      </Panel>

      <Panel locale={locale} title={copy.panels.matrix.title} why={copy.panels.matrix.why}>
        <p className="mb-3 text-xs text-muted">
          {asOf
            ? interpolate(copy.table.generated, {
                when: new Date(asOf).toLocaleString(DATE_TAG[locale])
              })
            : copy.table.no_stamp}
          {readModel.isFallback ? copy.table.fallback_note : ''}
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {SOURCE_FILTERS.map((key) => {
            const count = readModel.rows.filter((row) => rowMatchesSourceFilter(row, key, locale)).length;
            const isActive = activeFilter === key;
            const chip = copy.filters[key];
            return (
              <Link
                key={key}
                href={sourceFilterHref(key)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-surface text-muted hover:border-line-strong hover:bg-surface-muted'
                }`}
                title={chip.hint}
              >
                {chip.label} <span className="ml-1 text-subtle">{count}</span>
              </Link>
            );
          })}
          <span className="text-xs text-subtle">
            {interpolate(copy.table.showing, { visible: visibleRows.length, total: readModel.rows.length })}
          </span>
        </div>
        {focusMetricKey ? (
          <p className="mb-3 text-xs text-accent">
            {copy.table.focus_banner} <code>{focusMetricKey}</code>{' '}
            <Link href={clearFocusHref} className="underline text-accent">
              {copy.table.clear_focus}
            </Link>
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm tabular-nums text-muted">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-3 pr-4">{copy.table.surface}</th>
                <th className="py-3 pr-4">{copy.table.source}</th>
                <th className="py-3 pr-4">{copy.table.trust}</th>
                <th className="py-3 pr-4">{copy.table.scope}</th>
                <th className="py-3 pr-4">{copy.table.confidence}</th>
                {showExtendedColumns ? <th className="py-3 pr-4">{copy.table.as_of}</th> : null}
                <th className="py-3 pr-4">{copy.table.lag}</th>
                <th className="py-3 pr-4">{copy.table.status}</th>
                {showExtendedColumns ? <th className="py-3 pr-4">{copy.table.fallback}</th> : null}
                <th className="py-3 pr-4">{copy.table.value}</th>
                <th className="py-3 pr-4">{copy.table.change_1d}</th>
                <th className="py-3 pr-4">{copy.table.change_7d}</th>
                <th className="py-3 pr-4">{copy.table.change_30d}</th>
                <th className="py-3 pr-4">{copy.table.volatility}</th>
                <th className="py-3 pr-4">{copy.table.trend}</th>
                <th className="py-3 pr-4">{copy.table.action}</th>
                <th className="py-3">{copy.table.reason}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const action = localizedReviewAction(row, locale, copy);
                const sparkline = sparklinePoints(row.sparkline);
                const surface = surfaceLabel(
                  row.metricKey,
                  locale === 'zh' ? row.surface : row.metricKey,
                  copy
                );
                return (
                  <tr
                    key={row.surface}
                    id={`metric-${row.metricKey}`}
                    className={`border-b border-line ${
                      focusMetricKey === row.metricKey
                        ? 'ring-1 ring-accent/60 bg-accent-soft'
                        : row.alertLevel === 'alert'
                          ? 'bg-danger-soft'
                          : row.alertLevel === 'watch'
                            ? 'bg-warning-soft'
                            : ''
                    }`}
                  >
                    <td className="py-3 pr-4 font-medium text-ink">{surface}</td>
                    <td className="py-3 pr-4">{localizeSource(row.source, copy, locale)}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-xl border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-[0.18em] ${trustClass(row.trustState)}`}
                      >
                        {trustLabel(row.trustState, copy)}
                      </span>
                      <span className="mt-1 block text-xs text-subtle">{sourceTypeLabel(row, copy, locale)}</span>
                    </td>
                    <td className="py-3 pr-4">{row.scope}</td>
                    <td className="py-3 pr-4">{row.confidence}</td>
                    {showExtendedColumns ? <td className="py-3 pr-4 text-xs text-subtle">{row.asOf}</td> : null}
                    <td className="py-3 pr-4">{localizeScalar(row.lag, copy, locale)}</td>
                    <td className="py-3 pr-4">{statusLabel(row.status, copy)}</td>
                    {showExtendedColumns ? (
                      <td className={`py-3 pr-4 font-medium ${row.fallback === 'yes' ? 'text-warning' : 'text-success'}`}>
                        {row.fallback}
                      </td>
                    ) : null}
                    <td className="py-3 pr-4">{localizeScalar(row.value, copy, locale)}</td>
                    <td className="py-3 pr-4">{localizeScalar(row.change1d, copy, locale)}</td>
                    <td className="py-3 pr-4">{localizeScalar(row.change7d, copy, locale)}</td>
                    <td className="py-3 pr-4">{localizeScalar(row.change30d, copy, locale)}</td>
                    <td className={`py-3 pr-4 font-medium ${alertColor(row.alertLevel)}`}>
                      {alertLabel(row.alertLevel, copy)}
                    </td>
                    <td className="py-3 pr-4">
                      {sparkline ? (
                        <svg
                          viewBox="0 0 120 28"
                          className="h-7 w-[120px]"
                          role="img"
                          aria-label={interpolate(copy.table.trend_alt, { surface })}
                        >
                          <polyline
                            className="fill-none stroke-series-1"
                            strokeWidth="2"
                            points={sparkline}
                          />
                        </svg>
                      ) : (
                        <span className="text-subtle">{copy.table.na}</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex min-w-24 flex-col gap-2">
                        <Link
                          href={sourceFocusHref(row.metricKey)}
                          className="rounded-xl border border-line bg-surface px-2.5 py-1 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                        >
                          {copy.table.focus}
                        </Link>
                        <Link
                          href={action.href}
                          className="rounded-xl border border-line bg-surface px-2.5 py-1 text-center text-xs font-semibold text-muted hover:border-accent hover:bg-accent-soft"
                        >
                          {row.reviewAction.priority === 'normal' ? copy.table.record : copy.table.handle}
                        </Link>
                      </div>
                    </td>
                    <td className="py-3">
                      {locale === 'zh' ? (
                        <>
                          <span className="block text-muted">{row.degradedReason}</span>
                          {row.note !== row.degradedReason ? (
                            <span className="mt-1 block text-xs text-subtle">{row.note}</span>
                          ) : null}
                          <span className="mt-2 block text-xs font-semibold text-muted">{row.reviewAction.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-subtle">{row.reviewAction.detail}</span>
                        </>
                      ) : (
                        <>
                          <span className="block text-muted">{reasonFor(row, copy)}</span>
                          <span className="mt-2 block text-xs font-semibold text-muted">{action.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-subtle">{action.detail}</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="py-6 text-center text-sm text-subtle">
                    {copy.table.empty}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <SourceFooter
        locale={locale}
        sources={footerSources}
        methodHref={hrefFor(locale, 'sources')}
        methodLabel={copy.footer.method_label}
        limitations={copy.footer.limitations}
      />
    </PageTemplate>
  );
}
