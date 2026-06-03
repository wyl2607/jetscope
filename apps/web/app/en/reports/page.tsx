import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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
    en: '/en/reports'
  }
});

const reports: Array<{ title: string; description: string; href: Route; status: string }> = [
  {
    title: 'Tipping-point report',
    description: 'Primary long-form report tying reserve pressure, fuel economics, airline decision probability, and research signals together.',
    href: '/reports/tipping-point-analysis' as Route,
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
  const readiness = readModel.isFallback || sourceStatus.overall !== 'ok' ? 'Review needed' : 'Publish candidate';
  const readinessHint = readModel.isFallback
    ? `The report surface can render, but the local API fallback is active: ${readModel.error ?? 'unknown cause'}.`
    : sourceStatus.overall !== 'ok'
      ? `Source status is ${sourceStatusLabel(sourceStatus.overall)}; review source evidence before launch or publication.`
      : 'Report entry points can be reviewed from the current read model.';
  const riskHref = topRiskSignal
    ? (`/en/sources?focus=${encodeURIComponent(topRiskSignal.metricKey)}` as Route)
    : undefined;

  return (
    <Shell
      locale="en"
      eyebrow="Report readiness"
      title="Report Workbench"
      description="Put cockpit data, source health, saved scenarios, and report entry points into one launch-review checklist."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Source status"
          value={sourceStatusLabel(sourceStatus.overall)}
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
        <MetricCard
          label="Launch posture"
          value={readiness}
          hint={readinessHint}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <InfoCard title="Report catalog" subtitle="Reviewable, clickable, and ready to extend">
          <div className="space-y-4">
            {reports.map((report) => (
              <Link
                key={report.href}
                href={report.href}
                className="block rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">{report.status}</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">{report.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-700">{report.description}</p>
              </Link>
            ))}
          </div>
        </InfoCard>

        <InfoCard title="Pre-launch actions" subtitle="The next report step is evidence review, not guesswork">
          <div className="space-y-3">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:bg-sky-50"
              >
                <p className="font-semibold text-slate-950">{action.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{action.description}</p>
              </Link>
            ))}
          </div>
        </InfoCard>
      </section>
    </Shell>
  );
}
