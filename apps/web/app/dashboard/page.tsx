import { InfoCard, MetricCard } from '@/components/cards';
import { ProvenanceSummary } from '@/components/provenance-summary';
import { Shell } from '@/components/shell';
import { PolicyTimelineWithMarketTime } from '@/components/policy-timeline-with-market-time';
import { PriceTrendsChart } from '@/components/price-trends-chart';
import { computeDashboardAlertBanners } from '@/lib/market-signals';
import { getDashboardReadModel, type DashboardReadModel } from '@/lib/dashboard-read-model';
import { getPriceTrendChartReadModel } from '@/lib/product-read-model';
import { getSourcesReadModel } from '@/lib/sources-read-model';
import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

const priorities = [
  '实时市场数据：Brent 原油、航油代理价、EU ETS 碳价',
  '统一情景引擎：价格、补贴、碳成本与盈亏平衡分析',
  '管理控制：航线假设、政策参数与数据来源',
  '导出与报告：图表、快照与情景对比'
];


export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: '决策驾驶舱',
  description:
    '可持续航空燃料与传统航油的实时决策看板，覆盖市场快照、情景库状态与转型交付信号。',
  path: '/dashboard'
});

function formatNumber(value: number, digits = 2) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatAsOf(value: string | null) {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString();
}

function dashboardFallbackHint(readModel: DashboardReadModel) {
  if (!readModel.isFallback) {
    return `来源状态： ${readModel.market.source_status.overall} | 新鲜度=${readModel.freshnessSignal.level} (${readModel.freshnessSignal.minutes}m)`;
  }

  return '本地 API 暂不可用，正在使用内置决策模型，确保驾驶舱仍可审阅。';
}

export default async function DashboardPage() {
  const [readModel, priceChartData, sourcesReadModel] = await Promise.all([
    getDashboardReadModel(),
    getPriceTrendChartReadModel(),
    getSourcesReadModel()
  ]);
  const market = readModel.market.values;
  const risk = readModel.topRiskSignal;
  const freshness = readModel.freshnessSignal;

  const riskColor =
    risk?.level === 'alert' ? 'text-rose-300' : risk?.level === 'watch' ? 'text-amber-300' : 'text-emerald-300';
  const riskValue =
    risk == null
      ? 'n/a'
      : `${risk.metric} ${risk.window} ${risk.changePct > 0 ? '+' : ''}${risk.changePct.toFixed(2)}%`;
  const riskHref = risk == null ? undefined : `/sources?focus=${encodeURIComponent(risk.metricKey)}`;
  const riskHint =
    risk == null
      ? '暂无历史风险信号'
      : `级别=${risk.level} | 截至=${formatAsOf(risk.latestAsOf)} | 样本=${risk.sampleCount}`;

  const alertBanners = computeDashboardAlertBanners(readModel.market, risk);

  return (
    <Shell
      eyebrow="市场情报"
      title="JetScope 决策驾驶舱"
      description="面向 SAF 决策的实时市场快照、情景建模与转型风险信号。"
    >
      {alertBanners.length > 0 && (
        <section className="mb-6 space-y-3">
          {alertBanners.map((banner, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-4 ${
                banner.level === 'alert'
                  ? 'border-rose-800 bg-rose-950/40'
                  : 'border-amber-800 bg-amber-950/40'
              }`}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      banner.level === 'alert' ? 'text-rose-300' : 'text-amber-300'
                    }`}
                  >
                    {banner.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-200">{banner.message}</p>
                </div>
                {banner.href && (
                  <a
                    href={banner.href}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                      banner.level === 'alert'
                        ? 'bg-rose-600 text-white hover:bg-rose-500'
                        : 'bg-amber-600 text-white hover:bg-amber-500'
                    }`}
                  >
                    查看详情 →
                  </a>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="市场快照"
          value={`$${formatNumber(market.brent_usd_per_bbl)}/bbl`}
          hint={`Jet(全球) $${formatNumber(market.jet_usd_per_l, 3)}/L | Jet(EU 代理) $${formatNumber(market.jet_eu_proxy_usd_per_l ?? market.jet_usd_per_l, 3)}/L | 碳价 $${formatNumber(market.carbon_proxy_usd_per_t)}/tCO2`}
        />
        <MetricCard
          label="情景模式"
          value={`${readModel.scenarioCount}`}
          hint={readModel.scenarioCount > 0 ? '已有保存情景，可用于对比。' : '暂无保存情景；需要 what-if 案例时可从 Scenarios 开始。'}
        />
        <MetricCard label="管理控制" value="必需" hint="路线成本、政策参数、来源维护" />
        <MetricCard
          label="交付状态"
          value={readModel.isFallback ? '回退' : '实时切片'}
          hint={dashboardFallbackHint(readModel)}
        />
        <MetricCard
          label="最高风险信号"
          value={riskValue}
          hint={riskHint}
          valueClassName={riskColor}
          valueHref={riskHref}
        />
        <MetricCard
          label="德国航油价格页"
          value="打开实时页面"
          hint="SSR 市场页，展示 Brent、全球航油、EU 航油代理价、碳价及 1d/7d/30d 变化"
          cardHref="/prices/germany-jet-fuel"
        />
      </section>

      <section className="mt-8">
        <ProvenanceSummary
          summary={sourcesReadModel.summary}
          completeness={sourcesReadModel.completeness}
          generatedAt={sourcesReadModel.generatedAt}
          href="/sources"
        />
      </section>

      <section className="mt-8">
        <PriceTrendsChart
          metrics={priceChartData.metrics}
          isLoading={false}
          error={priceChartData.error}
        />
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <InfoCard title="决策驾驶舱能力" subtitle="产品能力">
          <ul className="space-y-3 text-sm leading-7 text-slate-300">
            {priorities.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </InfoCard>

        <InfoCard title="数据来源" subtitle="市场覆盖">
          <div className="space-y-3 text-sm leading-7 text-slate-300">
            <p>• 覆盖健康时，实时指标优先使用主要或官方来源。</p>
            <p>• 代理指标与回退值分开标注。</p>
            <p>• 置信度、滞后时间与降级原因可在 Sources 页查看。</p>
            <p>• 回退值用于保持驾驶舱可用，但不会对决策用户隐藏。</p>
          </div>
        </InfoCard>
      </section>

      <section className="mt-8">
        <InfoCard title="最近情景" subtitle="来自 FastAPI / PostgreSQL">
          {readModel.recentScenarioNames.length ? (
            <ul className="space-y-2 text-sm leading-7 text-slate-300">
              {readModel.recentScenarioNames.map((name) => (
                <li key={name}>• {name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm leading-7 text-slate-300">
              暂无保存情景。可通过 scenario API 创建一个情景，用于端到端验证 CRUD。
            </p>
          )}
        </InfoCard>
      </section>

      <section className="mt-12">
        <PolicyTimelineWithMarketTime />
      </section>
    </Shell>
  );
}
