import { InfoCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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
  return status;
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
  return status;
}

function readinessToneClass(tone: LaunchReadinessCheck['tone']): string {
  if (tone === 'critical') return 'border-danger bg-danger-soft text-danger';
  if (tone === 'review') return 'border-warning bg-warning-soft text-warning';
  return 'border-success bg-success-soft text-success';
}

function launchImpactLabel(check: LaunchReadinessCheck): string {
  if (check.blocking) return 'Blocks launch';
  if (check.severity === 'review') return 'Review needed';
  return 'Ready for launch';
}

function launchImpactClass(check: LaunchReadinessCheck): string {
  if (check.blocking) return 'border-danger bg-danger-soft text-danger';
  if (check.severity === 'review') return 'border-warning bg-warning-soft text-warning';
  return 'border-success bg-success-soft text-success';
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

  return (
    <Shell
      locale="en"
      eyebrow="Launch operations"
      title="Launch Readiness"
      description="A read-only English view of JetScope prerequisites before launch, publication, or protected refresh operations."
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <InfoCard title="Protected operations" subtitle="Readiness first, writes only in the primary console">
          <ul className="space-y-3 text-sm leading-7 text-muted">
            {protectedOperations.map((task) => (
              <li key={task}>{task}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="Backend contract" subtitle="FastAPI readiness without exposing secrets">
          <div className="space-y-3 text-sm leading-7 text-muted">
            <p>Database bootstrap, market snapshots, source coverage, admin token configuration, and AI research readiness are reported by the API readiness contract.</p>
            <p>Secret values are never returned by readiness and are not requested by this English page.</p>
            <p>Protected parameter editing, manual refresh, and token entry stay in the primary admin console.</p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-5">
        <InfoCard title="Launch readiness checks" subtitle={`API readiness: ${readinessStatusLabel(readiness.status)}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-md border px-3 py-1.5 font-semibold ${readiness.ready ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger'}`}>
              {readiness.ready ? 'Ready' : 'Not ready'}
            </span>
            {readiness.degraded ? (
              <span className="rounded-md border border-warning bg-warning-soft px-3 py-1.5 font-semibold text-warning">
                Degraded
              </span>
            ) : null}
            <span className="rounded-md border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
              {readiness.environment} | {readiness.apiPrefix} | schema {readiness.schemaBootstrapMode}
            </span>
          </div>
          {readiness.error ? (
            <p className="mt-4 border-y border-danger py-3 text-sm leading-6 text-danger">
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
                      <span className={`inline-flex w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${readinessToneClass(check.tone)}`}>
                        {checkStatusLabel(check.status)}
                      </span>
                      <span className={`inline-flex w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${launchImpactClass(check)}`}>
                        {launchImpactLabel(check)}
                      </span>
                    </div>
                    <div className="space-y-2 leading-6 text-muted">
                      <p>{safeDetail(check.detail)}</p>
                      {check.configKeys.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span className="font-semibold text-muted">Related config:</span>
                          {check.configKeys.map((configKey) => (
                            <code key={configKey} className="rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[0.72rem] text-muted">
                              {configKey}
                            </code>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Link
                      href={action.href}
                      className="rounded-md border border-line bg-surface px-3 py-1.5 text-center text-xs font-semibold text-accent hover:border-accent hover:bg-accent-soft"
                    >
                      {action.label}
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </InfoCard>
      </section>
    </Shell>
  );
}
