import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getLaunchReadinessReadModel, type LaunchReadinessCheck } from '@/lib/readiness-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Launch Readiness',
  description:
    'English JetScope launch-readiness surface for prerequisites, protected operations, and source/research recovery links.',
  path: '/en/admin',
  alternateLanguages: {
    'zh-CN': '/admin',
    en: '/en/admin'
  }
});

const protectedOperations = [
  'Protected writes, refreshes, and parameter edits remain in the primary admin console.',
  'This English surface is read-only and never displays secret values.',
  'Use readiness checks to decide whether source, research, token, or database work is still required.'
];

const checkLabels: Record<string, string> = {
  database: 'Database',
  market_snapshot: 'Market snapshot',
  source_coverage: 'Source coverage',
  admin_token: 'Admin token',
  ai_research_pipeline: 'AI research pipeline'
};

function readinessStatusLabel(status: string): string {
  if (status === 'ready') return 'Launch candidate';
  if (status === 'degraded') return 'Runnable, needs review';
  if (status === 'not_ready') return 'Not ready';
  return `Unrecognized status: ${status}`;
}

function checkStatusLabel(status: string): string {
  if (status === 'ok') return 'Healthy';
  if (status === 'degraded') return 'Degraded';
  if (status === 'missing') return 'Missing configuration';
  if (status === 'disabled') return 'Disabled';
  if (status === 'missing_credentials') return 'Missing credentials';
  if (status === 'mock') return 'Mock mode';
  if (status === 'seed') return 'Seed data';
  if (status === 'error') return 'Error';
  return `Unrecognized: ${status}`;
}

function readinessToneClass(check: LaunchReadinessCheck): string {
  if (check.tone === 'critical') return 'border-danger bg-danger-soft text-danger';
  if (check.tone === 'review') return 'border-warning bg-warning-soft text-warning';
  if (check.tone === 'ok' && check.status === 'ok') return 'border-success bg-success-soft text-success';
  if (check.tone === 'ok') return 'border-warning bg-warning-soft text-warning';
  return 'border-warning bg-warning-soft text-warning';
}

function launchImpactLabel(check: LaunchReadinessCheck): string {
  if (check.blocking) return 'Blocks launch';
  if (check.severity === 'review') return 'Review needed';
  if (check.severity === 'ok') return 'Ready for launch';
  return 'Unrecognized status';
}

function launchImpactClass(check: LaunchReadinessCheck): string {
  if (check.blocking) return 'border-danger bg-danger-soft text-danger';
  if (check.severity === 'ok') return 'border-success bg-success-soft text-success';
  return 'border-warning bg-warning-soft text-warning';
}

function readinessValueTone(readiness: Awaited<ReturnType<typeof getLaunchReadinessReadModel>>): string {
  if (readiness.error || !readiness.ready) return 'text-danger';
  if (readiness.status === 'ready' && !readiness.degraded) return 'text-success';
  return 'text-warning';
}

function actionFor(check: LaunchReadinessCheck): { label: string; href: Route } {
  if (check.key === 'source_coverage') {
    return { label: check.ok ? 'Open sources' : 'Fix sources', href: '/en/sources?filter=review' as Route };
  }
  if (check.key === 'market_snapshot') {
    return { label: 'Open market sources', href: '/en/sources' as Route };
  }
  if (check.key === 'admin_token') {
    return { label: 'Open primary admin', href: '/admin' as Route };
  }
  if (check.key === 'ai_research_pipeline') {
    return { label: 'Open research', href: '/en/research' as Route };
  }
  return { label: 'Open primary admin', href: '/admin' as Route };
}

function safeDetail(detail: string): string {
  if (/[\u4e00-\u9fff]/.test(detail)) {
    return 'Review this prerequisite in the primary admin console.';
  }
  return detail || 'No detail provided.';
}

export default async function EnglishAdminPage() {
  const readiness = await getLaunchReadinessReadModel();
  const asOf = readiness.error ? null : readiness.generatedAt;
  const blockingCount = readiness.checks.filter((check) => check.blocking).length;
  const reviewCount = readiness.checks.filter((check) => check.severity === 'review').length;

  return (
    <PageTemplate
      locale="en"
      eyebrow="Launch operations"
      title="Launch Readiness"
      question="Can this backend safely write data and go live now?"
      asOf={asOf}
    >
      <SignalRow label="Launch-decision signals">
        <MetricCard
          label="Launch decision"
          value={readinessStatusLabel(readiness.status)}
          valueClassName={readinessValueTone(readiness)}
          hint={readiness.error ? `Readiness API unavailable: ${readiness.error}` : readiness.ready ? 'No prerequisite currently blocks launch.' : 'Resolve blockers before writes or launch.'}
        />
        <MetricCard
          label="Blocking checks"
          value={`${blockingCount}`}
          valueClassName={blockingCount > 0 ? 'text-danger' : 'text-success'}
          hint="Any blocker prevents a safe launch."
        />
        <MetricCard
          label="Review checks"
          value={`${reviewCount}`}
          valueClassName={reviewCount > 0 ? 'text-warning' : 'text-success'}
          hint="Not necessarily blocking, but must be confirmed before launch."
        />
        <MetricCard
          label="Environment context"
          value={`${readiness.environment} · ${readiness.apiPrefix}`}
          hint={`Schema ${readiness.schemaBootstrapMode}; this conclusion applies only to this environment.`}
        />
      </SignalRow>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel locale="en" title="Protected operations" why="These boundaries distinguish read-only checks from actions that must remain in the primary console.">
          <ul className="space-y-3 text-sm leading-7 text-muted">
            {protectedOperations.map((task) => (
              <li key={task}>{task}</li>
            ))}
          </ul>
        </Panel>

        <Panel locale="en" title="Backend contract" why="The readiness contract defines which prerequisites are checked without exposing secret values.">
          <div className="space-y-3 text-sm leading-7 text-muted">
            <p>Database bootstrap, market snapshots, source coverage, admin token configuration, and AI research readiness are reported by the API readiness contract.</p>
            <p>Secret values are never returned by readiness and are not requested by this English page.</p>
            <p>Protected parameter editing, manual refresh, and token entry stay in the primary admin console.</p>
          </div>
        </Panel>
      </div>

      <Panel locale="en" title="Launch readiness checks" why="Each check identifies the prerequisite that blocks launch or still needs confirmation.">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-xl border px-3 py-1.5 font-semibold ${readiness.error || !readiness.ready ? 'border-danger bg-danger-soft text-danger' : readiness.status === 'ready' && !readiness.degraded ? 'border-success bg-success-soft text-success' : 'border-warning bg-warning-soft text-warning'}`}>
            {readiness.ready ? 'Ready' : 'Not ready'}
          </span>
          {readiness.degraded ? (
            <span className="rounded-xl border border-warning bg-warning-soft px-3 py-1.5 font-semibold text-warning">
              Degraded
            </span>
          ) : null}
          <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
            {readiness.environment} | {readiness.apiPrefix} | schema {readiness.schemaBootstrapMode}
          </span>
        </div>
        {readiness.error ? (
          <p className="mt-4 rounded-xl border border-danger bg-danger-soft p-3 text-sm leading-6 text-danger">
            Readiness API is unavailable: {readiness.error}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-line border-y border-line">
            {readiness.checks.map((check) => {
              const action = actionFor(check);
              return (
                <div key={check.key} className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(9rem,12rem)_minmax(11rem,13rem)_1fr_auto] md:items-start">
                  <p className="font-semibold text-ink">{checkLabels[check.key] ?? check.key}</p>
                  <div className="flex flex-col items-start gap-1.5">
                    <span className={`inline-flex w-fit rounded-xl border px-2.5 py-1 text-xs font-semibold ${readinessToneClass(check)}`}>
                      {checkStatusLabel(check.status)}
                    </span>
                    <span className={`inline-flex w-fit rounded-xl border px-2.5 py-1 text-xs font-semibold ${launchImpactClass(check)}`}>
                      {launchImpactLabel(check)}
                    </span>
                  </div>
                  <div className="space-y-2 leading-6 text-muted">
                    <p>{safeDetail(check.detail)}</p>
                    {check.configKeys.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className="font-semibold text-muted">Related config:</span>
                        {check.configKeys.map((configKey) => (
                          <code key={configKey} className="rounded-xl border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[0.72rem] text-muted">
                            {configKey}
                          </code>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Link
                    href={action.href}
                    className="rounded-xl border border-line bg-surface px-3 py-1.5 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                  >
                    {action.label}
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <SourceFooter
        locale="en"
        sources={[
          {
            id: 'launch-readiness-api',
            label: readiness.error ? 'Readiness API currently unavailable' : 'Server-derived Readiness API checks',
            asOf,
            basis: readiness.error ? 'assumption' : 'derived'
          },
          {
            id: 'backend-data-contract',
            label: 'Backend data contract: route_catalog / policy_parameters / market_snapshots / scenarios',
            basis: 'assumption'
          }
        ]}
        methodHref="/en/sources"
        methodLabel="Open source and data conventions"
        limitations={[
          'This page reports the readiness of the current deployment environment, not the upper limit of the product’s capabilities.',
          'Checks are derived server-side from configuration and data contracts; protected writes still require valid admin authorization.'
        ]}
      />
    </PageTemplate>
  );
}
