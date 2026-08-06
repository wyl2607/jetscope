import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { getDashboardReadModel } from '@/lib/dashboard-read-model';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { AI_RESEARCH_ENABLED, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Tipping-Point Report',
  description: 'English JetScope report detail for SAF tipping-point evidence, market source confidence, reserve stress, and research posture.',
  path: '/en/reports/tipping-point-analysis',
  alternateLanguages: { 'zh-CN': '/reports/tipping-point-analysis', de: '/de/reports/tipping-point-analysis', en: '/en/reports/tipping-point-analysis' }
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function formatPrice(value: number | null | undefined): string {
  return `${formatNumber(value, 3)} USD/L`;
}

function formatPercent(value: number | null | undefined): string {
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

function researchPosture(status: string, count: number): string {
  if (!AI_RESEARCH_ENABLED) return 'disabled boundary';
  if (status === 'error') return 'degraded';
  if (status === 'not_found') return 'not deployed';
  return count > 0 ? 'signal-backed' : 'waiting for signals';
}

function signalTone(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'text-success';
  if (signal === 'switch_window_opening') return 'text-warning';
  if (signal === 'fossil_still_advantaged') return 'text-danger';
  return 'text-warning';
}

function probabilityTone(probability: number): string {
  if (probability >= 67) return 'text-success';
  if (probability >= 34) return 'text-warning';
  return 'text-danger';
}

export default async function EnglishTippingPointReportPage() {
  const [readModel, reserve, events, research] = await Promise.all([
    getDashboardReadModel('en'),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 20 }),
    getResearchSignals()
  ]);
  const sourceStatus = readModel.market.source_status;
  const tippingPoint = readModel.tippingPoint;
  const decision = readModel.airlineDecision;
  const latestEvent = events[0] ?? null;
  const fossilJetSource = tippingPoint?.effective_fossil_jet_usd_per_l != null
    ? 'model'
    : readModel.market.values.jet_eu_proxy_usd_per_l != null
      ? 'proxy'
      : readModel.market.values.jet_usd_per_l != null
        ? 'spot'
        : 'assumed';
  const fossilPrice = tippingPoint?.effective_fossil_jet_usd_per_l ?? readModel.market.values.jet_eu_proxy_usd_per_l ?? readModel.market.values.jet_usd_per_l;
  const switchProbability = Math.round(Math.max(decision?.probabilities.buy_spot_saf ?? 0, decision?.probabilities.sign_long_term_offtake ?? 0) * 100);
  const sourceConfidence = formatPercent((sourceStatus.confidence ?? 0) * 100);
  const researchStatus = researchPosture(research.status, research.signals.length);
  const asOf = readModel.isFallback ? null : readModel.market.generated_at;

  return (
    <PageTemplate
      locale="en"
      eyebrow="Report detail"
      title="Tipping-Point Report"
      question="Does this report's economic case still hold?"
      asOf={asOf}
    >
      <SignalRow label="Tipping-point conclusion">
        <MetricCard
          label="Tipping-point signal"
          value={tippingPoint?.signal ?? 'review'}
          valueClassName={signalTone(tippingPoint?.signal)}
          hint="Conclusion first; an unknown signal remains review-required."
        />
        <MetricCard
          label="Decision probability"
          value={`${switchProbability}%`}
          valueClassName={probabilityTone(switchProbability)}
          hint="Maximum probability across spot SAF purchase and long-term offtake."
        />
        <MetricCard label="Source confidence" value={sourceConfidence} hint={`Market status: ${sourceStatusLabel(sourceStatus.overall)}`} />
        <MetricCard
          label="Events loaded"
          value={`${events.length}`}
          valueClassName="text-ink"
          hint={latestEvent ? `Latest: ${latestEvent.event_type.toLowerCase()}` : 'No events in the current review window.'}
        />
      </SignalRow>

      <Panel locale="en" title="Core argument" why="The evidence chain shows whether the model can support a decision or must go through source review first.">
        <div className="space-y-4 text-sm leading-7 text-muted">
          <p>JetScope treats the tipping point as a convergence of fossil fuel cost, carbon exposure, reserve stress, and SAF pathway spread. The current fossil cost anchor is <strong className="tabular-nums text-ink">{formatPrice(fossilPrice)}</strong>.</p>
          <p>The source posture is <strong className="text-ink">{sourceStatusLabel(sourceStatus.overall)}</strong> with <strong className="tabular-nums text-ink">{sourceConfidence}</strong> confidence. If fallback rows are active, the report remains readable but must be reviewed before publication.</p>
        </div>
      </Panel>

      <Panel
        locale="en"
        title="Source confidence"
        why="These four checks explain how much weight the conclusion can carry and which evidence is still missing."
      >
        <dl className="space-y-3 text-sm text-muted">
          <div className="flex items-center justify-between gap-4">
            <dt>Market status</dt>
            <dd className="font-medium text-ink">{sourceStatusLabel(sourceStatus.overall)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Fallback rate</dt>
            <dd className="font-medium tabular-nums text-ink">{formatPercent(sourceStatus.fallback_rate)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Latest event</dt>
            <dd className="font-medium text-ink">{latestEvent ? latestEvent.event_type.toLowerCase() : 'none'}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Research posture</dt>
            <dd className="font-medium text-ink">{researchStatus}</dd>
          </div>
        </dl>
      </Panel>

      <Panel locale="en" title="Next review steps" why="The report becomes actionable only when its sources, scenario assumptions, and publication path remain reachable.">
        <div className="grid gap-6 lg:grid-cols-3">
          {[
            {
              title: 'Review market sources',
              description: 'Check live, proxy, fallback, and degraded inputs before external use.',
              href: '/en/sources?filter=review' as Route
            },
            {
              title: 'Compare scenario assumptions',
              description: 'Confirm saved assumptions before changing procurement posture.',
              href: '/en/scenarios' as Route
            },
            {
              title: 'Return to report workbench',
              description: 'Review launch posture and report catalog status.',
              href: '/en/reports' as Route
            }
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-medium text-ink">{action.title}</p>
              <p className="mt-2 text-sm leading-7 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        locale="en"
        sources={[
          {
            id: 'dashboard-read-model',
            label: 'Dashboard read model and market status',
            asOf,
            basis: readModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'reserve-signal',
            label: `EU reserve coverage via ${reserve?.source_name ?? 'unavailable source'}`,
            asOf: reserve?.generated_at ?? null,
            basis: reserve?.source_type === 'official' ? 'observed' : reserve?.source_type === 'derived' ? 'derived' : 'assumption'
          },
          {
            id: 'report-fossil-anchor',
            label: fossilJetSource === 'assumed' ? 'No fossil cost anchor available' : 'Fossil jet-fuel cost anchor',
            asOf,
            basis: readModel.isFallback ? 'assumption' : fossilJetSource === 'spot' ? 'observed' : fossilJetSource === 'assumed' ? 'assumption' : 'derived'
          },
          {
            id: 'tipping-events',
            label: `SAF tipping-point events (${events.length})`,
            asOf: latestEvent?.observed_at ?? null,
            basis: 'observed'
          },
          {
            id: 'research-signals',
            label: `Derived research signals (${research.signals.length})`,
            asOf: research.signals[0]?.published_at ?? null,
            basis: 'derived'
          }
        ]}
        methodHref="/en/sources"
        methodLabel="Source and method registry"
        limitations={[
          'The report describes market-wide thresholds, not one airline’s contracts, inventory, or approvals.',
          'Decision probabilities are model outputs, not observed future behaviour.',
          'No events in a thin review window does not mean there is no risk.'
        ]}
      />
    </PageTemplate>
  );
}
