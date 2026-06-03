import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { AI_RESEARCH_ENABLED, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope Europe',
  description:
    'English entry point for JetScope: European jet fuel stress signals, SAF tipping-point evidence, and launch-readiness context.',
  path: '/en',
  alternateLanguages: {
    'zh-CN': '/',
    de: '/de',
    en: '/en'
  }
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function stressLabel(level?: string): string {
  if (level === 'critical') return 'critical';
  if (level === 'elevated') return 'elevated';
  if (level === 'normal') return 'normal';
  return 'review';
}

const entryCards: Array<{ title: string; description: string; href: Route }> = [
  {
    title: 'Decision cockpit',
    description: 'Live market snapshot, scenario count, source posture, and the highest-risk fuel-price movement.',
    href: '/en/dashboard' as Route
  },
  {
    title: 'Germany price monitor',
    description: 'English price surface for Brent, global jet fuel, EU jet proxy, and carbon proxy changes.',
    href: '/en/prices/germany-jet-fuel' as Route
  },
  {
    title: 'Source review',
    description: 'English row-level provenance, confidence, fallback state, and recovery actions for market inputs.',
    href: '/en/sources' as Route
  },
  {
    title: 'Research workbench',
    description: 'Pipeline status, empty-state honesty, signal counts, and evidence handoffs for AI-assisted research.',
    href: '/en/research' as Route
  },
  {
    title: 'Report workbench',
    description: 'Source status, saved scenarios, risk signal, and launch posture for report review.',
    href: '/en/reports' as Route
  },
  {
    title: 'Launch readiness',
    description: 'Read-only prerequisite checks for admin token, source coverage, AI research, and backend readiness.',
    href: '/en/admin' as Route
  },
  {
    title: 'Scenario workbench',
    description: 'Saved assumptions, current market context, risk signal, and protected write boundaries.',
    href: '/en/scenarios' as Route
  }
];

export default async function EnglishHomePage() {
  const [reserve, events, signalsResult] = await Promise.all([
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);

  const latestEvent = events[0] ?? null;

  return (
    <Shell
      locale="en"
      eyebrow="English preview"
      title="JetScope Europe"
      description="A decision-support entry point for aviation fuel transition teams reviewing SAF economics, EU fuel stress, and source quality."
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm shadow-slate-200/70">
        <p className="text-2xl font-semibold leading-tight text-slate-950 md:text-4xl">
          When does SAF become an operating decision, not only a compliance cost?
        </p>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-700 md:text-lg">
          JetScope combines market snapshots, reserve stress, policy cost pressure, and research signals into a reviewable workflow for airline and energy-transition teams.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/en/dashboard"
            className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold !text-white transition hover:bg-sky-500"
          >
            Open decision cockpit
          </Link>
          <Link
            href="/dashboard"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold !text-slate-800 transition hover:border-sky-400 hover:!text-sky-800"
          >
            Open full Chinese workspace
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <MetricCard
          label="EU reserve stress"
          value={reserve ? `${reserve.coverage_weeks.toFixed(2)} weeks` : 'Unavailable'}
          hint={reserve ? `Status: ${stressLabel(reserve.stress_level)} | Source: ${reserve.source_type}` : 'The page keeps a readable fallback while upstream coverage is unavailable.'}
        />
        <MetricCard
          label="Latest tipping event"
          value={latestEvent ? latestEvent.event_type : 'No event'}
          hint={
            latestEvent
              ? `${latestEvent.saf_pathway.toUpperCase()} gap ${latestEvent.gap_usd_per_l.toFixed(3)} USD/L | ${events.length} events loaded`
              : 'The event stream is empty for the current review window.'
          }
        />
        <MetricCard
          label="Research signals"
          value={
            signalsResult.status === 'not_found'
              ? 'API pending'
              : signalsResult.status === 'error'
                ? 'Degraded'
                : `${signalsResult.signals.length} signals`
          }
          hint={
            AI_RESEARCH_ENABLED
              ? 'AI research is enabled; signals are grouped by impact and confidence.'
              : 'AI research is disabled in this environment; the UI exposes the boundary instead of inventing live analysis.'
          }
        />
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        {entryCards.map((card) => (
          <InfoCard key={card.title} title={card.title} subtitle={card.href}>
            <p className="text-sm leading-7 text-slate-700">{card.description}</p>
            <p className="mt-4 text-sm">
              <Link className="font-semibold text-sky-700 underline" href={card.href}>
                Open surface
              </Link>
            </p>
          </InfoCard>
        ))}
      </section>
    </Shell>
  );
}
