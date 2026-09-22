import { AdminDataOps } from '@/components/admin-data-ops';
import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { messagesFor, type AdminMessages, type Locale } from '@/lib/i18n';
import { NAV_ENTRIES } from '@/lib/navigation';
import {
  getLaunchReadinessReadModel,
  type LaunchReadinessCheck,
  type LaunchReadinessReadModel
} from '@/lib/readiness-read-model';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * One admin view for three real routes. Copy comes from `src/locales/*.json`.
 * The thin `app/admin`, `app/de/admin` and `app/en/admin` pages pass the locale
 * they already own; they do not rewrite the public URL.
 *
 * Product split: `show_admin_ops` is true only in zh.json. de/en stay read-only
 * launch-readiness surfaces and never mount AdminDataOps.
 */

const ACTION_KEYS = [
  'source_coverage',
  'market_snapshot',
  'admin_token',
  'ai_research_pipeline'
] as const;

type ActionKey = (typeof ACTION_KEYS)[number] | 'default';

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

function hrefFor(locale: Locale, navId: string, query = ''): Route {
  const path = NAV_ENTRIES.find((entry) => entry.id === navId)?.path[locale];
  if (!path) {
    throw new Error(`Admin has no ${locale} path for ${navId}`);
  }
  return `${path}${query}` as Route;
}

function actionKeyFor(check: LaunchReadinessCheck): ActionKey {
  if ((ACTION_KEYS as readonly string[]).includes(check.key)) {
    return check.key as (typeof ACTION_KEYS)[number];
  }
  return 'default';
}

function resolveActionLocale(current: Locale, target: string): Locale {
  if (target === 'zh' || target === 'de' || target === 'en') {
    return target;
  }
  return current;
}

function actionFor(
  locale: Locale,
  copy: AdminMessages,
  check: LaunchReadinessCheck
): { label: string; href: Route } {
  if (copy.show_admin_ops) {
    return { label: check.actionLabel, href: check.actionHref as Route };
  }
  const spec = copy.actions[actionKeyFor(check)];
  return {
    label: check.ok ? spec.label_ok : spec.label_fix,
    href: hrefFor(resolveActionLocale(locale, spec.target_locale), spec.nav_id, spec.query)
  };
}

function lookupLabel(map: { readonly [key: string]: string }, key: string, unknown: string): string {
  return map[key] ?? fill(unknown, { status: key });
}

function checkLabel(copy: AdminMessages, check: LaunchReadinessCheck): string {
  return lookupLabel(copy.check_labels, check.key, check.key);
}

function checkStatusLabel(copy: AdminMessages, status: string): string {
  return lookupLabel(copy.check_status, status, copy.check_status_unknown);
}

function readinessStatusLabel(copy: AdminMessages, status: string): string {
  return lookupLabel(copy.readiness_status, status, copy.readiness_status_unknown);
}

function safeDetail(copy: AdminMessages, check: LaunchReadinessCheck): string {
  const detail = check.detail || '';
  if (copy.detail_cjk_fallback && /[\u4e00-\u9fff]/.test(detail)) {
    return copy.detail_cjk_fallback;
  }
  if (!detail) {
    return copy.detail_empty;
  }
  if (check.key === 'market_snapshot' && copy.detail_market_count) {
    const count = detail.match(/(\d+)\s+metrics available/);
    return count
      ? fill(copy.detail_market_count, { count: count[1] })
      : copy.detail_by_key.market_snapshot || detail;
  }
  if (check.key === 'source_coverage' && copy.detail_source_completeness) {
    return detail
      .replace('completeness=', copy.detail_source_completeness)
      .replace('metrics=', copy.detail_source_metrics);
  }
  const override = (copy.detail_by_key as Record<string, string>)[check.key];
  return override || detail;
}

function readinessToneClass(check: LaunchReadinessCheck): string {
  if (check.tone === 'critical') return 'border-danger bg-danger-soft text-danger';
  if (check.tone === 'review') return 'border-warning bg-warning-soft text-warning';
  if (check.tone === 'ok' && check.status === 'ok') return 'border-success bg-success-soft text-success';
  if (check.tone === 'ok') return 'border-warning bg-warning-soft text-warning';
  return 'border-warning bg-warning-soft text-warning';
}

function launchImpactLabel(copy: AdminMessages, check: LaunchReadinessCheck): string {
  if (check.blocking) return copy.impact_blocking;
  if (check.severity === 'review') return copy.impact_review;
  if (check.severity === 'ok') return copy.impact_ok;
  return copy.impact_unknown;
}

function launchImpactClass(check: LaunchReadinessCheck): string {
  if (check.blocking) return 'border-danger bg-danger-soft text-danger';
  if (check.severity === 'ok') return 'border-success bg-success-soft text-success';
  return 'border-warning bg-warning-soft text-warning';
}

function readinessValueTone(readiness: LaunchReadinessReadModel): string {
  if (readiness.error || !readiness.ready) return 'text-danger';
  if (readiness.status === 'ready' && !readiness.degraded) return 'text-success';
  return 'text-warning';
}

function decisionHint(copy: AdminMessages, readiness: LaunchReadinessReadModel): string {
  if (readiness.error) return fill(copy.decision_hint_error, { error: readiness.error });
  return readiness.ready ? copy.decision_hint_ready : copy.decision_hint_blocked;
}

export async function AdminPage({ locale }: { locale: Locale }) {
  const copy = messagesFor(locale).admin;
  const readiness = await getLaunchReadinessReadModel();
  const asOf = readiness.error ? null : readiness.generatedAt;
  const blockingCount = readiness.checks.filter((check) => check.blocking).length;
  const reviewCount = readiness.checks.filter((check) => check.severity === 'review').length;
  const readyTone =
    readiness.error || !readiness.ready
      ? 'border-danger bg-danger-soft text-danger'
      : readiness.status === 'ready' && !readiness.degraded
        ? 'border-success bg-success-soft text-success'
        : 'border-warning bg-warning-soft text-warning';

  return (
    <PageTemplate
      locale={locale}
      eyebrow={copy.eyebrow}
      title={copy.title}
      question={copy.question}
      asOf={asOf}
    >
      <SignalRow label={copy.signals_label}>
        <MetricCard
          label={copy.decision_label}
          value={readinessStatusLabel(copy, readiness.status)}
          valueClassName={readinessValueTone(readiness)}
          hint={decisionHint(copy, readiness)}
        />
        <MetricCard
          label={copy.blocking_label}
          value={`${blockingCount}`}
          valueClassName={blockingCount > 0 ? 'text-danger' : 'text-success'}
          hint={copy.blocking_hint}
        />
        <MetricCard
          label={copy.review_label}
          value={`${reviewCount}`}
          valueClassName={reviewCount > 0 ? 'text-warning' : 'text-success'}
          hint={copy.review_hint}
        />
        <MetricCard
          label={copy.environment_label}
          value={`${readiness.environment} · ${readiness.apiPrefix}`}
          hint={fill(copy.environment_hint, { mode: readiness.schemaBootstrapMode })}
        />
      </SignalRow>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel locale={locale} title={copy.scope_title} why={copy.scope_why}>
          <ul className="space-y-3 text-sm leading-7 text-muted">
            {copy.scope_items.map((task) => (
              <li key={task}>{`${copy.scope_bullet}${task}`}</li>
            ))}
          </ul>
        </Panel>

        <Panel locale={locale} title={copy.contract_title} why={copy.contract_why}>
          <div className="space-y-3 text-sm leading-7 text-muted">
            {copy.contract_items.map((item) => (
              <p key={item.code || item.text}>
                {item.code ? (
                  <>
                    <code className="rounded-xl bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-muted">
                      {item.code}
                    </code>
                    ：{item.text}
                  </>
                ) : (
                  item.text
                )}
              </p>
            ))}
          </div>
        </Panel>
      </div>

      <Panel locale={locale} title={copy.checks_title} why={copy.checks_why}>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-xl border px-3 py-1.5 font-semibold ${readyTone}`}>
            {readiness.ready ? copy.badge_ready : copy.badge_not_ready}
          </span>
          {readiness.degraded ? (
            <span className="rounded-xl border border-warning bg-warning-soft px-3 py-1.5 font-semibold text-warning">
              {copy.badge_degraded}
            </span>
          ) : null}
          <span className="rounded-xl border border-line bg-surface-muted px-3 py-1.5 font-semibold text-muted">
            {fill(copy.env_badge, {
              environment: readiness.environment,
              apiPrefix: readiness.apiPrefix,
              schemaBootstrapMode: readiness.schemaBootstrapMode
            })}
          </span>
        </div>
        {readiness.error ? (
          <p className="mt-4 rounded-xl border border-danger bg-danger-soft p-3 text-sm leading-6 text-danger">
            {fill(copy.error_banner, { error: readiness.error })}
          </p>
        ) : (
          <div className="mt-4 divide-y divide-line border-y border-line">
            {readiness.checks.map((check) => {
              const action = actionFor(locale, copy, check);
              return (
                <div
                  key={check.key}
                  className="grid gap-3 py-3 text-sm md:grid-cols-[minmax(9rem,12rem)_minmax(11rem,13rem)_1fr_auto] md:items-start"
                >
                  <p className="font-semibold text-ink">{checkLabel(copy, check)}</p>
                  <div className="flex flex-col items-start gap-1.5">
                    <span
                      className={`inline-flex w-fit rounded-xl border px-2.5 py-1 text-xs font-semibold ${readinessToneClass(check)}`}
                    >
                      {checkStatusLabel(copy, check.status)}
                    </span>
                    <span
                      className={`inline-flex w-fit rounded-xl border px-2.5 py-1 text-xs font-semibold ${launchImpactClass(check)}`}
                    >
                      {launchImpactLabel(copy, check)}
                    </span>
                  </div>
                  <div className="space-y-2 leading-6 text-muted">
                    <p>{copy.show_admin_ops ? check.detail : safeDetail(copy, check)}</p>
                    {check.configKeys.length > 0 ? (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className="font-semibold text-muted">{copy.config_keys_label}</span>
                        {check.configKeys.map((configKey) => (
                          <code
                            key={configKey}
                            className="rounded-xl border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[0.72rem] text-muted"
                          >
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

      {copy.show_admin_ops ? (
        <Panel locale={locale} title={copy.ops_title} why={copy.ops_why}>
          <AdminDataOps />
        </Panel>
      ) : null}

      <SourceFooter
        locale={locale}
        sources={[
          {
            id: 'launch-readiness-api',
            label: readiness.error ? copy.source_unavailable : copy.source_available,
            asOf,
            basis: readiness.error ? 'assumption' : 'derived'
          },
          {
            id: 'backend-data-contract',
            label: copy.source_contract,
            basis: 'assumption'
          }
        ]}
        methodHref={hrefFor(locale, 'sources')}
        methodLabel={copy.method_label}
        limitations={copy.limitations}
      />
    </PageTemplate>
  );
}
