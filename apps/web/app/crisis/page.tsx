import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { Shell } from '@/components/shell';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import {
  getDashboardReadModel,
  toDecisionReadModel,
  toTippingPointReadModel
} from '@/lib/product-read-model';
import { buildResearchDecisionBrief, getEuReserveCoverage, getResearchSignals, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Crisis Monitor',
  description:
    'Reserve coverage, tipping-point events, and SAF economic crossover in one operational crisis monitor.',
  path: '/crisis'
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const CRISIS_LINKS: Array<{ title: string; description: string; href: Route }> = [
  {
    title: 'Reserve Detail',
    description: 'Inspect the EU jet reserve stress page with source confidence and supply-gap context.',
    href: '/crisis/eu-jet-reserves' as Route
  },
  {
    title: 'SAF Tipping Point',
    description: 'Open the pathway economics surface for fuel, carbon, blend-rate, and SAF cost sensitivity.',
    href: '/crisis/saf-tipping-point' as Route
  }
];

export default async function CrisisPage() {
  const [dashboardReadModel, reserve, events, researchSignals] = await Promise.all([
    getDashboardReadModel(),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);

  const tippingPoint = toTippingPointReadModel(dashboardReadModel.tippingPoint);
  const decision = toDecisionReadModel(dashboardReadModel.airlineDecision);

  const fallbackFossil = dashboardReadModel.market.values.jet_eu_proxy_usd_per_l ?? dashboardReadModel.market.values.jet_usd_per_l ?? 0.99;
  const researchBrief = buildResearchDecisionBrief(researchSignals);

  return (
    <Shell
      eyebrow="Crisis Monitor"
      title="EU Fuel Shock Control Room"
      description="Track reserve stress, model the SAF crossover, and inspect tipping events in one workflow."
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2">
          {CRISIS_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-sky-500/60"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-sky-300">Crisis workflow</p>
              <h3 className="mt-2 text-xl font-semibold text-white">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">{item.description}</p>
            </Link>
          ))}
        </section>

        <ReservesCoverageStrip reserve={reserve} />

        <TippingEventTimeline events={events} />

        <ResearchDecisionBriefCard brief={researchBrief} compact />

        <FuelVsSafPriceChart
          fossilJetUsdPerL={tippingPoint?.inputs.fossilJetUsdPerL ?? fallbackFossil}
          effectiveFossilJetUsdPerL={tippingPoint?.effectiveFossilJetUsdPerL ?? fallbackFossil}
          pathways={tippingPoint?.pathways ?? []}
        />

        <TippingPointSimulator
          tippingPoint={tippingPoint}
          decision={decision}
          reserveWeeks={reserve?.coverage_weeks ?? dashboardReadModel.reserve?.coverage_weeks ?? 3}
        />
      </div>
    </Shell>
  );
}
