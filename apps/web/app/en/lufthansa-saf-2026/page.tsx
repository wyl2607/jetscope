import { InfoCard, MetricCard } from '@/components/cards';
import { Shell } from '@/components/shell';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const revalidate = 600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Lufthansa SAF Inflection Review',
  description:
    'English review of the Lufthansa short-haul flight-cut signal, SAF breakeven economics, Germany supply-chain context, and JetScope review actions.',
  path: '/en/lufthansa-saf-2026',
  alternateLanguages: {
    'zh-CN': '/analysis/lufthansa-flight-cuts-2026-04',
    de: '/de/lufthansa-saf-2026',
    en: '/en/lufthansa-saf-2026'
  }
});

const impactMetrics = [
  {
    label: 'Short-haul cuts',
    value: '20,000',
    hint: 'Flights planned for removal from the summer schedule through October 2026.'
  },
  {
    label: 'Fuel saved',
    value: '40k t',
    hint: 'Annualized fuel-saving signal from the operational adjustment.'
  },
  {
    label: 'Oil shock',
    value: '$115/bbl',
    hint: 'Reference stress point where short-haul unit economics become fragile.'
  }
] as const;

const costRows = [
  { oil: '$80/bbl', jet: '$0.95/L', saf: '$1.60-1.85/L', spread: '+70%', tone: 'border-rose-200 bg-rose-50 text-rose-800' },
  { oil: '$115/bbl', jet: '$1.20/L', saf: '$1.60-1.85/L', spread: '+35-50%', tone: 'border-amber-200 bg-amber-50 text-amber-800' },
  { oil: '$150/bbl', jet: '$1.60+/L', saf: '$1.20-1.40/L', spread: 'near parity', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
] as const;

const germanyFactors = [
  'Chemical clusters and refinery expertise can shorten SAF scale-up cycles.',
  'Low-cost wind power can reduce energy-heavy conversion costs.',
  'Domestic offtake can lower logistics exposure for German airlines.',
  'Policy-driven demand under ReFuelEU Aviation gives suppliers a visible ramp.'
] as const;

const reviewActions: Array<{ title: string; description: string; href: Route }> = [
  {
    title: 'Check live Germany fuel proxies',
    description: 'Review Brent, global jet fuel, EU jet proxy, and carbon proxy movement before using the analysis.',
    href: '/en/prices/germany-jet-fuel' as Route
  },
  {
    title: 'Inspect source quality',
    description: 'Confirm whether the market inputs are live, proxy-backed, fallback, or unavailable.',
    href: '/en/sources?filter=review' as Route
  },
  {
    title: 'Review saved assumptions',
    description: 'Compare the Lufthansa signal with saved scenario assumptions before changing procurement posture.',
    href: '/en/scenarios' as Route
  },
  {
    title: 'Prepare report evidence',
    description: 'Use the report workbench to collect launch posture, source status, and follow-up actions.',
    href: '/en/reports' as Route
  }
] as const;

export default function EnglishLufthansaSafAnalysisPage() {
  return (
    <Shell
      locale="en"
      eyebrow="Analysis · Lufthansa"
      title="Lufthansa SAF Inflection Review"
      description="A display-only English review of the Lufthansa flight-cut signal, SAF cost pressure, and Germany supply-chain opportunity."
    >
      <section className="grid gap-4 md:grid-cols-3">
        {impactMetrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} hint={metric.hint} />
        ))}
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <InfoCard title="Signal Read" subtitle="Operational cut as fuel-transition evidence">
          <div className="space-y-4 text-sm leading-7 text-slate-700">
            <p>
              The flight-cut signal is not just a cost-control story. It shows how quickly low-margin short-haul flying can
              become exposed when jet-fuel prices, carbon costs, and mandated SAF blending move together.
            </p>
            <p>
              At roughly $115 per barrel, the SAF premium moves from unreachable to reviewable. That is the practical
              inflection JetScope should track: when fuel transition becomes an operating decision rather than only a
              compliance line item.
            </p>
            <p>
              This English surface is intentionally read-only. Protected scenario writes and refresh operations still live
              in the primary workspaces with their existing admin-token boundaries.
            </p>
          </div>
        </InfoCard>

        <InfoCard title="Decision Boundary" subtitle="How to read the signal">
          <ul className="space-y-3 text-sm leading-7 text-slate-700">
            <li>Short-haul routes have less fare flexibility and thinner margins.</li>
            <li>Fuel and carbon pressure can turn marginal capacity into a removal candidate.</li>
            <li>SAF competitiveness improves when fossil fuel and carbon exposure rise together.</li>
            <li>Germany’s supply-chain advantage matters only if source quality and offtake evidence stay reviewable.</li>
          </ul>
        </InfoCard>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/70">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-700">Cost inflection</p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-950">Oil-price stress narrows the SAF spread</h3>
          </div>
          <Link className="text-sm font-semibold text-sky-700 underline" href="/en/prices/germany-jet-fuel">
            Open Germany price monitor
          </Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {costRows.map((row) => (
            <div key={row.oil} className={`rounded-lg border p-4 ${row.tone}`}>
              <p className="text-sm font-semibold">{row.oil}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.14em]">Jet-A cost</p>
              <p className="text-lg font-semibold">{row.jet}</p>
              <p className="mt-3 text-xs uppercase tracking-[0.14em]">SAF cost</p>
              <p className="text-lg font-semibold">{row.saf}</p>
              <p className="mt-3 text-sm">Spread: {row.spread}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm leading-7 text-slate-600">
          Carbon exposure further tightens the comparison because conventional jet fuel carries more policy-cost pressure
          than compliant SAF blends.
        </p>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <InfoCard title="Germany Supply-Chain Angle" subtitle="Why local capacity changes the airline equation">
          <ul className="space-y-3 text-sm leading-7 text-slate-700">
            {germanyFactors.map((factor) => (
              <li key={factor}>{factor}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="Review Actions" subtitle="Evidence paths before operational use">
          <div className="grid gap-3">
            {reviewActions.map((action) => (
              <Link
                key={action.title}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4 transition hover:border-sky-300 hover:bg-sky-50"
                href={action.href}
              >
                <span className="block text-sm font-semibold text-slate-950">{action.title}</span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">{action.description}</span>
              </Link>
            ))}
          </div>
        </InfoCard>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <InfoCard title="Locale Versions" subtitle="Same analysis context, localized surfaces">
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              <Link className="font-semibold text-sky-700 underline" href="/analysis/lufthansa-flight-cuts-2026-04">
                Open the primary Chinese analysis
              </Link>
            </p>
            <p>
              <Link className="font-semibold text-sky-700 underline" href="/de/lufthansa-saf-2026">
                Open the German analysis
              </Link>
            </p>
          </div>
        </InfoCard>

        <InfoCard title="Use Boundary" subtitle="Decision support, not a trading feed">
          <p className="text-sm leading-7 text-slate-700">
            Treat the page as an evidence review. Actual procurement decisions should use supplier quotes, contract terms,
            hedge posture, route profitability, and verified source coverage alongside JetScope’s market surfaces.
          </p>
        </InfoCard>
      </section>
    </Shell>
  );
}
