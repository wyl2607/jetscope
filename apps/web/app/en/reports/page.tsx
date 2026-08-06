import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Report Workbench',
  description:
    'English JetScope report readiness workbench for source status, saved scenarios, risk signals, and launch posture.',
  path: '/en/reports',
  alternateLanguages: {
    'zh-CN': '/reports',
    de: '/de/reports',
    en: '/en/reports'
  }
});

const reports: Array<{ title: string; description: string; href: Route; status: string }> = [
  {
    title: 'Tipping-point report',
    description: 'Primary long-form report tying reserve pressure, fuel economics, airline decision probability, and research signals together.',
    href: '/en/reports/tipping-point-analysis' as Route,
    status: 'Connected to live read model'
  }
];

const actions: Array<{ label: string; href: Route; description: string }> = [
  {
    label: 'Review source evidence',
    href: '/en/sources?filter=review' as Route,
    description: 'Check fallback, proxy, degraded, and volatility rows before treating report output as decision evidence.'
  },
  {
    label: 'Open decision cockpit',
    href: '/en/dashboard' as Route,
    description: 'Return to the current market snapshot, source posture, scenarios, and top risk signal.'
  },
  {
    label: 'Open research workbench',
    href: '/en/research' as Route,
    description: 'Confirm whether research signals are enabled, empty, degraded, or ready for explanatory use.'
  }
];

function formatPercent(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return `${Number(value).toFixed(0)}%`;
}

function sourceStatusLabel(status: string): string {
  if (status === 'ok') return 'healthy';
  if (status === 'degraded') return 'degraded';
  if (status === 'offline') return 'offline';
  if (status === 'unknown') return 'unknown';
  return status;
}

// Section 1 rule 5: the tint states a fact about the data. A page that renders
// "Review needed" in the same colour as everything else has reported the
// problem without encoding it.
function sourceStatusTone(status: string): string {
  if (status === 'ok') return 'text-success';
  if (status === 'offline') return 'text-danger';
  return 'text-warning';
}

function freshnessLabel(level: string): string {
  if (level === 'fresh') return 'fresh';
  if (level === 'stale') return 'stale';
  if (level === 'critical') return 'critical';
  return level;
}

function riskLabel(level: string): string {
  if (level === 'normal') return 'normal';
  if (level === 'watch') return 'watch';
  if (level === 'alert') return 'alert';
  return level;
}

export default async function EnglishReportsPage() {
  const readModel = await getDashboardReadModel('en');
  const sourceStatus = readModel.market.source_status;
  const topRiskSignal = readModel.topRiskSignal;
  const latestScenarioNames = readModel.recentScenarioNames.length
    ? readModel.recentScenarioNames.join(' / ')
    : 'No saved scenario yet.';
  const needsReview = readModel.isFallback || sourceStatus.overall !== 'ok';
  const readiness = needsReview ? 'Review needed' : 'Publish candidate';
  const readinessHint = readModel.isFallback
    ? `The report surface can render, but the local API fallback is active: ${readModel.error ?? 'unknown cause'}.`
    : sourceStatus.overall !== 'ok'
      ? `Source status is ${sourceStatusLabel(sourceStatus.overall)}; review source evidence before launch or publication.`
      : 'Report entry points can be reviewed from the current read model.';
  const riskHref = topRiskSignal
    ? (`/en/sources?focus=${encodeURIComponent(topRiskSignal.metricKey)}` as Route)
    : undefined;

  // The fallback read model stamps itself with the current time, so rendering
  // that as a data timestamp would present fabricated values as fresh. No stamp
  // is the honest answer here; the footer says why.
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  return (
    <PageTemplate
      locale="en"
      eyebrow="Report readiness"
      title="Report Workbench"
      question="Is this report solid enough to be published as decision evidence right now?"
      asOf={asOf}
    >
      <SignalRow label="Launch readiness signals">
        {/* Section 2 rule 2: the verdict leads. A reader who stops after the
            first card still leaves with the answer to the question above. */}
        <MetricCard
          label="Launch posture"
          value={readiness}
          valueClassName={needsReview ? 'text-warning' : 'text-success'}
          hint={readinessHint}
        />
        <MetricCard
          label="Source status"
          value={sourceStatusLabel(sourceStatus.overall)}
          valueClassName={sourceStatusTone(sourceStatus.overall)}
          hint={`Confidence ${formatPercent((sourceStatus.confidence ?? 0) * 100)} | fallback rate ${formatPercent(sourceStatus.fallback_rate)} | ${freshnessLabel(readModel.freshnessSignal.level)} ${readModel.freshnessSignal.minutes} min.`}
        />
        <MetricCard
          label="Scenario count"
          value={`${readModel.scenarioCount}`}
          hint={latestScenarioNames}
        />
        <MetricCard
          label="Risk signal"
          value={topRiskSignal ? `${topRiskSignal.metric} ${topRiskSignal.window}` : 'No anomaly'}
          hint={
            topRiskSignal
              ? `${riskLabel(topRiskSignal.level)} | ${topRiskSignal.changePct > 0 ? '+' : ''}${topRiskSignal.changePct.toFixed(2)}%`
              : 'The market history window has not produced a ranked alert yet.'
          }
          valueHref={riskHref}
        />
      </SignalRow>

      <Panel
        locale="en"
        title="Report catalog"
        why="Each report entry point, and whether it is wired to live data or to a static narrative."
      >
          <div className="space-y-4">
            {reports.map((report) => (
              <Link
                key={report.href}
                href={report.href}
                className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{report.status}</p>
                <h3 className="mt-2 text-lg font-medium text-ink">{report.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{report.description}</p>
              </Link>
            ))}
          </div>
      </Panel>

      <Panel
        locale="en"
        title="Pre-launch actions"
        why="The next report step is evidence review, not guesswork - every entry point leads to something verifiable."
      >
          <div className="space-y-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
              >
                <p className="font-medium text-ink">{action.label}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
              </Link>
            ))}
          </div>
      </Panel>

      <SourceFooter
        locale="en"
        sources={[
          {
            id: 'dashboard-read-model',
            label: readModel.isFallback
              ? `Market snapshot API unreachable; built-in fallback values are in use (${readModel.error ?? 'unknown cause'})`
              : 'Market snapshot API (source status, confidence, fallback rate, freshness)',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'scenario-store',
            label: `Local scenario store (${readModel.scenarioCount} saved scenarios)`,
            basis: 'observed'
          },
          {
            id: 'risk-signal',
            label: 'The risk signal is derived from movement across the market history window, not supplied upstream',
            basis: 'derived'
          }
        ]}
        methodHref="/en/sources"
        methodLabel="Source and method list"
        limitations={[
          '"Publish candidate" means the data path is reviewable, not that a human has reviewed the conclusion.',
          'The risk signal depends on history-window sample size. No alert on thin samples does not mean no risk.',
          'Saved scenarios are local assumptions for review and discussion; they do not replace procurement approval.'
        ]}
      />
    </PageTemplate>
  );
}
