import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getDashboardReadModel, type DashboardReadModel } from '@/lib/dashboard-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Scenario Workbench',
  description:
    'English JetScope scenario review surface for saved assumptions, market context, risk signals, and protected write boundaries.',
  path: '/en/scenarios',
  alternateLanguages: {
    'zh-CN': '/scenarios',
    en: '/en/scenarios'
  }
});

const actionLinks: Array<{ label: string; href: Route; description: string }> = [
  {
    label: 'Open primary scenario editor',
    href: '/scenarios' as Route,
    description: 'Create, update, or delete scenarios in the primary workspace where admin-token writes are already guarded.'
  },
  {
    label: 'Review source evidence',
    href: '/en/sources?filter=review' as Route,
    description: 'Check fallback, proxy, degraded, and volatility rows before using saved assumptions in decisions.'
  },
  {
    label: 'Open decision cockpit',
    href: '/en/dashboard' as Route,
    description: 'Return to the live market snapshot, source posture, and top risk signal.'
  },
  {
    label: 'Check launch readiness',
    href: '/en/admin' as Route,
    description: 'Confirm whether protected writes, source coverage, and research prerequisites are ready.'
  }
];

function formatNumber(value: number, digits = 2): string {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function riskLevelLabel(level: string): string {
  if (level === 'normal') return 'normal';
  if (level === 'watch') return 'watch';
  if (level === 'alert') return 'alert';
  return level;
}

function formatAsOf(value: string | null): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString('en-US');
}

function deliveryHint(readModel: DashboardReadModel): string {
  if (readModel.isFallback) {
    return `Local API fallback is active: ${readModel.error ?? 'unknown cause'}. Review assumptions against source evidence before use.`;
  }

  return `Source status: ${readModel.market.source_status.overall} | freshness ${readModel.freshnessSignal.minutes} min.`;
}

function safeScenarioName(name: string, index: number): string {
  if (/[\u4e00-\u9fff]/.test(name)) return `Saved scenario ${index + 1}`;
  return name;
}

export default async function EnglishScenariosPage() {
  const readModel = await getDashboardReadModel('en');
  const market = readModel.market.values;
  const sourceStatus = readModel.market.source_status;
  const risk = readModel.topRiskSignal;
  const needsReview =
    readModel.isFallback ||
    sourceStatus.overall !== 'ok' ||
    risk == null ||
    risk.level !== 'normal' ||
    readModel.scenarioCount === 0;
  const assumptionPosture = readModel.isFallback
    ? 'Not reliable'
    : sourceStatus.overall === 'offline' || risk?.level === 'alert'
      ? 'Reassess'
      : needsReview
        ? 'Review first'
        : 'Usable';
  const assumptionTone = readModel.isFallback || sourceStatus.overall === 'offline' || risk?.level === 'alert'
    ? 'text-danger'
    : needsReview
      ? 'text-warning'
      : 'text-success';
  const riskValue =
    risk == null
      ? 'No anomaly'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHint =
    risk == null
      ? 'The market history window has not produced a ranked alert yet.'
      : `${riskLevelLabel(risk.level)} | samples ${risk.sampleCount} | as of ${formatAsOf(risk.latestAsOf)}`;
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  return (
    <PageTemplate
      locale="en"
      eyebrow="Scenario review"
      title="Scenario Workbench"
      question="Do the saved assumptions still represent the current market?"
      asOf={asOf}
    >
      <SignalRow label="Scenario decision signals">
        <MetricCard
          label="Assumption posture"
          value={assumptionPosture}
          valueClassName={assumptionTone}
          hint={
            readModel.isFallback
              ? 'The market read-model fallback does not make saved assumptions reliable by itself.'
              : needsReview
                ? 'Source posture, risk, or missing scenarios require review before carrying assumptions forward.'
                : 'Current source posture and risk window show no immediate review trigger.'
          }
        />
        <MetricCard
          label="Saved scenarios"
          value={`${readModel.scenarioCount}`}
          hint={readModel.scenarioCount > 0 ? 'Workspace assumptions are available for comparison.' : 'No saved scenario yet; create one in the primary scenario editor.'}
        />
        <MetricCard
          label="Market context"
          value={`$${formatNumber(market.brent_usd_per_bbl)}/bbl`}
          hint={`Jet $${formatNumber(market.jet_usd_per_l, 3)}/L | EU jet proxy $${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)}/L | carbon $${formatNumber(market.carbon_proxy_usd_per_t)}/tCO2`}
        />
        <MetricCard
          label="Highest risk signal"
          value={riskValue}
          hint={riskHint}
          valueClassName={risk?.level === 'alert' ? 'text-danger' : risk?.level === 'watch' ? 'text-warning' : risk == null ? 'text-warning' : 'text-success'}
        />
      </SignalRow>

      <Panel locale="en" title="Scenario assumptions" why="Saved workspace records show which assumptions are available for comparison and review.">
        {readModel.recentScenarioNames.length ? (
          <ul className="space-y-3 text-sm leading-7 text-muted">
            {readModel.recentScenarioNames.map((name, index) => (
              <li key={`${name}-${index}`}>{safeScenarioName(name, index)}</li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-warning bg-warning-soft p-4 text-sm leading-7 text-warning">
            No saved assumptions are available yet. Use the primary scenario editor to create reviewable cases for pricing, reserve, route, and policy discussions.
          </p>
        )}
      </Panel>

      <Panel locale="en" title="Decision context" why="Scenarios become decision-relevant only alongside current evidence; fallback and missing-signal boundaries stay visible.">
        <div className="space-y-3 text-sm leading-7 text-muted">
          <p>{deliveryHint(readModel)}</p>
          <p>Scenarios are evidence records for review and team discussion; they do not replace procurement approval, source validation, or protected admin configuration.</p>
          <p>Before comparing assumptions, confirm that source coverage and launch readiness are not hiding fallback or disabled-state boundaries.</p>
        </div>
      </Panel>

      <Panel locale="en" title="Review workflow" why="The next steps move from saved assumptions back to evidence, launch readiness, and protected write boundaries.">
        <p className="mb-4 text-sm leading-7 text-muted"><span className="font-medium text-ink">Protected write boundary:</span> create, update, and delete actions remain in the primary scenario workspace.</p>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {actionLinks.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-semibold text-ink">{action.label}</p>
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
              ? 'Market snapshot API unavailable; internal fallback values are being used'
              : 'Market snapshot API (source posture, confidence, fallback rate, and freshness)',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'scenario-store',
            label: `Local scenario store (${readModel.scenarioCount} saved scenarios)`,
            basis: 'assumption'
          },
          {
            id: 'risk-signal',
            label: 'Risk signal derived from movement in the market history window, not supplied directly by upstream',
            basis: 'derived'
          }
        ]}
        methodHref="/en/sources"
        methodLabel="Sources and methods"
        limitations={[
          'Saved scenarios are local assumptions for review and discussion; they do not replace procurement approval.',
          'A fallback read model keeps the page available but does not provide a valid data-as-of for its replacement values.',
          'No risk signal with a thin sample does not mean there is no risk.',
          'Protected writes remain in the primary scenario workspace.'
        ]}
      />
    </PageTemplate>
  );
}
