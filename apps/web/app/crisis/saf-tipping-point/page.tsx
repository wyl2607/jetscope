import { Shell } from '@/components/shell';
import { getDashboardReadModel, toDecisionReadModel, toTippingPointReadModel } from '@/lib/product-read-model';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { buildPageMetadata } from '@/lib/seo';
import { TippingPointWorkbench } from '@/components/tipping-point-workbench';

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
  // Prefer analysisInputs (Rotterdam → jet_eu_proxy_usd_per_l → US jet). Never invent LH jet USD/L.
  const liveFuel = readModel.analysisInputs.fossilJetUsdPerL;
  const liveCarbonEur = readModel.analysisInputs.carbonPriceEurPerT;
  const jetSourceKey = readModel.analysisInputs.jetSourceKey; // e.g. jet_eu_proxy_usd_per_l

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
        <Link
          href="/crisis/saf-tipping-point?lh=1"
          className="rounded-lg border border-amber-700 px-4 py-2 text-sm font-medium text-amber-100 hover:border-amber-500 hover:text-white"
        >
          LH Q2 2026 playbook
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

      <TippingPointWorkbench
        initialTippingPoint={tippingPoint}
        initialDecision={airlineDecision}
        initialReserveWeeks={readModel.reserve?.coverage_weeks ?? 3.0}
        liveDefaults={{
          fossilJetUsdPerL: liveFuel,
          carbonPriceEurPerT: liveCarbonEur,
          subsidyUsdPerL: 0,
          blendRatePct: 6,
          reserveWeeks: readModel.analysisInputs.reserveWeeks,
          pathwayKey: 'hefa'
        }}
      />

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
              EU jet reserve coverage is a JetScope curated / env override signal (not an IATA/EUROCONTROL live feed).
              Supply-gap is null unless <code className="text-xs text-sky-300">SAFVSOIL_SUPPLY_GAP_PCT</code> is set.
              LH supply-status note as_of 2026-08-04 is narrative only. Active jet source: {jetSourceKey}.
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
