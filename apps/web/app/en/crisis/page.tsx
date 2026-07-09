import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
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

  return (
    <Shell
      locale="en"
      eyebrow="Crisis monitor"
      title="Fuel Stress Brief"
      description="A source-backed overview for EU reserve pressure, market confidence, SAF tipping events, and the evidence handoffs needed before operational action."
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Reserve stress"
          value={reserveWeeks == null ? 'n/a' : `${formatNumber(reserveWeeks, 1)} weeks`}
          hint={`EU reserve posture: ${reserveStressLabel(readModel.reserve?.stress_level)} | ${reserveSourceName}`}
        />
        <MetricCard
          label="Source confidence"
          value={sourceConfidence}
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
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <InfoCard title="Operating readout" subtitle="Fuel stress, reserve pressure, and source quality in one place">
          <div className="space-y-4 text-sm leading-7 text-slate-700">
            <p>
              The current fossil fuel anchor is <strong>{formatPrice(fossilPrice)}</strong>. JetScope keeps that value
              beside EU reserve coverage and source confidence so reviewers can separate live evidence from fallback
              posture before changing procurement or SAF adoption assumptions.
            </p>
            <p>
              The crisis brief comes from the FastAPI crisis-brief contract, so the page can show one coherent operating
              readout without duplicating reserve, source, tipping-event, and research aggregation in the display layer.
            </p>
          </div>
        </InfoCard>

        <InfoCard title="Evidence discipline" subtitle="Use the crisis page as a review switchboard">
          <dl className="space-y-3 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-4">
              <dt>Market freshness</dt>
              <dd className="font-semibold text-slate-950">
                {typeof sourceStatus.freshness_minutes === 'number' ? `${sourceStatus.freshness_minutes} min` : 'review'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Fallback rate</dt>
              <dd className="font-semibold text-slate-950">{formatPercent(sourceStatus.fallback_rate)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Reserve timestamp</dt>
              <dd className="font-semibold text-slate-950">{formatAsOf(readModel.reserve?.generated_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Contract status</dt>
              <dd className="font-semibold text-slate-950">{readModel.error ? 'fallback' : 'connected'}</dd>
            </div>
          </dl>
        </InfoCard>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-3">
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
            className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm shadow-slate-200/70 transition hover:border-sky-300 hover:bg-sky-50"
          >
            <p className="text-base font-semibold text-slate-950">{action.title}</p>
            <p className="mt-2 text-sm leading-7 text-slate-700">{action.description}</p>
          </Link>
        ))}
      </section>
    </Shell>
  );
}
