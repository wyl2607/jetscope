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
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { buildResearchDecisionBrief, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '危机监测',
  description:
    '在一个运营危机监测视图中跟踪储备覆盖、临界事件与 SAF 经济性跨越。',
  path: '/crisis'
});

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const CRISIS_LINKS: Array<{ title: string; description: string; href: Route }> = [
  {
    title: '储备压力详情',
    description: '查看 EU 航油储备压力、来源置信度与供应缺口背景。',
    href: '/crisis/eu-jet-reserves' as Route
  },
  {
    title: 'SAF 临界点',
    description: '打开燃油、碳价、掺混比例与 SAF 成本敏感性的路径经济性视图。',
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
      eyebrow="危机监测"
      title="EU 航油冲击控制室"
      description="在同一工作流中跟踪储备压力、建模 SAF 跨越点并检查临界事件。"
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2">
          {CRISIS_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-sky-500/60"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-sky-300">危机工作流</p>
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
