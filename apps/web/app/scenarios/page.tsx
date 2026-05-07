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
    title: '保存假设',
    body: '把油价、碳价、补贴和航线成本保存成可复用的决策版本。'
  },
  {
    title: '比较压力',
    body: '对照当前市场、储备压力和政策目标，判断哪条路径最先变得可行。'
  },
  {
    title: '敏感性扫描',
    body: '围绕燃油、碳价和补贴做范围扫描，找到最影响结论的输入。'
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
      description="保存、复用和比较 SAF 转型假设，把实时市场压力转成可讨论的采购、航线和政策情景。"
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
            <p className="text-sm leading-7 text-slate-700">{card.body}</p>
          </InfoCard>
        ))}
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <InfoCard title="页面职责" subtitle="每个页面只回答一个核心问题">
          <div className="space-y-3 text-sm leading-7 text-slate-700">
            <p>实时价格在决策驾驶舱，负责回答“现在发生了什么”。</p>
            <p>危机监测解释压力来源，负责回答“为什么需要行动”。</p>
            <p>情景工作区保存假设和比较结果，负责回答“下一步怎么选择”。</p>
          </div>
        </InfoCard>

        <InfoCard title="数据真实性" subtitle="结论必须带来源与更新时间">
          <ul className="space-y-3 text-sm leading-7 text-slate-700">
            <li>• 来源复核在数据来源页，显示每项指标的置信度、延迟和回退状态。</li>
            <li>• 政策目标、储备和价格趋势只使用本地历史库或已标注的代理指标。</li>
            <li>• 情景保存用于复盘和团队讨论，不替代真实采购审批。</li>
            <li>• 多语言入口保持全站一致，翻译覆盖不足时回到已验证页面。</li>
          </ul>
        </InfoCard>
      </section>
    </Shell>
  );
}
