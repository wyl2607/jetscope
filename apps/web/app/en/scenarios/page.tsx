import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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
    return `Local API fallback is active: ${readModel.error ?? 'unknown cause'}.`;
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
  const risk = readModel.topRiskSignal;
  const riskValue =
    risk == null
      ? 'No anomaly'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHint =
    risk == null
      ? 'The market history window has not produced a ranked alert yet.'
      : `${riskLevelLabel(risk.level)} | samples ${risk.sampleCount} | as of ${formatAsOf(risk.latestAsOf)}`;

  return (
    <Shell
      locale="en"
      eyebrow="Scenario review"
      title="Scenario Workbench"
      description="Review saved SAF transition assumptions and decision context in English while keeping protected scenario writes in the primary workspace."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          valueClassName={risk?.level === 'alert' ? 'text-rose-700' : risk?.level === 'watch' ? 'text-amber-700' : 'text-emerald-700'}
        />
        <MetricCard
          label="Protected write boundary"
          value="Primary console"
          hint="Create, update, and delete actions require an admin token in the primary scenario workspace."
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        <InfoCard title="Scenario assumptions" subtitle="Saved workspace records">
          {readModel.recentScenarioNames.length ? (
            <ul className="space-y-3 text-sm leading-7 text-slate-700">
              {readModel.recentScenarioNames.map((name, index) => (
                <li key={`${name}-${index}`}>
                  {safeScenarioName(name, index)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-7 text-slate-700">
              No saved assumptions are available yet. Use the primary scenario editor to create reviewable cases for pricing, reserve, route, and policy discussions.
            </p>
          )}
        </InfoCard>

        <InfoCard title="Decision context" subtitle="Use scenarios with current evidence">
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>{deliveryHint(readModel)}</p>
            <p>Scenarios are evidence records for review and team discussion; they do not replace procurement approval, source validation, or protected admin configuration.</p>
            <p>Before comparing assumptions, confirm that source coverage and launch readiness are not hiding fallback or disabled-state boundaries.</p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-8">
        <InfoCard title="Review workflow" subtitle="Move from assumptions to evidence">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {actionLinks.map((action) => (
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
