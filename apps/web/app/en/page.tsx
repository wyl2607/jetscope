import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope Europe',
  description: 'English entry point for JetScope: European jet fuel stress signals, SAF tipping-point evidence, and launch-readiness context.',
  path: '/en',
  alternateLanguages: { 'zh-CN': '/', de: '/de', en: '/en' }
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function latestTimestamp(values: Array<string | null | undefined>): string | null {
  const valid = values.filter(
    (value): value is string => typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
  );
  return valid.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function stressTone(level?: string): string {
  if (level === 'critical') return 'text-danger';
  if (level === 'elevated') return 'text-warning';
  if (level === 'normal') return 'text-success';
  return 'text-warning';
}

function eventTone(type?: string): string {
  if (type === 'CRITICAL') return 'text-danger';
  if (type === 'ALERT') return 'text-warning';
  if (type === 'CROSSOVER') return 'text-success';
  return 'text-warning';
}

function researchTone(status: string): string {
  if (status === 'error') return 'text-danger';
  if (status === 'not_found') return 'text-warning';
  return 'text-accent';
}

function reserveBasis(sourceType?: string): SourceRef['basis'] {
  if (sourceType === 'official') return 'observed';
  if (sourceType === 'derived') return 'derived';
  return 'assumption';
}

const entryCards: Array<{ title: string; description: string; href: Route }> = [
  { title: 'Decision cockpit', description: 'Live market snapshot, scenario count, source posture, and highest-risk fuel-price movement.', href: '/en/dashboard' as Route },
  { title: 'Germany price monitor', description: 'English price surface for Brent, global jet fuel, EU jet proxy, and carbon proxy.', href: '/en/prices/germany-jet-fuel' as Route },
  { title: 'Source review', description: 'Row-level provenance, confidence, fallback state, and recovery actions.', href: '/en/sources' as Route },
  { title: 'Research workbench', description: 'Pipeline status, empty-state honesty, signal counts, and evidence handoffs.', href: '/en/research' as Route },
  { title: 'Report workbench', description: 'Source status, saved scenarios, risk signal, and launch posture.', href: '/en/reports' as Route },
  { title: 'Launch readiness', description: 'Read-only prerequisite checks for admin token, source coverage, and backend readiness.', href: '/en/admin' as Route },
  { title: 'Scenario workbench', description: 'Saved assumptions, current market context, risk signal, and protected write boundaries.', href: '/en/scenarios' as Route },
  { title: 'Lufthansa SAF analysis', description: 'English review of the Lufthansa flight-cut signal and SAF breakeven pressure.', href: '/en/lufthansa-saf-2026' as Route }
];

export default async function EnglishHomePage() {
  const [reserve, events, signalsResult] = await Promise.all([
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);
  const latestEvent = events[0] ?? null;
  const latestResearchSignal = signalsResult.signals.reduce<typeof signalsResult.signals[number] | null>((latest, signal) => {
    if (!latest) return signal;
    return Date.parse(signal.published_at) > Date.parse(latest.published_at) ? signal : latest;
  }, null);
  const asOf = latestTimestamp([reserve?.generated_at, latestEvent?.observed_at, latestResearchSignal?.published_at]);

  return (
    <PageTemplate locale="en" eyebrow="English preview" title="JetScope Europe" question="Can this product answer my question, and which page should I open first?" asOf={asOf}>
      <SignalRow label="Entry point and current signals">
        <MetricCard label="Recommended start" value="Decision cockpit" hint="Begin with the whole picture, then move into the relevant review." cardHref="/en/dashboard" />
        <MetricCard label="EU reserve coverage" value={reserve ? `${reserve.coverage_weeks.toFixed(2)} weeks` : 'Unavailable'} valueClassName={stressTone(reserve?.stress_level)} hint="Reserve posture · /v1/reserves/eu" />
        <MetricCard label="Latest tipping event" value={latestEvent?.event_type ?? 'No event'} valueClassName={eventTone(latestEvent?.event_type)} hint={`${events.length} events in the 42-day window · /v1/analysis/tipping-point/events`} />
        <MetricCard label="Research signals" value={signalsResult.status === 'not_found' ? 'Not deployed' : signalsResult.status === 'error' ? 'Error' : `${signalsResult.signals.length} signals`} valueClassName={researchTone(signalsResult.status)} hint="/v1/research/signals · same status language as the research page" />
      </SignalRow>

      <Panel locale="en" title="Product thesis" why="Decide whether JetScope covers your problem space before choosing a detailed workflow.">
        <div className="space-y-4">
          <p className="text-2xl font-semibold leading-tight text-ink md:text-4xl">When does SAF become an operating decision, not only a compliance cost?</p>
          <p className="max-w-3xl text-base leading-7 text-muted md:text-lg">JetScope combines market snapshots, reserve stress, policy cost pressure, and research signals into a reviewable workflow.</p>
          <div className="flex flex-wrap gap-4">
            <Link href="/en/dashboard" className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-surface transition hover:bg-ink">Open decision cockpit</Link>
            <Link href="/dashboard" className="rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:border-accent hover:bg-accent-soft">Open full Chinese workspace</Link>
          </div>
        </div>
      </Panel>

      <Panel locale="en" title="Choose the next page" why="Each neutral entry card names a task; colour is reserved for actual status in the signal row.">
        <div className="grid gap-6 lg:grid-cols-3">
          {entryCards.map((card) => (
            <Link key={card.href} href={card.href} className="rounded-xl border border-line bg-surface p-5 transition hover:border-accent hover:bg-accent-soft">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">{card.href}</p>
              <h3 className="mt-2 text-lg font-medium text-ink">{card.title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted">{card.description}</p>
              <p className="mt-4 text-sm font-medium text-accent">Open surface</p>
            </Link>
          ))}
        </div>
      </Panel>

      <SourceFooter
        locale="en"
        sources={[
          { id: 'reserve-signal', label: `EU reserve coverage via ${reserve?.source_name ?? 'unavailable source'}`, href: '/en/sources', asOf: reserve?.generated_at ?? null, basis: reserveBasis(reserve?.source_type) },
          { id: 'tipping-events', label: `SAF tipping-point event stream (${events.length})`, href: '/en/reports/tipping-point-analysis', asOf: latestEvent?.observed_at ?? null, basis: 'observed' },
          { id: 'research-signals', label: `Derived research signals (${signalsResult.signals.length})`, href: '/en/research', asOf: latestResearchSignal?.published_at ?? null, basis: 'derived' }
        ]}
        methodHref="/en/sources"
        methodLabel="Source and method registry"
        limitations={[
          'The home page is a summary and navigation surface; full definitions remain on each detail page.',
          'An empty event window does not mean there is no risk.',
          'Research signals are derived evidence, not direct market observations.'
        ]}
      />
    </PageTemplate>
  );
}
