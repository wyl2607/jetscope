import { MetricCard } from '@/components/cards';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ScenarioRegistry } from '@/components/scenario-registry';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { TransitionReadinessDashboard } from '@/components/transition-readiness-dashboard';
import { buildApiUrl } from '@/lib/api-config';
import { getDashboardReadModel, type AirlineDecisionResponse, type TippingPointResponse } from '@/lib/product-read-model';
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
    if (!response.ok) return [];
    return (await response.json()) as PolicyTarget[];
  } catch {
    return [];
  }
}

function tippingPointLabel(signal: string): { label: string; tone: string } {
  if (signal === 'saf_cost_advantaged') return { label: 'SAF 已占优', tone: 'text-success' };
  if (signal === 'switch_window_opening') return { label: '切换窗口开启', tone: 'text-warning' };
  return { label: 'SAF 仍不经济', tone: 'text-danger' };
}

function airlineDecisionLabel(signal: string): string {
  if (signal === 'switch_window_opening') return '切换窗口开启';
  if (signal === 'capacity_stress_dominant') return '运力压力主导';
  return '渐进调整';
}

function reserveBasis(sourceType: string): SourceRef['basis'] {
  if (sourceType === 'official') return 'observed';
  if (sourceType === 'derived') return 'derived';
  return 'assumption';
}

export default async function ScenariosPage() {
  const [dashboardReadModel, policyTargets] = await Promise.all([
    getDashboardReadModel(),
    getPolicyTargets()
  ]);
  const reserve = dashboardReadModel.reserve;
  const usingDefaultTippingPoint = dashboardReadModel.tippingPoint == null;
  const usingDefaultDecision = dashboardReadModel.airlineDecision == null;
  const tippingPoint = dashboardReadModel.tippingPoint ?? defaultTippingPointResponse();
  const airlineDecision = dashboardReadModel.airlineDecision ?? defaultAirlineDecisionResponse();
  const asOf = usingDefaultTippingPoint ? null : tippingPoint.generated_at;
  const tippingSignal = usingDefaultTippingPoint
    ? { label: '需复核', tone: 'text-warning' }
    : tippingPointLabel(tippingPoint.signal);
  const fallbackCount = Number(usingDefaultTippingPoint) + Number(usingDefaultDecision) + Number(reserve == null);
  const dataPosture = fallbackCount === 0 ? '数据已接入' : fallbackCount === 3 ? '内置假设' : '部分假设';
  const dataTone = fallbackCount === 0 ? 'text-success' : fallbackCount === 3 ? 'text-danger' : 'text-warning';
  const reserveLabel = reserve ? `${reserve.coverage_weeks.toFixed(1)} 周` : '需复核';
  const reserveTone = reserve == null ? 'text-warning' : reserve.coverage_weeks <= 2 ? 'text-danger' : reserve.coverage_weeks <= 4 ? 'text-warning' : 'text-success';

  return (
    <PageTemplate
      eyebrow="情景工作区"
      title="情景管理与转型监测"
      question="这些保存下来的假设，还能不能代表当前市场？"
      asOf={asOf}
    >
      <SignalRow label="情景结论信号">
        <MetricCard
          label="转型信号"
          value={tippingSignal.label}
          valueClassName={tippingSignal.tone}
          hint={usingDefaultTippingPoint ? '临界点接口没有返回结果，当前结论来自内置假设。' : '当前临界点模型对 SAF 成本相对化石航油的判断。'}
        />
        <MetricCard
          label="数据姿态"
          value={dataPosture}
          valueClassName={dataTone}
          hint={dashboardReadModel.isFallback ? '市场快照接口处于回退；页面上的数字不能当作刚刚观测到的市场事实。' : `${fallbackCount} 个关键输入使用了假设或不可用数据。`}
        />
        <MetricCard
          label="航司决策信号"
          value={usingDefaultDecision ? '需复核' : airlineDecisionLabel(airlineDecision.signal)}
          valueClassName={usingDefaultDecision ? 'text-warning' : 'text-accent'}
          hint="把储备、碳价和航油输入映射为可讨论的航司动作概率。"
        />
        <MetricCard
          label="储备覆盖"
          value={reserveLabel}
          valueClassName={reserveTone}
          hint={reserve ? `来源 ${reserve.source_name} · 置信度 ${(reserve.confidence_score * 100).toFixed(0)}%` : '实时储备数据不可用；当前周数只是可编辑情景假设。'}
        />
      </SignalRow>

      <Panel title="转型监测" why="把燃油价格、碳价、储备压力和政策目标放在同一个工作区，判断哪些 SAF 路径接近可执行区间。">
        <TransitionReadinessDashboard
          initialReserve={reserve}
          initialTippingPoint={tippingPoint}
          initialDecision={airlineDecision}
          policyTargets={policyTargets}
        />
      </Panel>

      <Panel title="情景管理" why="保存和复核团队确认过的转型假设；受保护的写操作仍留在这个主工作区。">
        <ScenarioRegistry />
      </Panel>

      <Panel title="工作区能力" why="这些能力说明读者可以怎样使用情景，不把工作流描述误读成市场结论。">
        <ul className="grid gap-6 md:grid-cols-3 text-sm leading-7 text-muted">
          {cards.map((card) => (
            <li key={card.title}>
              <h3 className="text-lg font-medium text-ink">{card.title}</h3>
              <p className="mt-2">{card.body}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="页面职责" why="帮助读者把情景页的选择问题与驾驶舱、危机监测和来源复核页面分开。">
        <div className="space-y-3 text-sm leading-7 text-muted">
          <p>实时价格在决策驾驶舱，负责回答“现在发生了什么”。</p>
          <p>危机监测解释压力来源，负责回答“为什么需要行动”。</p>
          <p>情景工作区保存假设和比较结果，负责回答“下一步怎么选择”。</p>
          <p>来源复核在数据来源页，负责回答“这些数字的证据链是否足够可靠”。</p>
        </div>
      </Panel>

      <SourceFooter
        sources={[
          {
            id: 'dashboard-read-model',
            label: dashboardReadModel.isFallback ? `市场快照接口无响应，当前为内置兜底值（${dashboardReadModel.error ?? '未知原因'}）` : '市场快照接口（市场读数、来源状态和储备输入）',
            asOf: dashboardReadModel.isFallback ? null : dashboardReadModel.market.generated_at,
            basis: dashboardReadModel.isFallback ? 'assumption' : 'observed'
          },
          {
            id: 'tipping-point-analysis',
            label: usingDefaultTippingPoint ? '临界点分析无响应，当前使用内置情景假设' : '临界点分析接口（由市场输入推导 SAF 成本信号）',
            asOf: usingDefaultTippingPoint ? null : tippingPoint.generated_at,
            basis: usingDefaultTippingPoint ? 'assumption' : 'derived'
          },
          {
            id: 'airline-decision-analysis',
            label: usingDefaultDecision ? '航司决策分析无响应，当前使用内置情景假设' : '航司决策分析接口（由市场和储备输入推导动作概率）',
            asOf: usingDefaultDecision ? null : airlineDecision.generated_at,
            basis: usingDefaultDecision ? 'assumption' : 'derived'
          },
          {
            id: 'reserve-signal',
            label: reserve ? `储备信号（${reserve.source_name}）` : '储备信号不可用，当前使用可编辑周数假设',
            asOf: reserve?.generated_at ?? null,
            basis: reserve ? reserveBasis(reserve.source_type) : 'assumption'
          },
          {
            id: 'scenario-store',
            label: '本地情景库（保存的是团队假设，不是市场实测）',
            basis: 'assumption'
          },
          {
            id: 'policy-targets',
            label: policyTargets.length ? 'RefuelEU 政策目标接口' : 'RefuelEU 政策目标暂未返回',
            basis: 'assumption'
          }
        ]}
        methodHref="/sources"
        methodLabel="口径与来源清单"
        limitations={[
          '情景库是保存的假设；即使记录确实存在，里面的价格、碳价和路线数字也不能自动视为实测。',
          '临界点和航司决策信号是由输入推导的分析结果，不是对未来采购结果的保证。',
          '任一接口回退或不可用时，页面会继续提供可编辑工作区，但对应数字没有有效的实测 as-of；旧版“数据真实性”说明已并入这里。',
          '页面职责是产品分工说明，是否保留该说明由产品负责人决定。'
        ]}
      />
    </PageTemplate>
  );
}
