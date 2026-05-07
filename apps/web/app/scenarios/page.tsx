import { InfoCard } from '@/components/cards';
import { ScenarioRegistry } from '@/components/scenario-registry';
import { Shell } from '@/components/shell';
import { TransitionReadinessDashboard } from '@/components/transition-readiness-dashboard';
import { buildApiUrl } from '@/lib/api-config';
import { getDashboardReadModel, type AirlineDecisionResponse, type ReserveSignal, type TippingPointResponse } from '@/lib/product-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

const cards = [
  {
    title: '情景库',
    body: '列出所有情景、状态、创建人、更新时间，以及是否为研究快照。'
  },
  {
    title: '情景对比',
    body: '并排比较当前工作态、保存情景、以及默认政策路径。'
  },
  {
    title: '敏感性扫描',
    body: '下一步将在这里放 crude / carbon / subsidy sweep 结果。'
  }
];

export const metadata: Metadata = buildPageMetadata({
  title: '情景',
  description:
    '管理 SAF 转型情景、比较政策路径，并通过持久化情景库工作流监测就绪度信号。',
  path: '/scenarios'
});

type PolicyTarget = {
  year: number;
  saf_share_pct: number;
  synthetic_share_pct: number;
  label: string;
};

function defaultReserveSignal(): ReserveSignal {
  return {
    generated_at: new Date().toISOString(),
    region: 'eu',
    coverage_days: 21,
    coverage_weeks: 3,
    stress_level: 'elevated',
    estimated_supply_gap_pct: 25,
    source_type: 'manual',
    source_name: 'IATA / EUROCONTROL curated estimate',
    confidence_score: 0.62
  };
}

function defaultTippingPointResponse(): TippingPointResponse {
  return {
    generated_at: new Date().toISOString(),
    effective_fossil_jet_usd_per_l: 1.3,
    signal: 'fossil_still_advantaged',
    inputs: {
      fossil_jet_usd_per_l: 1.3,
      carbon_price_eur_per_t: 95,
      subsidy_usd_per_l: 0,
      blend_rate_pct: 6
    },
    pathways: [
      {
        pathway_key: 'hefa',
        display_name: 'HEFA',
        net_cost_low_usd_per_l: 1,
        net_cost_high_usd_per_l: 1.5,
        spread_low_pct: 0,
        spread_high_pct: 15,
        status: 'inflection'
      }
    ]
  };
}

function defaultAirlineDecisionResponse(): AirlineDecisionResponse {
  return {
    generated_at: new Date().toISOString(),
    inputs: {
      fossil_jet_usd_per_l: 1.3,
      reserve_weeks: 3,
      carbon_price_eur_per_t: 95,
      pathway_key: 'hefa'
    },
    signal: 'incremental_adjustment',
    probabilities: {
      raise_fares: 0.45,
      cut_capacity: 0.3,
      buy_spot_saf: 0.2,
      sign_long_term_offtake: 0.25,
      ground_routes: 0.08
    }
  };
}

async function getPolicyTargets(): Promise<PolicyTarget[]> {
  try {
    const response = await fetch(buildApiUrl('/policies/refuel-eu'), { cache: 'no-store' });
    if (!response.ok) {
      return [];
    }
    return (await response.json()) as PolicyTarget[];
  } catch {
    return [];
  }
}

export default async function ScenariosPage() {
  const [dashboardReadModel, policyTargets] = await Promise.all([
    getDashboardReadModel(),
    getPolicyTargets()
  ]);
  const reserve = dashboardReadModel.reserve ?? defaultReserveSignal();
  const tippingPoint = dashboardReadModel.tippingPoint ?? defaultTippingPointResponse();
  const airlineDecision = dashboardReadModel.airlineDecision ?? defaultAirlineDecisionResponse();

  return (
    <Shell
      eyebrow="情景工作区"
      title="情景管理与转型监测"
      description="第二页面承接综合研究仪表盘，并已接入真实 scenario registry（FastAPI + PostgreSQL）用于创建、更新、删除与回填。"
    >
      <TransitionReadinessDashboard
        initialReserve={reserve}
        initialTippingPoint={tippingPoint}
        initialDecision={airlineDecision}
        policyTargets={policyTargets}
      />
      <ScenarioRegistry />

      <section className="mt-8 grid gap-5 md:grid-cols-3">
        {cards.map((card) => (
          <InfoCard key={card.title} title={card.title}>
            <p className="text-sm leading-7 text-slate-300">{card.body}</p>
          </InfoCard>
        ))}
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <InfoCard title="为什么放在第二页" subtitle="开发分层">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>1. 首页继续承担实时 market snapshot 与 crisis signal 的即时判断任务。</p>
            <p>2. 第二页面聚焦 canonical tipping-point、pathway、policy 与 scenario registry 的联动展示。</p>
            <p>3. 保存情景、对比、sweep 结果继续收敛到这一页下半区，不单开新 dashboard 路由。</p>
          </div>
        </InfoCard>

        <InfoCard title="后续产品挂钩" subtitle="后续接真实数据的接口位">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            <li>• 国家政策推进：接 `/v1/policies/refuel-eu` 与地区政策 catalog。</li>
            <li>• 航司采用率：接研究数据库或人工维护的 airline adoption registry。</li>
            <li>• 路线就绪度：继续沿用 canonical tipping-point 与 airline decision contract。</li>
            <li>• 时间轴：后台可编辑，支持标记已生效 / 延迟 / 草案。</li>
          </ul>
        </InfoCard>
      </section>
    </Shell>
  );
}
