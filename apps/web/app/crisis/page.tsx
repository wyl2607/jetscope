import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { Shell } from '@/components/shell';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import {
  getDashboardReadModel,
  toDecisionReadModel,
  toTippingPointReadModel
} from '@/lib/product-read-model';
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata } from 'next';

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

export default async function CrisisPage() {
  const [dashboardReadModel, reserve, events] = await Promise.all([
    getDashboardReadModel(),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 })
  ]);

  const tippingPoint = toTippingPointReadModel(dashboardReadModel.tippingPoint);
  const decision = toDecisionReadModel(dashboardReadModel.airlineDecision);

  const fallbackFossil = dashboardReadModel.market.values.jet_eu_proxy_usd_per_l ?? dashboardReadModel.market.values.jet_usd_per_l ?? 0.99;

  return (
    <Shell
      eyebrow="Crisis Monitor"
      title="EU Fuel Shock Control Room"
      description="Track reserve stress, model the SAF crossover, and inspect tipping events in one workflow."
    >
      <div className="space-y-6">
        <ReservesCoverageStrip reserve={reserve} />

        <TippingEventTimeline events={events} />

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
