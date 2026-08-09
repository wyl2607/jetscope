import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { getDictionary, isLocale, localeHref, type Dictionary, type Locale } from '@/lib/i18n';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ locale: string }> };

/** `{name}` placeholders via plain string replace — no third-party i18n runtime. */
function fill(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (out, [key, value]) => out.replaceAll(`{${key}}`, String(value)),
    template
  );
}

function lookup(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

// Section 1 rule 5: the tint states a fact about the data. A page that says
// "needs review" in the same colour as everything else has reported the problem
// without encoding it. Semantic colour, not copy — stays in the page.
function sourceStatusTone(status: string): string {
  if (status === 'ok') return 'text-success';
  if (status === 'offline') return 'text-danger';
  return 'text-warning';
}

function formatPercent(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return `${Number(value).toFixed(0)}%`;
}

/**
 * Scenario names containing CJK are opaque to non-zh readers (and the English
 * page used to show them raw). Replace with a numbered placeholder when the
 * locale is not zh; otherwise keep the stored name.
 */
function scenarioSummary(names: string[], locale: Locale, copy: Dictionary['reports']): string {
  if (!names.length) return copy.no_scenarios;

  return names
    .map((name, index) =>
      locale !== 'zh' && /[\u4e00-\u9fff]/.test(name)
        ? fill(copy.scenario_placeholder, { n: index + 1 })
        : name
    )
    .join(' / ');
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getDictionary(locale).reports;

  return buildPageMetadata({
    title: copy.meta_title,
    description: copy.meta_description,
    path: localeHref(locale, '/reports'),
    alternateLanguages: {
      'zh-CN': '/reports',
      en: '/en/reports',
      de: '/de/reports'
    }
  });
}

export default async function ReportsPage({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = getDictionary(locale).reports;

  // Default locale arg is 'zh'; passing 'zh' is equivalent to the no-arg call.
  const readModel = await getDashboardReadModel(locale);
  const sourceStatus = readModel.market.source_status;
  const topRiskSignal = readModel.topRiskSignal;
  const latestScenarioNames = scenarioSummary(readModel.recentScenarioNames, locale, copy);
  const needsReview = readModel.isFallback || sourceStatus.overall !== 'ok';
  const readiness = needsReview ? copy.readiness_review : copy.readiness_ready;
  const readinessHint = readModel.isFallback
    ? fill(copy.readiness_hint_fallback, {
        error: readModel.error ?? copy.unknown_error
      })
    : sourceStatus.overall !== 'ok'
      ? fill(copy.readiness_hint_degraded, {
          status: lookup(copy.source_status, sourceStatus.overall)
        })
      : copy.readiness_hint_ok;

  // The fallback read model stamps itself with the current time, so rendering
  // that as a data timestamp would present fabricated values as fresh. No stamp
  // is the honest answer here; the footer says why.
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  const riskHref = topRiskSignal
    ? (localeHref(locale, `/sources?focus=${encodeURIComponent(topRiskSignal.metricKey)}`) as Route)
    : undefined;

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      <SignalRow label={copy.signal_row_label}>
        {/* Section 2 rule 2: the verdict leads. A reader who stops after the
            first card still leaves with the answer to the question above. */}
        <MetricCard
          label={copy.metric_readiness}
          value={readiness}
          valueClassName={needsReview ? 'text-warning' : 'text-success'}
          hint={readinessHint}
        />
        <MetricCard
          label={copy.metric_source}
          value={lookup(copy.source_status, sourceStatus.overall)}
          valueClassName={sourceStatusTone(sourceStatus.overall)}
          hint={fill(copy.source_hint, {
            confidence: formatPercent((sourceStatus.confidence ?? 0) * 100),
            fallback: formatPercent(sourceStatus.fallback_rate),
            freshness: lookup(copy.freshness, readModel.freshnessSignal.level),
            minutes: readModel.freshnessSignal.minutes
          })}
        />
        <MetricCard
          label={copy.metric_risk}
          value={topRiskSignal ? `${topRiskSignal.metric} ${topRiskSignal.window}` : copy.risk_none}
          hint={
            topRiskSignal
              ? fill(copy.risk_hint, {
                  level: lookup(copy.risk, topRiskSignal.level),
                  change: `${topRiskSignal.changePct > 0 ? '+' : ''}${topRiskSignal.changePct.toFixed(2)}%`
                })
              : copy.risk_hint_none
          }
          valueHref={riskHref}
        />
        <MetricCard label={copy.metric_scenarios} value={`${readModel.scenarioCount}`} hint={latestScenarioNames} />
      </SignalRow>

      <Panel locale={locale} title={copy.catalog_title} why={copy.catalog_why}>
        <div className="space-y-4">
          {copy.catalog.map((report) => {
            const href = localeHref(locale, report.route) as Route;
            return (
              <Link
                key={href}
                href={href}
                className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{report.status}</p>
                <h3 className="mt-2 text-lg font-medium text-ink">{report.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{report.description}</p>
              </Link>
            );
          })}
        </div>
      </Panel>

      <Panel locale={locale} title={copy.actions_title} why={copy.actions_why}>
        <div className="space-y-3">
          {copy.actions.map((action) => {
            const href = localeHref(locale, action.route) as Route;
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
              ? fill(copy.footer_market_fallback, {
                  error: readModel.error ?? copy.unknown_error
                })
              : copy.footer_market_ok,
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'scenario-store',
            // A scenario is a set of assumptions. That it is saved is observed,
            // but the numbers inside it are what get quoted, so the source
            // carries 'assumption'.
            label: fill(copy.footer_scenario, { count: readModel.scenarioCount }),
            basis: 'assumption'
          },
          {
            id: 'risk-signal',
            label: copy.footer_risk,
            basis: 'derived'
          }
        ]}
        methodHref={localeHref(locale, '/sources') as Route}
        methodLabel={copy.method_label}
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}
