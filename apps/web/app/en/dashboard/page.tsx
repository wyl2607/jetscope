import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
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
  const sourceStatus = readModel.market.source_status;

  const riskColor =
    risk == null ? 'text-warning' : risk.level === 'alert' ? 'text-danger' : risk.level === 'watch' ? 'text-warning' : 'text-success';
  const riskValue =
    risk == null
      ? 'n/a'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHint =
    risk == null
      ? 'No historical risk signal is available yet; unknown evidence is not a normal state.'
      : `Level: ${riskLevelLabel(risk.level)} | As of: ${formatAsOf(risk.latestAsOf)} | Samples: ${risk.sampleCount}`;
  const scenarioNeedsReview =
    readModel.isFallback || sourceStatus.overall !== 'ok' || risk == null || risk.level !== 'normal';
  const decisionPosture = risk?.level === 'alert' ? 'Re-run scenario' : scenarioNeedsReview ? 'Review first' : 'Continue current case';
  const decisionTone =
    risk?.level === 'alert' || sourceStatus.overall === 'offline'
      ? 'text-danger'
      : scenarioNeedsReview
        ? 'text-warning'
        : 'text-success';
  const decisionHint = readModel.isFallback
    ? 'The API fallback is not a measured input; review the source before re-running a scenario.'
    : risk?.level === 'alert'
      ? 'The history window is in alert; review the sources and re-run with current market inputs.'
      : risk == null
        ? 'The history window has not produced an identifiable signal; do not treat unknown as normal.'
        : sourceStatus.overall !== 'ok'
          ? 'Source status is not healthy; review the evidence before continuing with the scenario.'
          : risk.level === 'watch'
            ? 'Risk is in the watch range; review key assumptions before a re-run.'
            : 'Source status and the risk window do not currently require a review.';
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;
  const sourceSummary = sourcesReadModel.summary;
  const sourcePosture =
    sourceSummary.degradedCount > 0 || sourceSummary.fallbackCount > 0
      ? 'Review needed'
      : sourceSummary.proxyCount > 0
        ? 'Proxy-backed'
        : 'Healthy';
  const sourcePostureTone =
    sourceSummary.degradedCount > 0 || sourceSummary.fallbackCount > 0
      ? 'text-danger'
      : sourceSummary.proxyCount > 0
        ? 'text-warning'
        : 'text-success';

  return (
    <PageTemplate
      locale="en"
      eyebrow="Market intelligence"
      title="Decision Cockpit"
      question="Has today's market and data-delivery posture changed enough to require a scenario rerun?"
      asOf={asOf}
    >
      <SignalRow label="Decision signals">
        <MetricCard
          label="Scenario action"
          value={decisionPosture}
          hint={decisionHint}
          valueClassName={decisionTone}
        />
        <MetricCard
          label="Market snapshot"
          value={`$${formatNumber(market.brent_usd_per_bbl)}/bbl`}
          hint={`Jet global $${formatNumber(market.jet_usd_per_l, 3)}/L | EU jet proxy $${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)}/L | carbon $${formatNumber(market.carbon_proxy_usd_per_t)}/tCO2`}
        />
        <MetricCard
          label="Delivery mode"
          value={readModel.isFallback ? 'Fallback' : 'Live slice'}
          hint={deliveryHint(readModel)}
          valueClassName={readModel.isFallback ? 'text-danger' : sourceStatusTone(sourceStatus.overall)}
        />
        <MetricCard
          label="Highest risk signal"
          value={riskValue}
          hint={riskHint}
          valueClassName={riskColor}
        />
      </SignalRow>

      <Panel title="Operating access" why="These entry points connect the current market readout to the checkable admin and source-review surfaces.">
        <div className="grid gap-6 md:grid-cols-2">
          <MetricCard
            label="Admin controls"
            value="Required"
            hint="Route costs, policy parameters, source refresh, and protected writes."
            cardHref="/en/admin"
          />
          <MetricCard
            label="Source review"
            value="Open evidence"
            hint="Row-level confidence, fallback state, and recovery actions are available in English."
            cardHref="/en/sources"
          />
        </div>
      </Panel>

      <Panel title="Source posture" why="This is the evidence layer behind the market snapshot: live, proxy, fallback, and confidence remain visible together.">
        <div className="grid gap-6 text-sm md:grid-cols-4">
          <p className="rounded-xl border border-line bg-success-soft p-3 text-muted">
            <span className="block text-xs uppercase tracking-[0.18em] text-muted">Live</span>
            <span className="mt-1 block text-lg font-semibold tabular-nums text-success">{sourceSummary.liveCount}</span>
          </p>
          <p className="rounded-xl border border-line bg-warning-soft p-3 text-muted">
            <span className="block text-xs uppercase tracking-[0.18em] text-muted">Proxy</span>
            <span className="mt-1 block text-lg font-semibold tabular-nums text-warning">{sourceSummary.proxyCount}</span>
          </p>
          <p className="rounded-xl border border-line bg-danger-soft p-3 text-muted">
            <span className="block text-xs uppercase tracking-[0.18em] text-muted">Fallback</span>
            <span className="mt-1 block text-lg font-semibold tabular-nums text-danger">{sourceSummary.fallbackCount}</span>
          </p>
          <p className="rounded-xl border border-line bg-surface-muted p-3 text-muted">
            <span className="block text-xs uppercase tracking-[0.18em] text-muted">Confidence</span>
            <span className="mt-1 block text-lg font-semibold tabular-nums text-ink">{Math.round(sourceSummary.averageConfidence * 100)}%</span>
          </p>
        </div>
        <p className={`mt-4 text-sm leading-7 ${sourcePostureTone}`}>
          {sourcePosture} | completeness <span className="tabular-nums">{Math.round(sourcesReadModel.completeness * 100)}%</span>. Open Source Review for row-level recovery actions.
        </p>
      </Panel>

      <Panel title="Decision support scope" why="This capability list describes the product surface that supports the decision; it is not itself a market conclusion.">
        <ul className="space-y-3 text-sm leading-7 text-muted">
          {priorities.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      </Panel>

      <Panel title="Recent scenarios" why="Saved scenarios are local assumptions for comparison and do not replace a reviewed procurement decision.">
        {readModel.recentScenarioNames.length ? (
          <ul className="space-y-2 text-sm leading-7 text-muted">
            {readModel.recentScenarioNames.map((name) => (
              <li key={name}>• {name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-7 text-muted">
            No saved scenarios yet. Use the primary scenario workspace to create and compare operating assumptions.
          </p>
        )}
      </Panel>

      <SourceFooter
        locale="en"
        sources={[
          {
            id: 'dashboard-read-model',
            label: readModel.isFallback
              ? `Market snapshot API unavailable; internal fallback values are in use (${readModel.error ?? 'unknown cause'})`
              : 'Market snapshot API (market values, source status, and freshness)',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'source-coverage',
            label: sourcesReadModel.isFallback
              ? `Source coverage API unavailable; fallback summary is in use (${sourcesReadModel.error ?? 'unknown cause'})`
              : 'Source coverage summary (live, proxy, fallback, and confidence)',
            asOf: sourcesReadModel.isFallback ? null : sourcesReadModel.generatedAt,
            basis: sourcesReadModel.isFallback ? 'assumption' : 'derived'
          },
          {
            id: 'risk-signal',
            label: 'The risk signal is derived from movement in the market-history window, not supplied directly upstream',
            basis: 'derived'
          },
          {
            id: 'scenario-store',
            label: `Local scenario store (${readModel.scenarioCount} saved scenarios)`,
            basis: 'assumption'
          }
        ]}
        methodHref="/en/sources"
        methodLabel="Source definitions and method"
        limitations={[
          'When coverage is healthy, live metrics prefer primary or official sources.',
          'Proxy metrics and fallback values are labeled separately.',
          'Confidence, lag, and degraded reasons are available on Source Review.',
          'Fallback values keep the cockpit available but are never presented as measurements.',
          'The risk signal depends on history-window sample size; no alert does not mean no risk.',
          'Saved scenarios are local assumptions for review and discussion.'
        ]}
      />
    </PageTemplate>
  );
}
