import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { SourceFooter } from '@/components/source-footer';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

const LUFTHANSA_NEWSROOM =
  'https://newsroom.lufthansagroup.com/en/lufthansa-group-optimises-flight-offering-in-summer-across-all-six-hubs/';

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

const costRows = [
  { oil: '$80/bbl', jet: '$0.95/L', saf: '$1.60–1.85/L', spread: '+70%', tone: 'border-danger bg-danger-soft text-danger' },
  { oil: '$115/bbl', jet: '$1.20/L', saf: '$1.60–1.85/L', spread: '+35–50%', tone: 'border-warning bg-warning-soft text-warning' },
  { oil: '$150/bbl', jet: '$1.60+/L', saf: '$1.20–1.40/L', spread: 'near parity', tone: 'border-success bg-success-soft text-success' }
] as const;

const germanyFactors = [
  'Chemical clusters and refinery expertise can shorten SAF scale-up cycles.',
  'Low-cost wind power can reduce energy-heavy conversion costs.',
  'Domestic offtake can lower logistics exposure for German airlines.',
  'Policy-driven demand under ReFuelEU Aviation gives suppliers a visible ramp.'
] as const;

const reviewActions: Array<{ title: string; description: string; href: Route }> = [
  { title: 'Check live Germany fuel proxies', description: 'Review Brent, global jet fuel, EU jet proxy, and carbon proxy movement before using the analysis.', href: '/en/prices/germany-jet-fuel' as Route },
  { title: 'Inspect source quality', description: 'Confirm whether the market inputs are live, proxy-backed, fallback, or unavailable.', href: '/en/sources?filter=review' as Route },
  { title: 'Review saved assumptions', description: 'Compare the Lufthansa signal with saved scenario assumptions before changing procurement posture.', href: '/en/scenarios' as Route },
  { title: 'Prepare report evidence', description: 'Use the report workbench to collect launch posture, source status, and follow-up actions.', href: '/en/reports' as Route }
];

export default function EnglishLufthansaSafAnalysisPage() {
  return (
    <PageTemplate
      locale="en"
      eyebrow="Analysis · Lufthansa"
      title="Lufthansa SAF Inflection Review"
      question="Should this capacity cut move SAF procurement into active review now?"
      asOf={null}
    >
      <SignalRow label="Procurement timing signals">
        <MetricCard label="Procurement posture" value="Review now" valueClassName="text-warning" hint="The event opens a review window; it does not justify a purchase without current quotes." />
        <MetricCard label="Short-haul cuts" value="20,000" hint="Flights described in the April 2026 Lufthansa announcement." />
        <MetricCard label="Fuel saved" value="40k t" hint="Annualized author estimate from the operational adjustment." />
        <MetricCard label="Model stress point" value="$115/bbl" hint="Derived reference where the modeled SAF premium becomes reviewable." />
      </SignalRow>

      <Panel title="Signal read" why="The operating cut matters only if it shows fuel transition pressure reaching real capacity decisions.">
        <div className="grid gap-6 text-sm leading-7 text-muted tabular-nums lg:grid-cols-2">
          <div className="space-y-4"><p>The flight-cut signal is not just a cost-control story. It shows how quickly low-margin short-haul flying can become exposed when jet-fuel prices, carbon costs, and mandated SAF blending move together.</p><p>At roughly $115 per barrel in the author model, the SAF premium moves from unreachable to reviewable.</p></div>
          <ul className="space-y-3"><li>Short-haul routes have less fare flexibility and thinner margins.</li><li>Fuel and carbon pressure can turn marginal capacity into a removal candidate.</li><li>SAF competitiveness improves when fossil fuel and carbon exposure rise together.</li><li>Germany’s supply-chain advantage still requires reviewable source and offtake evidence.</li></ul>
        </div>
      </Panel>

      <Panel title="Oil-price stress narrows the SAF spread" why="The three bands make the decision’s sensitivity to the fossil-price assumption explicit." action={<Link className="text-sm font-semibold text-accent underline" href="/en/prices/germany-jet-fuel">Open Germany price monitor</Link>}>
        <div className="space-y-5 tabular-nums">
          <div className="grid gap-6 md:grid-cols-3">{costRows.map((row) => <div key={row.oil} className={`rounded-xl border p-4 ${row.tone}`}><p className="text-sm font-semibold">{row.oil}</p><p className="mt-3 text-xs uppercase tracking-[0.18em]">Jet-A cost</p><p className="text-lg font-semibold">{row.jet}</p><p className="mt-3 text-xs uppercase tracking-[0.18em]">SAF cost</p><p className="text-lg font-semibold">{row.saf}</p><p className="mt-3 text-sm">Spread: {row.spread}</p></div>)}</div>
          <p className="text-sm leading-7 text-muted">Carbon exposure further tightens the comparison because conventional jet fuel carries more policy-cost pressure than compliant SAF blends.</p>
        </div>
      </Panel>

      <Panel title="Germany supply-chain angle" why="Local capacity changes procurement timing only when it can lower delivered cost and logistics exposure.">
        <ul className="grid gap-6 text-sm leading-7 text-muted lg:grid-cols-2">{germanyFactors.map((factor) => <li key={factor} className="rounded-xl border border-line bg-surface-muted p-4">{factor}</li>)}</ul>
      </Panel>

      <Panel title="Review actions" why="Each next step moves the static event signal toward current, auditable evidence.">
        <div className="grid gap-6 lg:grid-cols-2">{reviewActions.map((action) => <Link key={action.title} className="rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft" href={action.href}><span className="block text-sm font-semibold text-ink">{action.title}</span><span className="mt-1 block text-sm leading-6 text-muted">{action.description}</span></Link>)}</div>
      </Panel>

      <Panel title="Locale versions and use boundary" why="Localized context and a clear boundary prevent this static analysis from being mistaken for a trading feed.">
        <div className="grid gap-6 text-sm leading-7 text-muted lg:grid-cols-2"><div className="space-y-3"><p><Link className="font-semibold text-accent underline" href="/analysis/lufthansa-flight-cuts-2026-04">Open the primary Chinese analysis</Link></p><p><Link className="font-semibold text-accent underline" href="/de/lufthansa-saf-2026">Open the German analysis</Link></p></div><p>Treat the page as an evidence review. Actual procurement decisions should use supplier quotes, contract terms, hedge posture, route profitability, and verified source coverage alongside JetScope’s market surfaces.</p></div>
      </Panel>

      <SourceFooter
        locale="en"
        sources={[
          { id: 'lufthansa-newsroom', label: 'Lufthansa Group newsroom: 2026 summer schedule adjustment', href: LUFTHANSA_NEWSROOM, basis: 'observed' },
          { id: 'author-cost-model', label: 'JetScope cost-spread, fuel-saving, and procurement-timing analysis', basis: 'derived' },
          { id: 'refueleu-targets', label: 'ReFuelEU blending targets as used by this article', basis: 'assumption' }
        ]}
        methodHref="/en/sources"
        methodLabel="Source and method registry"
        limitations={[
          'This is a signed, static April 2026 event analysis and does not update with market prices.',
          'Fuel savings, cost bands, Germany advantages, and the procurement posture are estimates or derived scenarios, not supplier quotes.',
          'Operational use requires current market inputs, supplier terms, hedge posture, route profitability, and verified source coverage.'
        ]}
      />
    </PageTemplate>
  );
}
