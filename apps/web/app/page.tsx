import { Shell } from '@/components/shell';
import {
  AI_RESEARCH_ENABLED,
  getEuReserveCoverage,
  getResearchSignals,
  getTippingPointEvents
} from '@/lib/portfolio-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'JetScope Portfolio Landing',
  description:
    'A five-minute portfolio overview of Europe jet fuel stress signals, SAF tipping-point events, and AI-assisted research workflows.',
  path: '/'
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function stressTone(stressLevel?: string): string {
  if (stressLevel === 'critical') return 'text-rose-300';
  if (stressLevel === 'elevated') return 'text-amber-300';
  if (stressLevel === 'normal') return 'text-emerald-300';
  return 'text-yellow-300';
}

function eventTone(eventType?: string): string {
  if (eventType === 'CRITICAL') return 'text-rose-300';
  if (eventType === 'ALERT') return 'text-amber-300';
  if (eventType === 'CROSSOVER') return 'text-emerald-300';
  return 'text-slate-300';
}

const CTA_CARDS = [
  {
    title: 'Crisis Monitor',
    description: 'Live reserve coverage, stress color bands, and tipping-event timeline for operators.',
    href: '/crisis' as Route,
    tone: 'border-rose-600/40 bg-rose-500/10'
  },
  {
    title: 'Research Lab',
    description: 'AI signal stream with bilingual summaries and confidence filtering.',
    href: '/research' as Route,
    tone: 'border-sky-600/40 bg-sky-500/10'
  },
  {
    title: 'Pathways',
    description: 'Pathway comparison and simulator showing when SAF becomes rational.',
    href: '/crisis/saf-tipping-point' as Route,
    tone: 'border-emerald-600/40 bg-emerald-500/10'
  },
  {
    title: 'Report',
    description: 'A structured thesis shell for recruiters and reviewers.',
    href: '/reports/tipping-point-analysis' as Route,
    tone: 'border-indigo-600/40 bg-indigo-500/10'
  }
];

export default async function HomePage() {
  const [reserve, events, signalsResult] = await Promise.all([
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);

  const latestEvent = events[0] ?? null;
  const signalCount = signalsResult.signals.length;

  return (
    <Shell
      eyebrow="Phase C Portfolio"
      title="JetScope"
      description="Portfolio-focused entry point for hiring teams to understand product value in five minutes."
    >
      <section className="rounded-2xl border border-slate-700 bg-slate-950/80 p-8">
        <p className="text-2xl font-semibold leading-tight text-white md:text-4xl">
          Europeans have had 3 weeks of jet fuel for the last 6 weeks. At what price does SAF become the rational choice?
        </p>
        <p className="mt-4 text-base leading-7 text-slate-300 md:text-lg">
          欧洲航油库存连续六周维持在三周覆盖线附近，JetScope 用实时市场数据与策略模型回答同一个问题：
          何时 SAF 不再只是合规成本，而是经营理性选择。
        </p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Core Figure 1 · Reserves</p>
          <h3 className="mt-2 text-lg font-semibold text-white">/v1/reserves/eu</h3>
          <p className={`mt-4 text-3xl font-semibold ${stressTone(reserve?.stress_level)}`}>
            {reserve ? `${reserve.coverage_weeks.toFixed(2)} weeks` : 'Unavailable'}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {reserve ? `Stress level: ${reserve.stress_level} · source: ${reserve.source_type}` : 'Graceful fallback keeps card visible when upstream is degraded.'}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Core Figure 2 · Tipping Events</p>
          <h3 className="mt-2 text-lg font-semibold text-white">/v1/analysis/tipping-point/events</h3>
          <p className={`mt-4 text-3xl font-semibold ${eventTone(latestEvent?.event_type)}`}>
            {latestEvent ? latestEvent.event_type : 'No Event'}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {latestEvent
              ? `${latestEvent.saf_pathway.toUpperCase()} gap ${latestEvent.gap_usd_per_l.toFixed(3)} USD/L · ${events.length} events loaded`
              : 'Timeline placeholder remains valid before event stream bootstraps.'}
          </p>
        </article>

        <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Core Figure 3 · Research Signals</p>
          <h3 className="mt-2 text-lg font-semibold text-white">/v1/research/signals</h3>
          <p className="mt-4 text-3xl font-semibold text-sky-300">
            {signalsResult.status === 'not_found' ? '404 fallback' : `${signalCount} signals`}
          </p>
          <p className="mt-2 text-sm text-slate-300">
            {signalsResult.status === 'not_found'
              ? 'Phase B API not merged: show deployment banner instead of crashing the page.'
              : AI_RESEARCH_ENABLED
                ? 'Signals grouped by type with bilingual summaries and confidence threshold.'
                : 'AI_RESEARCH_ENABLED=false: research page renders empty-state by design.'}
          </p>
        </article>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {CTA_CARDS.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className={`rounded-2xl border p-5 transition hover:border-slate-500 ${card.tone}`}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Explore</p>
            <h3 className="mt-2 text-xl font-semibold text-white">{card.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-200">{card.description}</p>
          </Link>
        ))}
      </section>
    </Shell>
  );
}
