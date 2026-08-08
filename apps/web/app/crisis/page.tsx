import { MetricCard } from '@/components/cards';
import { FuelVsSafPriceChart } from '@/components/fuel-vs-saf-price-chart';
import { PageTemplate, SignalRow } from '@/components/page-template';
import { Panel } from '@/components/panel';
import { ResearchDecisionBriefCard } from '@/components/research-decision-brief';
import { ReservesCoverageStrip } from '@/components/reserves-coverage-strip';
import { SourceFooter, type SourceRef } from '@/components/source-footer';
import { TippingEventTimeline } from '@/components/tipping-event-timeline';
import { TippingPointSimulator } from '@/components/tipping-point-simulator';
import { assumed, derived, observed, type Figure } from '@/lib/figure';
import {
  getDashboardReadModel,
  toDecisionReadModel,
  toTippingPointReadModel
} from '@/lib/product-read-model';

const CRISIS_CHART_SOURCE_ID = 'saf-tipping-model';

function fossilJetFigure(value: number, asOf: string | null, isAssumed: boolean): Figure {
  if (isAssumed || !asOf) {
    return assumed({
      value,
      unit: 'USD/L',
      sourceId: CRISIS_CHART_SOURCE_ID,
      precision: 2,
      method: 'crisis page fossil-jet fallback or missing source timestamp'
    });
  }
  return observed({
    value,
    unit: 'USD/L',
    sourceId: CRISIS_CHART_SOURCE_ID,
    asOf,
    precision: 2
  });
}

function effectiveFossilJetFigure(value: number, asOf: string | null): Figure {
  return derived({
    value,
    unit: 'USD/L',
    sourceId: CRISIS_CHART_SOURCE_ID,
    asOf,
    precision: 2,
    method:
      'effective fossil jet = spot fossil jet + carbon price pressure at selected blend rate, minus subsidy (tipping-point model)'
  });
}
import { getEuReserveCoverage, getTippingPointEvents } from '@/lib/portfolio-read-model';
import { buildResearchDecisionBrief, getResearchSignals } from '@/lib/research-signals-read-model';
import { buildPageMetadata } from '@/lib/seo';
import type { Metadata, Route } from 'next';

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

const REVIEW_SOURCES_ROUTE = '/sources?filter=review' as Route;

type CrisisActionLink = {
  title: string;
  description: string;
  href: Route;
  eyebrow: string;
};

function buildSafWorkbenchHref({
  fallbackFossil,
  carbonPriceEurPerT,
  reserveWeeks
}: {
  fallbackFossil: number;
  carbonPriceEurPerT: number;
  reserveWeeks: number | null;
}): Route {
  const params = new URLSearchParams({
    fuel: fallbackFossil.toFixed(3),
    carbon: carbonPriceEurPerT.toFixed(2),
    subsidy: '0.000',
    blend: '6.00',
    reserve: reserveWeeks?.toFixed(2) ?? '3.00',
    pathway: 'hefa'
  });
  return `/crisis/saf-tipping-point?${params.toString()}` as Route;
}

function buildCrisisLinks(safWorkbenchHref: Route, reviewSourcesHref: Route): CrisisActionLink[] {
  return [
    {
      title: '打开储备详情',
      description: '先检查覆盖周数、来源类型、置信度和供应缺口，再调整采购判断。',
      href: '/crisis/eu-jet-reserves' as Route,
      eyebrow: '储备'
    },
    {
      title: '打开 SAF 工作台',
      description: '带入当前燃油、碳价和储备读数，直接测试 SAF 路径敏感性。',
      href: safWorkbenchHref,
      eyebrow: '模拟'
    },
    {
      title: '复核数据来源',
      description: '查看需要复核的市场输入，确认实时、代理、回退和降级状态。',
      href: reviewSourcesHref,
      eyebrow: '来源'
    }
  ];
}

function stressLabel(level?: string): string {
  if (level === 'critical') return '紧急';
  if (level === 'elevated') return '偏高';
  if (level === 'guarded') return '警戒';
  if (level === 'normal') return '平稳';
  return '回退模式';
}

function sourceTypeLabel(sourceType?: string): string {
  if (sourceType === 'official') return '官方来源';
  if (sourceType === 'manual') return '人工估算';
  if (sourceType === 'derived') return '模型推导';
  if (!sourceType) return '情景基线';
  return sourceType;
}

function confidenceLabel(value?: number): string {
  if (value == null) return '暂无置信度';
  if (value >= 0.85) return '高置信';
  if (value >= 0.7) return '中高置信';
  return '中等置信';
}

function signalLabel(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'SAF 成本占优';
  if (signal === 'switch_window_opening') return '切换窗口正在打开';
  if (signal === 'fossil_still_advantaged') return '化石航油仍占优';
  return '情景基线';
}

// Text-only variants for the signal row. Section 1 rule 5: the tint is a claim
// about the data, so "情景基线" (no live signal) must not read like a result.
function signalTextTone(signal?: string): string {
  if (signal === 'saf_cost_advantaged') return 'text-success';
  if (signal === 'switch_window_opening') return 'text-warning';
  if (signal === 'fossil_still_advantaged') return 'text-accent';
  return 'text-danger';
}

function stressTextTone(level?: string): string {
  if (level === 'critical') return 'text-danger';
  if (level === 'elevated') return 'text-warning';
  if (level === 'normal') return 'text-success';
  return 'text-danger';
}

function confidenceTextTone(value?: number): string {
  if (value == null) return 'text-danger';
  if (value >= 0.85) return 'text-success';
  if (value >= 0.7) return 'text-accent';
  return 'text-warning';
}

// Section 3: an official filing, a model output and a hand estimate are three
// different kinds of claim and the footer has to say which one this is.
function reserveBasis(sourceType?: string): SourceRef['basis'] {
  if (sourceType === 'official') return 'observed';
  if (sourceType === 'derived') return 'derived';
  return 'assumption';
}

export default async function CrisisPage() {
  const [dashboardReadModel, reserve, events, researchSignals] = await Promise.all([
    getDashboardReadModel(),
    getEuReserveCoverage(),
    getTippingPointEvents({ since: isoDaysAgo(42), limit: 50 }),
    getResearchSignals()
  ]);

  const tippingPoint = toTippingPointReadModel(dashboardReadModel.tippingPoint);
  const decision = toDecisionReadModel(dashboardReadModel.airlineDecision);

  const fallbackFossil = dashboardReadModel.market.values.jet_eu_proxy_usd_per_l ?? dashboardReadModel.market.values.jet_usd_per_l ?? 0.657;
  const researchBrief = buildResearchDecisionBrief(researchSignals);
  const reserveWeeks = reserve?.coverage_weeks ?? dashboardReadModel.reserve?.coverage_weeks ?? null;
  const reserveStatus = reserve ? '储备数据已连接' : '正在使用情景基线';
  const sourceType = reserve?.source_type ?? '情景基线';
  const confidence = reserve ? `${Math.round(reserve.confidence_score * 100)}%` : '暂不可用';
  const marketConfidence = dashboardReadModel.market.source_status.confidence;
  const marketConfidenceText = typeof marketConfidence === 'number'
    ? `${Math.round(marketConfidence * 100)}%`
    : '暂不可用';
  const carbonPriceEurPerT = Number(((dashboardReadModel.market.values.carbon_proxy_usd_per_t ?? 102.6) / 1.08).toFixed(2));
  const safWorkbenchHref = buildSafWorkbenchHref({
    fallbackFossil,
    carbonPriceEurPerT,
    reserveWeeks
  });
  const reviewSourcesHref = REVIEW_SOURCES_ROUTE;
  const crisisLinks = buildCrisisLinks(safWorkbenchHref, reviewSourcesHref);

  // 储备读数没连上时不盖时间戳：兜底值带着"刚刚"的时间会被当成实测。
  const asOf = reserve?.generated_at ?? null;

  return (
    <PageTemplate
      eyebrow="危机简报"
      title="EU 航油风险简报"
      question="现在的储备压力和数据可信度，够不够支撑改变采购动作？"
      asOf={asOf}
    >
      <div className="space-y-8">
        <SignalRow label="危机信号">
          {/* 契约第 2 节规则 2：结论在最前。后面三张都是"这个结论能信几分"。 */}
          <MetricCard
            label="决策信号"
            value={signalLabel(tippingPoint?.signal)}
            valueClassName={signalTextTone(tippingPoint?.signal)}
            hint={`${reserveStatus} · 化石航油基线 $${fallbackFossil.toFixed(2)}/L`}
          />
          <MetricCard
            label="储备覆盖"
            value={reserveWeeks ? `${reserveWeeks.toFixed(2)} 周` : '需重新连接'}
            valueClassName={stressTextTone(reserve?.stress_level)}
            hint={`压力等级：${stressLabel(reserve?.stress_level)} · ${reserve?.source_name ?? '未连接实时储备源'}`}
          />
          <MetricCard
            label="储备数据置信度"
            value={confidence}
            valueClassName={confidenceTextTone(reserve?.confidence_score)}
            hint={`${confidenceLabel(reserve?.confidence_score)} · 来源类型：${sourceTypeLabel(sourceType)}`}
          />
          <MetricCard
            label="市场数据置信度"
            value={marketConfidenceText}
            hint="市场快照的整体可信度，决定下面的价格阶梯能不能直接引用"
            cardHref={reviewSourcesHref}
          />
        </SignalRow>

        <Panel
          title="下一步动作"
          why="建议路径是先确认储备可信度，再测试 SAF 经济性——不要跳过第一步直接改采购。"
        >
          <div className="grid gap-4 md:grid-cols-3">
            {crisisLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="block rounded-xl border border-line bg-surface p-4 transition hover:border-accent hover:bg-accent-soft"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-accent">{item.eyebrow}</p>
                <p className="mt-2 font-medium text-ink">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{item.description}</p>
              </a>
            ))}
          </div>
        </Panel>

        <Panel
          title="欧盟航煤储备覆盖"
          why="储备周数是危机叙事的底座。跌破警戒线时，价格反应和政策反应会同时加速。"
        >
          <ReservesCoverageStrip reserve={reserve} />
        </Panel>

        <Panel
          title="SAF 交叉时间线"
          why="记录 SAF 有效成本真的越过化石航油的时刻，而不是模型预测它会越过。"
        >
          <TippingEventTimeline events={events} />
        </Panel>

        <Panel
          title="研究决策层"
          why="解释上面这些数字为什么在动。信号本身不是结论，是结论的理由。"
        >
          <ResearchDecisionBriefCard brief={researchBrief} compact />
        </Panel>

        <Panel
          title="航油与 SAF 价格阶梯"
          why="化石航油基准、碳调整后的有效成本，以及各路径的净成本区间——要看的是差距，不是绝对值。"
        >
          <FuelVsSafPriceChart
            fossilJetUsdPerL={fossilJetFigure(
              tippingPoint?.inputs.fossilJetUsdPerL ?? fallbackFossil,
              tippingPoint?.generatedAt ?? null,
              tippingPoint == null
            )}
            effectiveFossilJetUsdPerL={effectiveFossilJetFigure(
              tippingPoint?.effectiveFossilJetUsdPerL ?? fallbackFossil,
              tippingPoint?.generatedAt ?? null
            )}
            pathways={tippingPoint?.pathways ?? []}
          />
        </Panel>

        <Panel
          title="拐点模拟器"
          why="综合燃油价格、碳价、储备压力与路径经济性的 API 模型；用来试探结论在什么条件下翻转。"
        >
          <TippingPointSimulator
            tippingPoint={tippingPoint}
            decision={decision}
            reserveWeeks={
              reserveWeeks != null && reserve
                ? reserve.source_type === 'official'
                  ? observed({
                      value: reserveWeeks,
                      unit: 'weeks',
                      sourceId: 'eu-reserve',
                      asOf: reserve.generated_at,
                      precision: 1
                    })
                  : reserve.source_type === 'derived'
                    ? derived({
                        value: reserveWeeks,
                        unit: 'weeks',
                        sourceId: 'eu-reserve',
                        asOf: reserve.generated_at,
                        precision: 1,
                        method: `derived reserve coverage from ${reserve.source_name}`
                      })
                    : assumed({
                        value: reserveWeeks,
                        unit: 'weeks',
                        sourceId: 'eu-reserve',
                        precision: 1,
                        method: `reserve coverage from ${reserve.source_name} (${reserve.source_type})`
                      })
                : reserveWeeks != null
                  ? assumed({
                      value: reserveWeeks,
                      unit: 'weeks',
                      sourceId: 'eu-reserve',
                      precision: 1,
                      method: 'dashboard reserve coverage without connected reserve source metadata'
                    })
                  : assumed({
                      value: 3,
                      unit: 'weeks',
                      sourceId: 'eu-reserve',
                      precision: 1,
                      method: '情景基线 3.0 周；实时储备未连接'
                    })
            }
          />
        </Panel>

        <SourceFooter
          sources={[
            {
              id: 'eu-reserve',
              label: reserve
                ? `EU 航油储备覆盖，来自${sourceTypeLabel(sourceType)}（${reserve.source_name}）`
                : '储备服务未连接，覆盖读数使用情景基线',
              asOf,
              basis: reserve ? reserveBasis(sourceType) : 'assumption'
            },
            {
              id: 'market-snapshot',
              label: `市场快照（化石航油基线 $${fallbackFossil.toFixed(2)}/L、碳价代理 €${carbonPriceEurPerT.toFixed(2)}/t）`,
              asOf: dashboardReadModel.market.generated_at,
              basis: 'observed'
            },
            {
              id: 'tipping-events',
              label: `复核窗口内观察到的 ${events.length} 个 SAF 交叉事件`,
              basis: 'observed'
            },
            {
              id: 'tipping-model',
              label: '决策信号与路径净成本由拐点模型推导，不是上游直接给出的读数',
              basis: 'derived'
            }
          ]}
          methodHref="/sources"
          methodLabel="口径与来源清单"
          limitations={[
            '本页描述的是区域层面的储备压力，不是某一家航司的供应状况——航司自有合同和库存不在其中。',
            '交叉事件只统计复核窗口内的观察值。没有事件不等于没有风险，只表示这个窗口内没观察到跨越。',
            '储备来源若是人工估算，上方会标成"情景假设"，不能当作官方实时报价引用。',
            '模拟器用于试探敏感性，它的输出是情景推演，不构成采购建议。'
          ]}
        />
      </div>
    </PageTemplate>
  );
}
