import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { messagesFor, type Locale, type ReportsMessages } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * One reports workbench for three real routes. Copy comes from
 * `src/locales/*.json`. The thin `app/reports`, `app/de/reports` and
 * `app/en/reports` pages pass the locale they already own; they do not rewrite
 * the public URL.
 *
 * Next-action sets stay distinct by locale. Catalog and signal cards do not.
 * Hrefs come from NAV_ENTRIES plus a suffix, never a hardcoded locale prefix.
 */
const CATALOG = [{ id: 'tipping_point', navId: 'reports', suffix: '/tipping-point-analysis' }] as const;

const ACTION_IDS = {
  zh: ['tipping_point', 'review_sources', 'dashboard'],
  de: ['review_sources', 'dashboard', 'admin'],
  en: ['review_sources', 'dashboard', 'research']
} as const;

const ACTION_TARGET = {
  tipping_point: { navId: 'reports', suffix: '/tipping-point-analysis' },
  review_sources: { navId: 'sources', suffix: '?filter=review' },
  dashboard: { navId: 'dashboard', suffix: '' },
  admin: { navId: 'admin', suffix: '' },
  research: { navId: 'research', suffix: '' }
} as const;

type NavId = (typeof ACTION_TARGET)[keyof typeof ACTION_TARGET]['navId'];

const CJK = /[\u4e00-\u9fff]/;

function hrefFor(locale: Locale, navId: NavId, suffix = ''): Route {
  const path = NAV_ENTRIES.find((entry) => entry.id === navId)?.path[locale];
  if (!path) {
    throw new Error(`Reports has no ${locale} path for ${navId}`);
  }
  return `${path}${suffix}` as Route;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

function formatPercent(value?: number | null): string { // figure-contract-lint-ignore: internal formatter parameter, not a prop
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return `${Number(value).toFixed(0)}%`;
}

function sourceStatusLabel(status: string, copy: ReportsMessages['source']): string {
  if (status === 'ok') return copy.ok;
  if (status === 'degraded') return copy.degraded;
  if (status === 'offline') return copy.offline;
  if (status === 'unknown') return copy.unknown;
  return status;
}

// Unknown and degraded stay warning. Do not wash them to muted.
function sourceStatusTone(status: string): string {
  if (status === 'ok') return 'text-success';
  if (status === 'offline') return 'text-danger';
  return 'text-warning';
}

function freshnessLabel(level: string, copy: ReportsMessages['freshness']): string {
  if (level === 'fresh') return copy.fresh;
  if (level === 'stale') return copy.stale;
  if (level === 'critical') return copy.critical;
  return level;
}

function riskLabel(level: string, copy: ReportsMessages['risk']): string {
  if (level === 'normal') return copy.normal;
  if (level === 'watch') return copy.watch;
  if (level === 'alert') return copy.alert;
  return level;
}

function scenarioSummary(names: string[], locale: Locale, copy: ReportsMessages['scenarios']): string {
  if (!names.length) return copy.empty;

  return names
    .map((name, index) => {
      const matchesLocale = locale === 'zh' ? CJK.test(name) : !CJK.test(name);
      return matchesLocale ? name : copy.placeholder.replace('{n}', String(index + 1));
    })
    .join(' / ');
}

export async function ReportsPage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).reports;
  const readModel = await getDashboardReadModel(locale);
  const sourceStatus = readModel.market.source_status;
  const topRiskSignal = readModel.topRiskSignal;
  const latestScenarioNames = scenarioSummary(readModel.recentScenarioNames, locale, copy.scenarios);
  const needsReview = readModel.isFallback || sourceStatus.overall !== 'ok';
  const readiness = needsReview ? copy.readiness.review : copy.readiness.publish;
  const unknownCause = copy.footer.unknown_cause;
  const readinessHint = readModel.isFallback
    ? fill(copy.readiness.hint_fallback, { error: readModel.error ?? unknownCause })
    : sourceStatus.overall !== 'ok'
      ? fill(copy.readiness.hint_source, { status: sourceStatusLabel(sourceStatus.overall, copy.source) })
      : copy.readiness.hint_ok;
  const riskHref = topRiskSignal
    ? hrefFor(locale, 'sources', `?focus=${encodeURIComponent(topRiskSignal.metricKey)}`)
    : undefined;

  // The fallback read model stamps itself with the current time. No stamp is
  // the honest answer; the footer says why.
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      <SignalRow label={copy.signals_label}>
        {/* The verdict leads. A reader who stops after the first card still
            leaves with the answer to the question above. */}
        <MetricCard
          label={copy.readiness.label}
          value={readiness}
          valueClassName={needsReview ? 'text-warning' : 'text-success'}
          hint={readinessHint}
        />
        <MetricCard
          label={copy.source.label}
          value={sourceStatusLabel(sourceStatus.overall, copy.source)}
          valueClassName={sourceStatusTone(sourceStatus.overall)}
          hint={fill(copy.source.hint, {
            confidence: formatPercent((sourceStatus.confidence ?? 0) * 100),
            fallback_rate: formatPercent(sourceStatus.fallback_rate),
            freshness: freshnessLabel(readModel.freshnessSignal.level, copy.freshness),
            minutes: String(readModel.freshnessSignal.minutes)
          })}
        />
        <MetricCard
          label={copy.risk.label}
          value={topRiskSignal ? `${topRiskSignal.metric} ${topRiskSignal.window}` : copy.risk.none}
          hint={
            topRiskSignal
              ? fill(copy.risk.hint, {
                  level: riskLabel(topRiskSignal.level, copy.risk),
                  change: `${topRiskSignal.changePct > 0 ? '+' : ''}${topRiskSignal.changePct.toFixed(2)}%`
                })
              : copy.risk.empty
          }
          valueHref={riskHref}
        />
        <MetricCard label={copy.scenarios.label} value={`${readModel.scenarioCount}`} hint={latestScenarioNames} />
      </SignalRow>

      <Panel locale={locale} title={copy.catalog.title} why={copy.catalog.why}>
        <div className="space-y-4">
          {CATALOG.map((report) => {
            const item = copy.catalog[report.id];
            const href = hrefFor(locale, report.navId, report.suffix);
            return (
              <Link
                key={href}
                href={href}
                className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{item.status}</p>
                <h3 className="mt-2 text-lg font-medium text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
              </Link>
            );
          })}
        </div>
      </Panel>

      <Panel locale={locale} title={copy.actions.title} why={copy.actions.why}>
        <div className="space-y-3">
          {ACTION_IDS[locale].map((id) => {
            const action = copy.actions[id];
            const target = ACTION_TARGET[id];
            const href = hrefFor(locale, target.navId, target.suffix);
            return (
              <Link
                key={href}
                href={href}
                className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
              >
                <p className="font-medium text-ink">{action.label}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
              </Link>
            );
          })}
        </div>
      </Panel>

      <SourceFooter
        locale={locale}
        sources={[
          {
            id: 'dashboard-read-model',
            label: readModel.isFallback
              ? fill(copy.footer.source_fallback, { error: readModel.error ?? unknownCause })
              : copy.footer.source_live,
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'scenario-store',
            // Count is observed; the numbers inside a scenario are assumptions.
            label: fill(copy.footer.source_scenarios, { count: String(readModel.scenarioCount) }),
            basis: 'assumption'
          },
          {
            id: 'risk-signal',
            label: copy.footer.source_risk,
            basis: 'derived'
          }
        ]}
        methodHref={hrefFor(locale, 'sources')}
        methodLabel={copy.footer.method_label}
        limitations={copy.footer.limitations}
      />
    </PageTemplate>
  );
}
