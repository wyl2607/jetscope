import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { getDashboardReadModel, type DashboardReadModel } from '@/lib/dashboard-read-model';
import { getSourcesReadModel } from '@/lib/sources-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Decision Cockpit',
  description:
    'English JetScope dashboard for SAF versus jet-fuel decisions, including market snapshot, scenarios, source posture, and launch-readiness actions.',
  path: '/en/dashboard',
  alternateLanguages: {
    'zh-CN': '/dashboard',
    de: '/de/dashboard',
    en: '/en/dashboard'
  }
});

const priorities = [
  'Market data: Brent, global jet fuel, EU jet proxy, and carbon proxy.',
  'Scenario context: saved assumptions and recent workspace records.',
  'Source quality: confidence, fallback use, and degraded evidence stay visible.',
  'Launch posture: admin and research prerequisites are handled in the operations console.'
];

function formatNumber(value: number, digits = 2): string {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatAsOf(value: string | null): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString('en-US');
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

function riskLevelLabel(level: string): string {
  if (level === 'normal') return 'normal';
  if (level === 'watch') return 'watch';
  if (level === 'alert') return 'alert';
  return level;
}

function deliveryHint(readModel: DashboardReadModel): string {
  if (readModel.isFallback) {
    return `Local API fallback is active: ${readModel.error ?? 'unknown cause'}.`;
  }

  return `Source status: ${sourceStatusLabel(readModel.market.source_status.overall)} | freshness: ${freshnessLabel(readModel.freshnessSignal.level)} (${readModel.freshnessSignal.minutes} min.)`;
}

export default async function EnglishDashboardPage() {
  const [readModel, sourcesReadModel] = await Promise.all([
    getDashboardReadModel('en'),
    getSourcesReadModel()
  ]);
  const market = readModel.market.values;
  const risk = readModel.topRiskSignal;

  const riskValue =
    risk == null
      ? 'n/a'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHint =
    risk == null
      ? 'No historical risk signal is available yet.'
      : `Level: ${riskLevelLabel(risk.level)} | As of: ${formatAsOf(risk.latestAsOf)} | Samples: ${risk.sampleCount}`;
  const sourceSummary = sourcesReadModel.summary;
  const sourcePosture =
    sourceSummary.degradedCount > 0 || sourceSummary.fallbackCount > 0
      ? 'Review needed'
      : sourceSummary.proxyCount > 0
        ? 'Proxy-backed'
        : 'Healthy';

  return (
    <Shell
      locale="en"
      eyebrow="Market intelligence"
      title="Decision Cockpit"
      description="English operating view for SAF-vs-jet-fuel decisions, built from the same FastAPI read models as the primary workspace."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Market snapshot"
          value={`$${formatNumber(market.brent_usd_per_bbl)}/bbl`}
          hint={`Jet global $${formatNumber(market.jet_usd_per_l, 3)}/L | EU jet proxy $${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)}/L | carbon $${formatNumber(market.carbon_proxy_usd_per_t)}/tCO2`}
        />
        <MetricCard
          label="Saved scenarios"
          value={`${readModel.scenarioCount}`}
          hint={readModel.scenarioCount > 0 ? 'Saved assumptions are available for comparison.' : 'No saved scenario yet; create one in the primary scenario workspace.'}
        />
        <MetricCard label="Admin controls" value="Required" hint="Route costs, policy parameters, source refresh, and protected writes." />
        <MetricCard
          label="Delivery mode"
          value={readModel.isFallback ? 'Fallback' : 'Live slice'}
          hint={deliveryHint(readModel)}
        />
        <MetricCard
          label="Highest risk signal"
          value={riskValue}
          hint={riskHint}
          valueClassName={risk?.level === 'alert' ? 'text-rose-700' : risk?.level === 'watch' ? 'text-amber-700' : 'text-emerald-700'}
        />
        <MetricCard
          label="Source review"
          value="Open evidence"
          hint="Row-level confidence, fallback state, and recovery actions are available in English."
          cardHref="/en/sources"
        />
      </section>

      <section className="mt-8">
        <InfoCard title="Source posture" subtitle="Current market snapshot evidence">
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
              <span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Live</span>
              <span className="mt-1 block text-lg font-semibold text-emerald-700">{sourceSummary.liveCount}</span>
            </p>
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
              <span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Proxy</span>
              <span className="mt-1 block text-lg font-semibold text-sky-700">{sourceSummary.proxyCount}</span>
            </p>
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
              <span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Fallback</span>
              <span className="mt-1 block text-lg font-semibold text-amber-700">{sourceSummary.fallbackCount}</span>
            </p>
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
              <span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Confidence</span>
              <span className="mt-1 block text-lg font-semibold text-slate-950">{Math.round(sourceSummary.averageConfidence * 100)}%</span>
            </p>
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-700">
            {sourcePosture} | completeness {Math.round(sourcesReadModel.completeness * 100)}%. Open Source Review for row-level recovery actions.
          </p>
        </InfoCard>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <InfoCard title="Decision support scope" subtitle="English review surface">
          <ul className="space-y-3 text-sm leading-7 text-slate-700">
            {priorities.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="Recent scenarios" subtitle="FastAPI workspace registry">
          {readModel.recentScenarioNames.length ? (
            <ul className="space-y-2 text-sm leading-7 text-slate-700">
              {readModel.recentScenarioNames.map((name) => (
                <li key={name}>• {name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-7 text-slate-700">
              No saved scenarios yet. Use the primary scenario workspace to create and compare operating assumptions.
            </p>
          )}
        </InfoCard>
      </section>
    </Shell>
  );
}
