import { Shell } from '@/components/shell';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import { AirlineDecisionMatrix } from '@/components/airline-decision-matrix';
import { SafPathwayComparisonTable } from '@/components/saf-pathway-comparison-table';
import { ScenarioCostStackChart } from '@/components/scenario-cost-stack-chart';
import { getDashboardReadModel, toDecisionReadModel, toTippingPointReadModel } from '@/lib/product-read-model';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'SAF Tipping Point Analysis',
  description:
    'Interactive analysis of when fossil jet fuel prices make Sustainable Aviation Fuel (SAF) economically competitive for European airlines.',
  path: '/crisis/saf-tipping-point'
});

export default async function SafTippingPointPage() {
  const readModel = await getDashboardReadModel();
  const tippingPoint = toTippingPointReadModel(readModel.tippingPoint);
  const airlineDecision = toDecisionReadModel(readModel.airlineDecision);
  const pathways = tippingPoint?.pathways ?? [];
  const selectedPathwayKey = tippingPoint?.pathways?.[0]?.pathway_key ?? 'hefa';

  return (
    <Shell
      eyebrow="Crisis Analysis"
      title="SAF Tipping Point"
      description="Find the exact price levels where Sustainable Aviation Fuel (SAF) becomes the rational choice for European aviation operators."
    >
      {/* Top navigation */}
      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/crisis/eu-jet-reserves"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-500 hover:text-white"
        >
          ← Reserve Monitor
        </Link>
        <Link
          href="/de/lufthansa-saf-2026"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:border-slate-500 hover:text-white"
        >
          Lufthansa Analysis →
        </Link>
      </div>

      {/* Introduction */}
      <section className="mb-8 rounded-2xl border border-slate-800 bg-slate-950 p-8">
        <h2 className="text-xl font-bold text-white">The core question</h2>
        <p className="mt-3 text-slate-300 leading-relaxed">
          At what fuel price, carbon price, and supply constraint does SAF move from
          a <strong className="text-slate-200">compliance burden</strong> to a
          <strong className="text-emerald-300">rational procurement choice</strong>?
        </p>
        <p className="mt-4 text-sm text-slate-400">
          This page provides interactive tools to explore the aviation fuel transition economics.
          All calculations use live market data and the latest SAF pathway cost research.
        </p>
      </section>

      {/* Fuel vs SAF Price Chart */}
      <section className="mb-8">
        <FuelVsSafPriceChart
          fossilJetUsdPerL={tippingPoint?.inputs.fossilJetUsdPerL ?? readModel.market.values?.jet_eu_proxy_usd_per_l ?? 0.99}
          effectiveFossilJetUsdPerL={tippingPoint?.effectiveFossilJetUsdPerL ?? readModel.market.values?.jet_eu_proxy_usd_per_l ?? 0.99}
          pathways={pathways}
        />
      </section>

      {/* Tipping Point Simulator */}
      <section className="mb-8">
        <TippingPointSimulator
          tippingPoint={tippingPoint}
          decision={airlineDecision}
          reserveWeeks={readModel.reserve?.coverage_weeks ?? 3.0}
        />
      </section>

      {/* Airline Decision Matrix */}
      <section className="mb-8">
        <AirlineDecisionMatrix
          decision={airlineDecision}
          reserveWeeks={readModel.reserve?.coverage_weeks ?? 3.0}
          pathwayKey={selectedPathwayKey}
        />
      </section>

        {/* SAF Pathway Comparison Table */}
      <section className="mb-8">
        <SafPathwayComparisonTable
          pathways={pathways}
          selectedPathwayKey={selectedPathwayKey}
        />
      </section>

      {/* Scenario Cost Stack Chart */}
      <section className="mb-8">
        <ScenarioCostStackChart
          tippingPoint={tippingPoint}
          selectedPathwayKey={selectedPathwayKey}
        />
      </section>

      {/* Source Coverage */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950 p-8">
        <h2 className="text-xl font-bold text-white mb-4">Data sources & trust</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">Market data</h3>
            <p className="text-sm text-slate-300">
              Brent crude, jet fuel proxy, and EU ETS prices are fetched from live sources
              or high-confidence proxies. Source metadata is exposed via <code className="text-xs text-sky-300">/v1/sources/coverage</code>.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">SAF pathways</h3>
            <p className="text-sm text-slate-300">
              Cost curves are based on 2026 research (Energy Solutions, RMI, EASA).
              Pathway maturity grades: commercial, scaling, limited, future.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">Reserve signal</h3>
            <p className="text-sm text-slate-300">
              EU jet fuel reserve estimates are manually curated from IATA and EUROCONTROL assessments.
              Updated weekly. Manual signal with confidence score 0.62.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">Analysis models</h3>
            <p className="text-sm text-slate-300">
              Tipping point and airline decision engines run as shared Python services.
              Source code: <code className="text-xs text-sky-300">apps/api/app/services/analysis/</code>.
            </p>
          </div>
        </div>
      </section>
    </Shell>
  );
}
