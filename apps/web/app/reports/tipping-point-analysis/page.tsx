import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { Shell } from '@/components/shell';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';
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
  title: 'The Tipping Point',
  description: 'A data-backed JetScope report shell for Europe jet fuel stress and SAF switching economics.',
  path: '/reports/tipping-point-analysis'
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default async function TippingPointReportPage() {
  const [dashboardReadModel, reserve, events] = await Promise.all([
    getDashboardReadModel(),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 20 })
  ]);

  const tippingPoint = toTippingPointReadModel(dashboardReadModel.tippingPoint);
  const decision = toDecisionReadModel(dashboardReadModel.airlineDecision);
  const fossilJetUsdPerL =
    tippingPoint?.inputs.fossilJetUsdPerL ??
    dashboardReadModel.market.values.jet_eu_proxy_usd_per_l ??
    dashboardReadModel.market.values.jet_usd_per_l ??
    0.99;
  const effectiveFossilJetUsdPerL = tippingPoint?.effectiveFossilJetUsdPerL ?? fossilJetUsdPerL;
  const switchProbability = Math.round(
    Math.max(
      decision?.probabilities?.buy_spot_saf ?? 0,
      decision?.probabilities?.sign_long_term_offtake ?? 0
    ) * 100
  );

  return (
    <Shell
      eyebrow="Report Shell"
      title="The Tipping Point"
      description="A portfolio report that turns the dashboard into a readable investment and operations thesis."
    >
      <article className="space-y-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-300">Executive thesis</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">
            SAF becomes rational when reserve stress, fossil jet price, and policy penalties converge.
          </h3>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-300">
            JetScope frames the European aviation fuel crisis as a decision threshold, not a static compliance story.
            The current report shell uses live dashboard contracts and clearly labels proxy or manual sources until
            IEA/EASA and AI research feeds are fully deployed.
          </p>
        </section>

        <ReservesCoverageStrip reserve={reserve} />

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Current signal</p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {tippingPoint?.signal ?? dashboardReadModel.freshnessSignal.level}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Switch probability</p>
            <p className="mt-3 text-2xl font-semibold text-emerald-300">{switchProbability}%</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-slate-400">Events loaded</p>
            <p className="mt-3 text-2xl font-semibold text-amber-300">{events.length}</p>
          </div>
        </section>

        <FuelVsSafPriceChart
          fossilJetUsdPerL={fossilJetUsdPerL}
          effectiveFossilJetUsdPerL={effectiveFossilJetUsdPerL}
          pathways={tippingPoint?.pathways ?? []}
        />

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-sky-300">Airline decision implications</p>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            The decision model is intentionally displayed as probability and threshold evidence rather than a yes/no
            recommendation. Future Phase B signals can explain why a probability moved, while Phase A reserve events
            can show when the operating environment crossed alert or critical bands.
          </p>
        </section>

        <TippingEventTimeline events={events} />

        <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/70 p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Future evidence slots</p>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Reserved for IEA/EASA source notes, Claude research signals, and event citations. This section is a
            deliberate placeholder so the report can absorb Phase A/B data without another information-architecture
            rewrite.
          </p>
        </section>
      </article>
    </Shell>
  );
}
