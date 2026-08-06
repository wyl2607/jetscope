import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { getCrisisBriefReadModel, type CrisisBriefReadModel } from '@/lib/crisis-brief-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Fuel Stress Brief',
  description:
    'English JetScope crisis monitor for EU jet-fuel reserve stress, source confidence, tipping events, and research posture.',
  path: '/en/crisis',
  alternateLanguages: {
    'zh-CN': '/crisis',
    de: '/de/crisis',
    en: '/en/crisis'
  }
});

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return Number(value).toLocaleString('en-DE', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

function formatPrice(value: number | null | undefined): string {
  return `${formatNumber(value, 3)} USD/L`;
}

function formatPercent(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? NaN)) return 'n/a';
  return `${Number(value).toFixed(0)}%`;
}

function formatAsOf(value?: string | null): string {
  if (!value) return 'not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-DE', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function sourceStatusLabel(status: string): string {
  if (status === 'ok') return 'healthy';
  if (status === 'degraded') return 'degraded';
  if (status === 'offline') return 'offline';
  if (status === 'unknown') return 'unknown';
  return status;
}

function reserveStressLabel(level: string | undefined): string {
  if (level === 'critical') return 'critical';
  if (level === 'elevated') return 'elevated';
  if (level === 'normal') return 'normal';
  return 'review';
}

// Section 1 rule 5: the tint states a fact. An unknown reserve level is not a
// normal reserve level, and rendering both in neutral ink would hide the gap
// instead of reporting it.
function reserveStressTone(level: string | undefined): string {
  if (level === 'critical') return 'text-danger';
  if (level === 'normal') return 'text-success';
  return 'text-warning';
}

function sourceStatusTone(status: string): string {
  if (status === 'ok') return 'text-success';
  if (status === 'offline') return 'text-danger';
  return 'text-warning';
}

// Section 3: observed, derived and assumed are different things, and a manual
// estimate must not read like an official filing.
function reserveBasis(sourceType: string | undefined): SourceRef['basis'] {
  if (sourceType === 'official') return 'observed';
  if (sourceType === 'derived') return 'derived';
  return 'assumption';
}

function researchPosture(status: string, count: number): string {
  if (status === 'disabled') return 'disabled boundary';
  if (status === 'empty') return 'waiting for signals';
  return count > 0 ? 'signal-backed' : 'waiting for signals';
}

function actionHref(readModel: CrisisBriefReadModel, id: string, fallback: Route): Route {
  return (readModel.actions.find((action) => action.id === id)?.href ?? fallback) as Route;
}

export default async function EnglishCrisisPage() {
  const readModel = await getCrisisBriefReadModel('en');

  const sourceStatus = readModel.sourceStatus;
  const latestEvent = readModel.tippingEvents[0] ?? null;
  const reserveWeeks = readModel.reserve?.coverage_weeks ?? null;
  const reserveConfidence = readModel.reserve?.confidence_score ?? null;
  const reserveSourceName = readModel.reserve?.source_name ?? 'fallback scenario baseline';
  const fossilPrice = readModel.fossilJetUsdPerL;
  const sourceConfidence = formatPercent((sourceStatus.confidence ?? 0) * 100);
  const researchStatus = researchPosture(readModel.research.status, readModel.research.signal_count);
  const reviewSourcesRoute = actionHref(readModel, 'review_sources', '/en/sources?filter=review' as Route);
  const reportRoute = actionHref(readModel, 'open_report', '/en/reports/tipping-point-analysis' as Route);
  const scenariosRoute = actionHref(readModel, 'review_scenarios', '/en/scenarios' as Route);

  // On fallback the read model stamps itself with the current time, so
  // rendering that as a data timestamp would present invented values as fresh.
  const asOf = readModel.error ? null : (readModel.reserve?.generated_at ?? readModel.marketGeneratedAt);

  return (
    <PageTemplate
      locale="en"
      eyebrow="Crisis monitor"
      title="Fuel Stress Brief"
      question="Is reserve stress high enough to change an operating decision right now?"
      asOf={asOf}
    >
      <SignalRow label="Crisis signals">
        {/* Section 2 rule 2: the reserve level is the answer; everything else
            in this row says how much you may trust it. */}
        <MetricCard
          label="Reserve stress"
          value={reserveWeeks == null ? 'n/a' : `${formatNumber(reserveWeeks, 1)} weeks`}
          valueClassName={reserveStressTone(readModel.reserve?.stress_level)}
          hint={`EU reserve posture: ${reserveStressLabel(readModel.reserve?.stress_level)} | ${reserveSourceName}`}
        />
        <MetricCard
          label="Source confidence"
          value={sourceConfidence}
          valueClassName={sourceStatusTone(sourceStatus.overall)}
          hint={`Market status ${sourceStatusLabel(sourceStatus.overall)} | reserve confidence ${formatPercent((reserveConfidence ?? 0) * 100)}`}
          cardHref={reviewSourcesRoute}
        />
        <MetricCard
          label="Tipping events"
          value={`${readModel.tippingEvents.length}`}
          hint={latestEvent ? `${latestEvent.event_type.toLowerCase()} | ${latestEvent.saf_pathway.toUpperCase()} | ${formatAsOf(latestEvent.observed_at)}` : 'No events in the current review window.'}
        />
        <MetricCard
          label="Research posture"
          value={researchStatus}
          hint={readModel.research.signal_count ? `${readModel.research.signal_count} research signals available for review.` : 'The page exposes the research boundary instead of inventing evidence.'}
        />
      </SignalRow>

      <Panel
        locale="en"
        title="Operating readout"
        why="What the numbers above mean together, and how to tell whether they came from live evidence or from a fallback posture."
      >
        <div className="space-y-4 text-sm leading-7 text-muted">
          <p>
            The current fossil fuel anchor is <strong className="text-ink">{formatPrice(fossilPrice)}</strong>. JetScope
            keeps that value beside EU reserve coverage and source confidence so reviewers can separate live evidence
            from fallback posture before changing procurement or SAF adoption assumptions.
          </p>
          <p>
            The crisis brief comes from the FastAPI crisis-brief contract, so the page can show one coherent operating
            readout without duplicating reserve, source, tipping-event, and research aggregation in the display layer.
          </p>
        </div>
      </Panel>

      <Panel
        locale="en"
        title="Evidence discipline"
        why="The four readings that decide whether this brief can be used as decision evidence or has to go through source review first."
      >
        <dl className="space-y-3 text-sm text-muted">
          <div className="flex items-center justify-between gap-4">
            <dt>Market freshness</dt>
            <dd className="font-medium tabular-nums text-ink">
              {typeof sourceStatus.freshness_minutes === 'number' ? `${sourceStatus.freshness_minutes} min` : 'review'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Fallback rate</dt>
            <dd className="font-medium tabular-nums text-ink">{formatPercent(sourceStatus.fallback_rate)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Reserve timestamp</dt>
            <dd className="font-medium tabular-nums text-ink">{formatAsOf(readModel.reserve?.generated_at)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt>Contract status</dt>
            <dd className={`font-medium ${readModel.error ? 'text-warning' : 'text-success'}`}>
              {readModel.error ? 'fallback' : 'connected'}
            </dd>
          </div>
        </dl>
      </Panel>

      <Panel
        locale="en"
        title="Next steps"
        why="A crisis brief that only shows numbers changes nothing. Every entry point here leads to something checkable."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {[
          {
            title: 'Review source evidence',
            description: 'Check fallback, proxy, degraded, and volatile rows before treating the crisis signal as operational evidence.',
            href: reviewSourcesRoute
          },
          {
            title: 'Open localized report',
            description: 'Move from the brief into the source-backed tipping-point report for a longer review narrative.',
            href: reportRoute
          },
          {
            title: 'Review scenarios',
            description: 'Compare saved assumptions against the current reserve stress and market confidence before changing the plan.',
            href: scenariosRoute
          }
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
            >
              <p className="font-medium text-ink">{action.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{action.description}</p>
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        locale="en"
        sources={[
          {
            id: 'crisis-brief-api',
            label: readModel.error
              ? `Crisis brief API unreachable; internal fallback values are in use (${readModel.error})`
              : 'Crisis brief API (reserve, source status, tipping events, research posture)',
            asOf,
            basis: readModel.error ? 'assumption' : 'observed'
          },
          {
            id: 'reserve-source',
            label: `EU reserve posture via ${reserveSourceName}`,
            asOf: readModel.reserve?.generated_at ?? null,
            basis: reserveBasis(readModel.reserve?.source_type)
          },
          {
            id: 'tipping-events',
            label: `${readModel.tippingEvents.length} observed SAF tipping events in the review window`,
            basis: 'observed'
          },
          {
            id: 'fossil-anchor',
            label: `Fossil cost anchor ${formatPrice(fossilPrice)}, derived from the market snapshot`,
            basis: 'derived'
          }
        ]}
        methodHref="/en/sources"
        methodLabel="Source and method list"
        limitations={[
          'This brief describes reserve pressure across the region, not one operator’s supply position. An airline’s own contracts and stock are not in here.',
          'Tipping events are counted inside the review window. No events does not mean no risk; it means no crossing was observed in this window.',
          'When the reserve source is a manual estimate it is tagged “scenario assumption” above, and must not be read as an official filing.'
        ]}
      />
    </PageTemplate>
  );
}
